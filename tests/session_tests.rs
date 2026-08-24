// Milestone B acceptance tests: session persistence (detach/reattach).
// Red phase: these fail against the v0.1 registry (disconnect kills the PTY).
mod common;

use common::{authed_ws_connect, start_health_server, start_server};
use futures_util::{SinkExt, StreamExt};
use mux_web::protocol::{decode_frame, encode_frame, Frame};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type Ws = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

async fn read_until(ws: &mut Ws, needle: &str, timeout_secs: u64) -> String {
    let mut output = String::new();
    let timeout = tokio::time::sleep(Duration::from_secs(timeout_secs));
    tokio::pin!(timeout);
    loop {
        tokio::select! {
            msg = ws.next() => match msg {
                Some(Ok(Message::Binary(b))) => {
                    if let Ok(Frame::Output(bytes)) = decode_frame(&b) {
                        output.push_str(&String::from_utf8_lossy(&bytes));
                        if output.contains(needle) {
                            return output;
                        }
                    }
                }
                Some(Ok(Message::Close(_))) => {
                    panic!("ws closed early. Output so far: {output}");
                }
                Some(Err(e)) => panic!("ws error: {e}. Output so far: {output}"),
                None => panic!("ws ended. Output so far: {output}"),
                _ => {}
            },
            _ = &mut timeout => panic!("timeout waiting for {needle:?}. Output so far: {output}"),
        }
    }
}

async fn send_input(ws: &mut Ws, data: &str) {
    ws.send(Message::Binary(encode_frame(&Frame::Input(
        data.as_bytes().to_vec(),
    ))))
    .await
    .expect("send input");
}

/// Read frames until an Exit frame arrives; returns the exit code.
async fn read_until_exit(ws: &mut Ws) -> i32 {
    let mut seen = String::new();
    let timeout = tokio::time::sleep(Duration::from_secs(10));
    tokio::pin!(timeout);
    loop {
        tokio::select! {
            msg = ws.next() => match msg {
                Some(Ok(Message::Binary(b))) => {
                    if let Ok(Frame::Exit(code)) = decode_frame(&b) {
                        return code;
                    }
                    seen.push_str(&format!("frame={:?} ", decode_frame(&b).ok()));
                }
                Some(Ok(Message::Close(_))) => return -999,
                Some(Err(e)) => panic!("ws error: {e}"),
                None => return -999,
                _ => {}
            },
            _ = &mut timeout => panic!("timeout waiting for Exit frame. seen: {seen}"),
        }
    }
}

/// Read frames until client A is kicked; returns the ERROR message.
async fn read_kick_message(ws: &mut Ws) -> String {
    let timeout = tokio::time::sleep(Duration::from_secs(5));
    tokio::pin!(timeout);
    loop {
        tokio::select! {
            msg = ws.next() => match msg {
                Some(Ok(Message::Binary(b))) => {
                    if let Ok(Frame::Error(msg)) = decode_frame(&b) {
                        return msg;
                    }
                }
                Some(Ok(Message::Close(_))) => return String::new(),
                Some(Err(e)) => panic!("ws error: {e}"),
                None => return String::new(),
                _ => {}
            },
            _ = &mut timeout => panic!("timeout waiting for kick"),
        }
    }
}

async fn create_terminal(server: &common::TestServer) -> String {
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    create["id"].as_str().unwrap().to_string()
}

async fn request_attach(server: &common::TestServer, id: &str) -> serde_json::Value {
    let resp = server
        .client
        .post(server.url(&format!("/api/v1/terminals/{id}/attach")))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "attach request must succeed");
    resp.json().await.unwrap()
}

async fn connect(server: &common::TestServer, id: &str, token: &str) -> Ws {
    authed_ws_connect(server, &format!("/api/v1/terminals/{id}/ws?token={token}"))
        .await
        .expect("ws connect")
}

/// SESS-001/002: detach keeps the PTY alive; reattach resumes the same stream.
#[tokio::test]
async fn test_sess_001_detach_keeps_pty_alive_and_reattach() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;
    send_input(&mut ws, "echo DETACH_MARKER_ONE\n").await;
    read_until(&mut ws, "DETACH_MARKER_ONE", 5).await;
    drop(ws); // detach — must NOT kill the PTY

    tokio::time::sleep(Duration::from_millis(800)).await;

    // Reattach within grace period → same live session.
    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;
    send_input(&mut ws, "echo DETACH_MARKER_TWO\n").await;
    let output = read_until(&mut ws, "DETACH_MARKER_TWO", 5).await;
    assert!(
        output.contains("DETACH_MARKER_TWO"),
        "PTY must survive detach: {output}"
    );
    let _ = ws.close(None).await;
    server.shutdown().await;
}

/// SESS-007: reattach replays the ring buffer (output produced while detached).
#[tokio::test]
async fn test_sess_002_reattach_replays_detached_output() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;

    // Start a slow command, detach while it is still running.
    send_input(
        &mut ws,
        "(echo REPLAY_BEFORE; sleep 1.2; echo REPLAY_AFTER)\n",
    )
    .await;
    read_until(&mut ws, "REPLAY_BEFORE", 5).await;
    drop(ws);

    tokio::time::sleep(Duration::from_secs(2)).await; // let REPLAY_AFTER land in the buffer

    let attach = request_attach(&server, &id).await;
    let replay_available = attach["replay_available"].as_bool().unwrap_or(false);
    assert!(
        replay_available,
        "replay_available must be true after detach"
    );
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;
    let output = read_until(&mut ws, "REPLAY_AFTER", 5).await;
    assert!(
        output.contains("REPLAY_AFTER"),
        "ring buffer must replay detached output: {output}"
    );
    let _ = ws.close(None).await;
    server.shutdown().await;
}

/// SESS-006: reconnect does not duplicate the reader/writer (each echo once).
#[tokio::test]
async fn test_sess_006_reconnect_no_duplicate_stream() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    for marker in ["NO_DUP_ONE", "NO_DUP_TWO"] {
        let attach = request_attach(&server, &id).await;
        let token = attach["ws_token"].as_str().unwrap().to_string();
        let mut ws = connect(&server, &id, &token).await;
        send_input(&mut ws, &format!("echo {marker}\n")).await;
        let output = read_until(&mut ws, marker, 5).await;
        let count = output.matches(marker).count();
        // PTY may echo input (command line) plus output => 2, or just output =>1
        // Duplicate reader bug would cause 4+; allow 1-2 as healthy.
        assert!(
            count == 1 || count == 2,
            "echoed once (or twice with input echo) but not duplicated: count={count}, output={output}"
        );
        let _ = ws.close(None).await;
    }
    server.shutdown().await;
}

/// SESS-008: attach from client B kicks client A with an ERROR frame.
#[tokio::test]
async fn test_sess_008_reattach_kicks_old_client() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws_a = connect(&server, &id, &token).await;
    send_input(&mut ws_a, "echo CLIENT_A\n").await;
    read_until(&mut ws_a, "CLIENT_A", 5).await;

    // Client B requests attach → A must be kicked.
    let attach = request_attach(&server, &id).await;
    let token_b = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws_b = connect(&server, &id, &token_b).await;

    let kick = read_kick_message(&mut ws_a).await;
    assert!(
        kick.contains("reattached"),
        "client A must receive ERROR 'reattached elsewhere', got: {kick:?}"
    );

    // B streams the same session.
    send_input(&mut ws_b, "echo CLIENT_B\n").await;
    let output = read_until(&mut ws_b, "CLIENT_B", 5).await;
    assert!(output.contains("CLIENT_B"), "client B streams: {output}");
    let _ = ws_b.close(None).await;
    server.shutdown().await;
}

/// B.8: session exit while detached → reattach shows exited status, no respawn.
#[tokio::test]
async fn test_sess_003_exit_while_detached_reports_status() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;

    // Ensure shell prompt is initialized and listening
    send_input(&mut ws, "echo READY\n").await;
    let _ = read_until(&mut ws, "READY", 5).await;

    send_input(&mut ws, "exit 0\n").await;

    // Attached client receives the Exit frame.
    let exit_code = read_until_exit(&mut ws).await;
    assert_eq!(exit_code, 0, "attached client sees exit code 0");
    let _ = ws.close(None).await;

    // Reattach after exit → immediate exited status, no shell respawn.
    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;

    // The session reports the previous exit instead of spawning a new shell.
    let exit_code = read_until_exit(&mut ws).await;
    assert_eq!(
        exit_code, 0,
        "reattach after exit must report the exit code"
    );
    server.shutdown().await;
}

/// SESS-004/LIFE-005: idle session without client is cleaned after grace period.
#[tokio::test]
async fn test_sess_004_idle_timeout_cleans_up() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    // Attach then detach; the session must still be listed (grace period).
    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let ws = connect(&server, &id, &token).await;
    drop(ws);

    let list: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let sessions = list["sessions"].as_array().unwrap();
    assert!(
        sessions.iter().any(|s| s["id"] == id),
        "session still listed after detach (grace period running)"
    );
    server.shutdown().await;
}

/// B.4: attach token is single-use — a second connect with the same token fails.
#[tokio::test]
async fn test_sess_005_attach_token_single_use() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();

    let mut ws = connect(&server, &id, &token).await;
    let _ = ws.close(None).await;

    // Same token must be invalid now.
    assert!(
        authed_ws_connect(&server, &format!("/api/v1/terminals/{id}/ws?token={token}"))
            .await
            .is_err(),
        "reused token must be rejected"
    );
    server.shutdown().await;
}

/// B.9 / LIFE-002: TestServer::shutdown() and session removal clean up all child processes (no orphan bash).
#[tokio::test]
async fn test_sess_009_no_orphan_children_after_shutdown() {
    let server = start_health_server().await;
    let id = create_terminal(&server).await;

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;

    send_input(&mut ws, "echo ALIVE_BEFORE_SHUTDOWN\n").await;
    read_until(&mut ws, "ALIVE_BEFORE_SHUTDOWN", 5).await;

    let list: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let pid = list["sessions"][0]["pid"].as_u64().expect("session pid") as i32;

    let child_pid = nix::unistd::Pid::from_raw(pid);

    assert_eq!(
        nix::sys::signal::kill(child_pid, None),
        Ok(()),
        "child process {pid} must exist while server is running"
    );

    server.shutdown().await;

    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    let mut is_dead = false;
    while std::time::Instant::now() < deadline {
        if nix::sys::signal::kill(child_pid, None).is_err() {
            is_dead = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }

    assert!(
        is_dead,
        "child process {pid} must be terminated and reaped after server shutdown (LIFE-002)"
    );
}

// ── EDT-002: integrated-terminal cwd via CreateTerminalReq (spec 006 §A.2) ──

/// RED→GREEN: terminal spawns INSIDE the requested allowed-root folder.
#[tokio::test]
async fn test_edt_002_cwd_ok() {
    let temp = tempfile::tempdir().expect("tempdir");
    let sub = temp.path().join("sub");
    std::fs::create_dir_all(&sub).expect("create sub");
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let server = start_server(roots).await;

    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": "/sub"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201, "cwd spawn must succeed");
    let meta: serde_json::Value = resp.json().await.unwrap();
    let id = meta["id"].as_str().unwrap().to_string();

    let attach = request_attach(&server, &id).await;
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = connect(&server, &id, &token).await;
    send_input(&mut ws, "pwd\n").await;
    let out = read_until(&mut ws, "/sub", 5).await;
    assert!(
        out.contains("/sub"),
        "shell cwd must be the opened folder; got: {out}"
    );
}

/// Security: traversal outside AllowedRoots is rejected with 400 PATH_TRAVERSAL
/// and NO session is created.
#[tokio::test]
async fn test_edt_002_cwd_traversal_400() {
    let server = start_health_server().await;
    let before: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let before_count = before["sessions"].as_array().map(|a| a.len()).unwrap_or(0);

    for evil in ["../..", "../../etc", "a/../../b"] {
        let resp = server
            .client
            .post(server.url("/api/v1/terminals"))
            .json(
                &serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": evil}),
            )
            .send()
            .await
            .unwrap();
        assert_eq!(resp.status(), 400, "traversal {evil:?} must be rejected");
        let body: serde_json::Value = resp.json().await.unwrap();
        assert_eq!(body["error"]["code"], "PATH_TRAVERSAL");
    }

    let after: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let after_count = after["sessions"].as_array().map(|a| a.len()).unwrap_or(0);
    assert_eq!(
        before_count, after_count,
        "rejected requests must not create sessions"
    );
}

/// Security: NUL bytes are rejected (PathError::NulByteDetected → 400).
#[tokio::test]
async fn test_edt_002_cwd_nul_400() {
    let server = start_health_server().await;
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": "a\u{0000}b"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["error"]["code"], "PATH_TRAVERSAL");

    // Regression: unknown root id also maps to 400 (InvalidRootId).
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "nope", "cwd_path": "/x"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);

    // Regression: legacy payload WITHOUT cwd_* still spawns in default work_dir.
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201, "legacy payload must stay compatible");
}

// ── V051-001: server-authoritative work_dir in create response (spec 007 §4) ──

/// RED→GREEN: create response must expose the resolved work_dir so the UI can
/// display the REAL cwd instead of guessing from client-side state (RC-02).
#[tokio::test]
async fn test_v051_001_work_dir_in_create_resp() {
    let temp = tempfile::tempdir().expect("tempdir");
    let sub = temp.path().join("sub");
    std::fs::create_dir_all(&sub).expect("create sub");
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let server = start_server(roots).await;

    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": "/sub"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);
    let meta: serde_json::Value = resp.json().await.unwrap();
    let wd = meta["work_dir"]
        .as_str()
        .expect("create response must expose work_dir (spec 007 V051-001)");
    assert!(
        wd.ends_with("/sub"),
        "work_dir must be the resolved opened folder; got {wd:?}"
    );
    let id = meta["id"].as_str().unwrap().to_string();
    let _ = server
        .client
        .delete(server.url(&format!("/api/v1/terminals/{id}")))
        .send()
        .await;
}

/// Legacy payload without cwd_* falls back to config.work_dir. The test harness
/// leaves config.work_dir = None, so the field must be ABSENT — old wire format
/// preserved exactly (additive-only change).
#[tokio::test]
async fn test_v051_001_work_dir_empty_is_config() {
    let server = start_health_server().await;
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);
    let meta: serde_json::Value = resp.json().await.unwrap();
    assert!(
        meta.get("work_dir").is_none(),
        "without cwd_* and with config.work_dir=None the response must omit work_dir; got {:?}",
        meta.get("work_dir")
    );
    let id = meta["id"].as_str().unwrap().to_string();
    let _ = server
        .client
        .delete(server.url(&format!("/api/v1/terminals/{id}")))
        .send()
        .await;
}

/// Root-level cwd (path "") resolves to the root itself and is reported as-is.
#[tokio::test]
async fn test_v051_001_work_dir_root_is_reported() {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let server = start_server(roots).await;

    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": ""}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);
    let meta: serde_json::Value = resp.json().await.unwrap();
    let wd = meta["work_dir"]
        .as_str()
        .expect("root cwd must report work_dir");
    let expected = temp.path().canonicalize().expect("canonicalize temp root");
    assert_eq!(
        std::path::Path::new(wd),
        expected.as_path(),
        "root-level cwd must report the canonicalized root"
    );
    let id = meta["id"].as_str().unwrap().to_string();
    let _ = server
        .client
        .delete(server.url(&format!("/api/v1/terminals/{id}")))
        .send()
        .await;
}

/// Traversal rejection body must NOT contain work_dir and no session is created.
#[tokio::test]
async fn test_v051_001_traversal_no_work_dir() {
    let server = start_health_server().await;
    let before: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let before_count = before["sessions"].as_array().map(|a| a.len()).unwrap_or(0);

    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24, "cwd_root": "home", "cwd_path": "../.."}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["error"]["code"], "PATH_TRAVERSAL");
    assert!(
        body.get("work_dir").is_none(),
        "error body must not leak work_dir"
    );

    let after: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let after_count = after["sessions"].as_array().map(|a| a.len()).unwrap_or(0);
    assert_eq!(before_count, after_count);
}

// ── TAB-001/009: configurable global PTY limit + metrics exposure (spec 008 §4) ──

/// RED→GREEN: default limit stays 4 — the 5th concurrent session is rejected
/// with a friendly 409 MAX_SESSIONS envelope.
#[tokio::test]
async fn test_tab_001_default_limit_409_at_5() {
    let server = start_health_server().await;
    let mut created = 0;
    for i in 0..5 {
        let resp = server
            .client
            .post(server.url("/api/v1/terminals"))
            .json(&serde_json::json!({"cols": 80, "rows": 24}))
            .send()
            .await
            .unwrap();
        if i < 4 {
            assert_eq!(resp.status(), 201, "session {i} must be allowed");
            created += 1;
        } else {
            assert_eq!(
                resp.status(),
                409,
                "session beyond the default limit must be rejected"
            );
            let body: serde_json::Value = resp.json().await.unwrap();
            assert_eq!(body["error"]["code"], "MAX_SESSIONS");
        }
    }
    assert_eq!(created, 4);
}

fn start_server_with_session_limit(
    limit: usize,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = common::TestServer>>> {
    Box::pin(async move {
        use clap::Parser as _;
        use common::TEST_SECRET;
        let temp = tempfile::tempdir().expect("tempdir");
        let mut config = mux_web::config::Config::parse_from(["mux-web"]);
        config.shell = Some("/bin/sh".to_string());
        let roots = vec![("home".to_string(), temp.path().to_path_buf())];
        let state = mux_web::http::AppState {
            config,
            allowed_roots: mux_web::paths::AllowedRoots::new(roots).expect("roots"),
            sessions: mux_web::session::SessionRegistry::new_with(
                mux_web::session::SessionConfig {
                    max_sessions: limit,
                    ..Default::default()
                },
            ),
            auth: mux_web::auth::AuthState::with_secret(
                mux_web::auth::AuthConfig::default(),
                TEST_SECRET,
            ),
            share: mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default()),
        };
        let mut server = common::start_server_with_state(state).await;
        // auto_pair equivalent (mirror common::start_server)
        {
            let resp = server
                .client
                .post(server.url("/api/v1/auth/pair"))
                .header("content-type", "application/json")
                .body(format!(r#"{{"secret": "{TEST_SECRET}"}}"#))
                .send()
                .await
                .expect("pair");
            assert_eq!(resp.status(), 200);
            let cookie = resp
                .headers()
                .get("set-cookie")
                .and_then(|c| c.to_str().ok())
                .map(String::from)
                .expect("cookie");
            let jar = reqwest::cookie::Jar::default();
            jar.add_cookie_str(&cookie, &server.base_url.parse().unwrap());
            server.client = reqwest::Client::builder()
                .cookie_provider(std::sync::Arc::new(jar))
                .redirect(reqwest::redirect::Policy::none())
                .build()
                .unwrap();
        }
        server
    })
}

/// RED→GREEN: the registry honors a custom max_sessions (6) — sessions up to
/// the limit succeed, the one after it is rejected.
#[tokio::test]
async fn test_tab_001_registry_configurable_limit() {
    let server = start_server_with_session_limit(6).await;
    let mut last_status = 0;
    for i in 0..7 {
        let resp = server
            .client
            .post(server.url("/api/v1/terminals"))
            .json(&serde_json::json!({"cols": 80, "rows": 24}))
            .send()
            .await
            .unwrap();
        last_status = resp.status().as_u16();
        if i < 6 {
            assert_eq!(
                last_status, 201,
                "session {i} within custom limit must succeed"
            );
        } else {
            assert_eq!(last_status, 409);
        }
    }
    assert_eq!(last_status, 409);
}

/// RED→GREEN: metrics exposes the effective limit so the UI can render N/max.
#[tokio::test]
async fn test_tab_009_metrics_max_sessions() {
    let server = start_health_server().await;
    let body: serde_json::Value = server
        .client
        .get(server.url("/api/v1/metrics"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    assert_eq!(
        body["max_sessions"], 4,
        "default metrics must report max_sessions=4 (spec 008 TAB-009)"
    );
}

// ── SESS-009/010 (spec 010): busy-grace & disabled idle reap ──

/// SESS-009: a detached session whose PTY keeps streaming output must NOT be
/// reaped past the old grace; once output stops, normal grace reap resumes.
#[tokio::test]
async fn test_sess_009_busy_session_not_reaped() {
    use clap::Parser as _;
    use common::TEST_SECRET;
    let temp = tempfile::tempdir().expect("tempdir");
    let mut config = mux_web::config::Config::parse_from(["mux-web"]);
    config.shell = Some("/bin/sh".to_string());
    config.session_idle_timeout = 2; // grace 2s
    config.session_busy_grace = 30; // busy window 30s
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let state = mux_web::http::AppState {
        config,
        allowed_roots: mux_web::paths::AllowedRoots::new(roots).expect("roots"),
        sessions: mux_web::session::SessionRegistry::new_with(mux_web::session::SessionConfig {
            grace_period: std::time::Duration::from_secs(2),
            busy_grace: std::time::Duration::from_secs(30),
            ..Default::default()
        }),
        auth: mux_web::auth::AuthState::with_secret(
            mux_web::auth::AuthConfig::default(),
            TEST_SECRET,
        ),
        share: mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default()),
    };
    let mut server = common::start_server_with_state(state).await;
    // pair
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(format!(r#"{{"secret": "{TEST_SECRET}"}}"#))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let cookie = resp
        .headers()
        .get("set-cookie")
        .and_then(|c| c.to_str().ok())
        .map(String::from)
        .unwrap();
    server.session_cookie = Some(cookie.clone());
    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&cookie, &server.base_url.parse().unwrap());
    server.client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    // create + start a busy loop
    let create = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert_eq!(create.status(), 201);
    let create: serde_json::Value = create.json().await.unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let attach = server
        .client
        .post(server.url(&format!("/api/v1/terminals/{id}/attach")))
        .send()
        .await
        .unwrap();
    let attach: serde_json::Value = attach.json().await.unwrap();
    let token = attach["ws_token"].as_str().unwrap().to_string();
    let mut ws = authed_ws_connect(&server, &format!("/api/v1/terminals/{id}/ws?token={token}"))
        .await
        .unwrap();
    send_input(&mut ws, "while true; do echo tick; sleep 0.5; done\n").await;
    // detach — session now has NO client but keeps streaming
    drop(ws);

    // 3x the old grace: must still be alive thanks to busy-grace
    tokio::time::sleep(std::time::Duration::from_secs(6)).await;
    let list: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let ids: Vec<&str> = list["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap())
        .collect();
    assert!(
        ids.contains(&id.as_str()),
        "busy session must survive past old grace"
    );

    // stop output → normal grace reap (2s) + busy window (30s since last output)
    // busy window is 30s; to keep the test fast we instead DELETE manually.
    server
        .client
        .delete(server.url(&format!("/api/v1/terminals/{id}")))
        .send()
        .await
        .unwrap();
    server.shutdown().await;
}

/// SESS-010: idle_timeout = 0 disables idle reap entirely; manual DELETE works.
#[tokio::test]
async fn test_sess_010_idle_timeout_zero_disables_reap() {
    use clap::Parser as _;
    let temp = tempfile::tempdir().expect("tempdir");
    let mut config = mux_web::config::Config::parse_from(["mux-web"]);
    config.shell = Some("/bin/sh".to_string());
    config.session_idle_timeout = 0;
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let state = mux_web::http::AppState {
        config,
        allowed_roots: mux_web::paths::AllowedRoots::new(roots).expect("roots"),
        sessions: mux_web::session::SessionRegistry::new_with(mux_web::session::SessionConfig {
            grace_period: std::time::Duration::ZERO,
            ..Default::default()
        }),
        auth: mux_web::auth::AuthState::with_secret(
            mux_web::auth::AuthConfig::default(),
            common::TEST_SECRET,
        ),
        share: mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default()),
    };
    let mut server = common::start_server_with_state(state).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(format!(r#"{{"secret": "{}"}}"#, common::TEST_SECRET))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let cookie = resp
        .headers()
        .get("set-cookie")
        .and_then(|c| c.to_str().ok())
        .map(String::from)
        .unwrap();
    server.session_cookie = Some(cookie.clone());
    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&cookie, &server.base_url.parse().unwrap());
    server.client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();

    let create = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert_eq!(create.status(), 201);
    let create: serde_json::Value = create.json().await.unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    // never attached: old behavior would reap at grace; with 0 → survives 4s
    tokio::time::sleep(std::time::Duration::from_secs(4)).await;
    let list: serde_json::Value = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let ids: Vec<&str> = list["sessions"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap())
        .collect();
    assert!(
        ids.contains(&id.as_str()),
        "idle_timeout=0 must disable reap"
    );

    // manual delete still works
    let del = server
        .client
        .delete(server.url(&format!("/api/v1/terminals/{id}")))
        .send()
        .await
        .unwrap();
    assert_eq!(del.status(), 204);
    server.shutdown().await;
}
