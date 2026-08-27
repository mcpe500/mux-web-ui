// NB-001..012 (spec 014): notebook execution backend tests — argv builders,
// presence probe (+ TTL cache), side-table path handling, HTTP routes
// (execute/executed/ws/cell). Fixture scripts only; no real distros/network.
mod common;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

/// Serialize tests that mutate process-global env (PATH/HOME) or share the
/// process-global RunTaskRegistry slot — replicated from run_tools_tests.rs.
fn env_guard() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap()
}

fn restore_path(old: String) {
    unsafe { std::env::set_var("PATH", old) };
}

fn home_fixture_with(distro: &str) -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join(".proot-distro/installed-distros");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::write(base.join(distro), "").unwrap();
    dir
}

fn swap_home(new_home: &Path) -> Option<String> {
    let old = std::env::var("HOME").ok();
    unsafe { std::env::set_var("HOME", new_home) };
    old
}

fn restore_home(old: Option<String>) {
    match old {
        Some(v) => unsafe { std::env::set_var("HOME", v) },
        None => unsafe { std::env::remove_var("HOME") },
    }
}

/// Wait until the process-global run slot is idle (route tests share ONE
/// OnceLock registry; see run_tools_tests::await_slot_idle precedent).
async fn await_slot_idle(max_ms: u64) {
    for _ in 0..(max_ms / 20) {
        let reg = mux_web::run_tools::shared_registry();
        let reaped = reg.lock().await.reap_if_done().await;
        let busy = reg.lock().await.has_running() && reaped.is_none();
        if !busy {
            return;
        }
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
}

// ── NB-007: argv builders ───────────────────────────────────────────────────

#[test]
fn nb_001_jupyter_argv_table_and_tmp_name() {
    // termux → [jupyter, nbconvert, --to, notebook, --execute, --output, TMP, abs]
    let argv = mux_web::notebook_exec::jupyter_run_argv("termux", "/sdcard/proj/a.ipynb").unwrap();
    assert_eq!(argv[0], "jupyter");
    assert_eq!(
        &argv[1..7],
        &[
            "nbconvert".to_string(),
            "--to".to_string(),
            "notebook".to_string(),
            "--execute".to_string(),
            "--output".to_string(),
            ".a.ipynb.muxexec.ipynb".to_string(),
        ]
    );
    assert_eq!(argv[7], "/sdcard/proj/a.ipynb");
    // output lands next to the source (hidden sibling)
    assert_eq!(
        mux_web::notebook_exec::exec_output_tmp_name("/sdcard/proj/a.ipynb"),
        Some(PathBuf::from("/sdcard/proj/.a.ipynb.muxexec.ipynb"))
    );

    // distro → proot wrapper prefix (same tail)
    let _g = env_guard();
    let hf = home_fixture_with("ubuntu");
    let old = swap_home(hf.path());
    let argv = mux_web::notebook_exec::jupyter_run_argv("ubuntu", "/sdcard/proj/a.ipynb").unwrap();
    restore_home(old);
    drop(_g);
    assert_eq!(
        &argv[..5],
        &[
            "proot-distro".to_string(),
            "login".to_string(),
            "ubuntu".to_string(),
            "--".to_string(),
            "jupyter".to_string(),
        ]
    );

    // unknown env rejected before any spawn decision
    assert_eq!(
        mux_web::notebook_exec::jupyter_run_argv("no-such-distro-mux", "/x.ipynb").unwrap_err(),
        "UNKNOWN_ENV"
    );
}

// ── NB-006/NB-007: presence probe + hint ────────────────────────────────────

#[test]
fn nb_002_probe_missing_hint() {
    let _g = env_guard();
    let hf = home_fixture_with("muxnobj");
    let old = swap_home(hf.path());
    let res = mux_web::notebook_exec::jupyter_present("muxnobj");
    restore_home(old);
    drop(_g);
    let err = res.unwrap_err();
    assert!(err.starts_with("JUPYTER_MISSING"), "{err}");
    assert!(err.contains("Support Hub"), "{err}");
}

#[tokio::test]
async fn nb_002_probe_ttl_cache_runs_runner_once_within_ttl() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = Arc::new(AtomicUsize::new(0));
    let c2 = calls.clone();
    let a = mux_web::notebook_exec::jupyter_probe_cached("ttl-nb-a", "termux", move |_: &_| {
        c2.fetch_add(1, Ordering::SeqCst);
        true
    });
    let b = mux_web::notebook_exec::jupyter_probe_cached("ttl-nb-a", "termux", |_| true);
    assert!(a && b);
    assert_eq!(calls.load(Ordering::SeqCst), 1, "TTL must skip re-probe");

    // distinct tag ⇒ distinct cache entry (injected fakes never poison prod)
    let calls2 = Arc::new(AtomicUsize::new(0));
    let c3 = calls2.clone();
    let miss = mux_web::notebook_exec::jupyter_probe_cached("ttl-nb-b", "termux", move |_: &_| {
        c3.fetch_add(1, Ordering::SeqCst);
        false
    });
    assert!(!miss);
    assert_eq!(calls2.load(Ordering::SeqCst), 1);
}

// ── NB-007: timeout clamp (MUX_WEB_RUN_TIMEOUT_SECS max 600 for notebooks) ─

#[test]
fn nb_004_timeout_clamped_to_600s_unbounded_when_zero() {
    assert_eq!(mux_web::notebook_exec::effective_run_timeout(0), None);
    assert_eq!(
        mux_web::notebook_exec::effective_run_timeout(300),
        Some(Duration::from_secs(300))
    );
    assert_eq!(
        mux_web::notebook_exec::effective_run_timeout(9_000),
        Some(Duration::from_secs(600)),
        "config above 600 clamps down for notebook ops"
    );
}

// ── Side-table: server-side-only output path store (cap 32, LRU) ───────────

#[test]
fn nb_side_table_lru_cap_32_and_take_removes() {
    for i in 0..34 {
        mux_web::notebook_exec::remember_exec_output(&format!("t{i}"), &format!("/p/f{i}"));
    }
    // oldest two evicted by cap
    assert!(mux_web::notebook_exec::take_exec_output("t0").is_none());
    assert!(mux_web::notebook_exec::take_exec_output("t1").is_none());
    // freshest survives and is consumed exactly once (purge on retrieval)
    assert_eq!(
        mux_web::notebook_exec::take_exec_output("t33"),
        Some("/p/f33".to_string())
    );
    assert!(mux_web::notebook_exec::take_exec_output("t33").is_none());
}

// ── Cell script body (pure concat shared with FE protocol) ─────────────────

#[test]
fn nb_cell_script_body_marker_between_prefix_and_cell() {
    let body = mux_web::notebook_exec::cell_script_body("a = 1", "print(a)");
    assert_eq!(body, "a = 1\n# %% MUXCELL\nprint(a)");
}

// ── Routes ──────────────────────────────────────────────────────────────────
//
// POST /api/v1/notebooks/execute          {root,path[,env_id]} → {task_id}|400|409
// GET  /api/v1/notebooks/executed/:id     raw ipynb bytes|404
// GET  /api/v1/notebooks/:id/ws           {type:line|exit|error}
// POST /api/v1/notebooks/cell             {root,path,prefix_src,cell_src}

#[tokio::test]
async fn nb_route_400_path_traversal_execute_and_cell() {
    let dir = tempfile::tempdir().unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;

    let cell_body = |path: &str| {
        serde_json::json!({
            "root": "home",
            "path": path,
            "prefix_src": "",
            "cell_src": ""
        })
        .to_string()
    };
    for (url, body) in [
        (
            "/api/v1/notebooks/execute",
            r#"{"root":"home","path":"../escape.ipynb"}"#.to_string(),
        ),
        ("/api/v1/notebooks/cell", cell_body("../escape.ipynb")),
    ] {
        let r = s
            .client
            .post(s.url(url))
            .header("content-type", "application/json")
            .body(body)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status(), 400, "{url}");
        let b: serde_json::Value = r.json().await.unwrap();
        assert_eq!(b["error"]["code"], "PATH_TRAVERSAL", "{b}");
    }

    // unknown root resolves into the same envelope
    let r = s
        .client
        .post(s.url("/api/v1/notebooks/execute"))
        .header("content-type", "application/json")
        .body(r#"{"root":"not-a-root","path":"a.ipynb"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "PATH_TRAVERSAL", "{b}");
}

#[tokio::test]
async fn nb_route_cell_too_large_rejected_before_spawn() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("sub")).unwrap();
    std::fs::write(dir.path().join("sub/main.ipynb"), "{}\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;

    let big = "x".repeat(512 * 1024 + 1);
    let body = serde_json::json!({
        "root": "home",
        "path": "sub/main.ipynb",
        "prefix_src": "",
        "cell_src": big
    })
    .to_string();
    let r = s
        .client
        .post(s.url("/api/v1/notebooks/cell"))
        .header("content-type", "application/json")
        .body(body)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "CELL_TOO_LARGE", "{b}");
    // no-spawn proof is the 400 envelope itself; a global has_running check
    // here would race sibling route tests that legitimately own the slot.
}

/// Serialized WS-heavy phases sharing the single global run slot.
#[tokio::test]
async fn nb_route_serial_happy_execute_executed_then_cell_cleanup() {
    phase_execute_executed_happy().await;
    phase_cell_run_streams_and_cleans_tmp().await;
}

#[allow(clippy::await_holding_lock)] // env_guard serializes PATH globals by design
async fn phase_execute_executed_happy() {
    let _g = env_guard();
    await_slot_idle(25_000).await;

    let fake_bin = tempfile::tempdir().unwrap();
    // stub `jupyter` mimicking `nbconvert --output $6`: emits a line, writes
    // the output file given as its 6th argument, lingers briefly so the 409
    // busy-check stays deterministic.
    common_write_fixture(
        fake_bin.path(),
        "jupyter",
        "#!/bin/sh\necho jupyter-line\ncat > \"$6\" <<'EOF'\n{\"cells\":[]}\nEOF\nsleep 2\nexit 0\n",
    );
    let cur = std::env::var("PATH").unwrap_or_default();
    unsafe { std::env::set_var("PATH", format!("{}:{cur}", fake_bin.path().display())) };

    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("analysis.ipynb"), "{\"cells\":[]}\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;
    let post_execute = || {
        s.client
            .post(s.url("/api/v1/notebooks/execute"))
            .header("content-type", "application/json")
            .body(r#"{"root":"home","path":"analysis.ipynb","env_id":"termux"}"#.to_string())
    };

    // Overlayfs ETXTBSY on a freshly-written fixture under parallel cargo IO
    // (run_tools_tests.rs:572 precedent) — retry the POST briefly on 500.
    let mut r1 = post_execute().send().await.unwrap();
    for _ in 0..5 {
        if r1.status() == 200 || r1.status() != 500 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
        r1 = post_execute().send().await.unwrap();
    }
    assert_eq!(r1.status(), 200, "happy path must spawn");
    let b: serde_json::Value = r1.json().await.unwrap();
    let tid = b["task_id"].as_str().unwrap().to_string();
    assert!(tid.starts_with("run-"), "{tid}");

    // second concurrent execute → 409 TASK_BUSY (single-slot registry)
    let r2 = s
        .client
        .post(s.url("/api/v1/notebooks/execute"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"analysis.ipynb","env_id":"termux"}"#.to_string())
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 409);
    let b2: serde_json::Value = r2.json().await.unwrap();
    assert_eq!(b2["error"]["code"], "TASK_BUSY", "{b2}");

    // retrieval while still running → 404 NOT_READY
    let early = s
        .client
        .get(s.url(&format!("/api/v1/notebooks/executed/{tid}")))
        .send()
        .await
        .unwrap();
    assert_eq!(early.status(), 404, "unfinished task cannot be retrieved");
    let eb: serde_json::Value = early.json().await.unwrap();
    assert_eq!(eb["error"]["code"], "NOT_READY", "{eb}");

    // WS stream carries line + exit frames (new route, same socket shape)
    let mut ws = common::authed_ws_connect(&s, &format!("/api/v1/notebooks/{tid}/ws"))
        .await
        .unwrap();
    use futures_util::StreamExt;
    use tokio_tungstenite::tungstenite::Message;
    let mut saw_line = false;
    let mut saw_exit = false;
    for _ in 0..200 {
        if let Ok(Some(Ok(Message::Text(t)))) =
            tokio::time::timeout(Duration::from_millis(400), ws.next()).await
        {
            let f: serde_json::Value = serde_json::from_str(&t).unwrap_or_default();
            match f["type"].as_str() {
                Some("line") if f["data"] == "jupyter-line" => saw_line = true,
                Some("exit") => saw_exit = true,
                _ => {}
            }
        }
        if saw_line && saw_exit {
            break;
        }
    }
    assert!(saw_line, "stdout must stream over notebook WS");
    assert!(saw_exit, "terminal state must emit an exit frame");

    // executed bytes come back application/json …
    let mut got = None;
    let mut last_err = String::new();
    for _ in 0..100 {
        let r = s
            .client
            .get(s.url(&format!("/api/v1/notebooks/executed/{tid}")))
            .send()
            .await
            .unwrap();
        if r.status() == 200 {
            let ct = r
                .headers()
                .get("content-type")
                .and_then(|v| v.to_str().ok())
                .unwrap_or("")
                .to_string();
            let body = r.text().await.unwrap();
            got = Some((ct, body));
            break;
        }
        last_err = format!("{} {}", r.status(), r.text().await.unwrap_or_default());
        tokio::time::sleep(Duration::from_millis(60)).await;
    }
    if got.is_none() {
        eprintln!("DEBUG executed retries exhausted with: {last_err}");
    }
    let (ct, body) = got.expect("finished execute must expose executed bytes");
    assert!(ct.starts_with("application/json"), "{ct}");
    assert_eq!(body, "{\"cells\":[]}\n", "raw executed ipynb bytes");

    // …purged on retrieval (next fetch: stored-path gone → 404 envelope)
    let again = s
        .client
        .get(s.url(&format!("/api/v1/notebooks/executed/{tid}")))
        .send()
        .await
        .unwrap();
    assert_eq!(again.status(), 404);

    // never-seen task id → 404 too
    let ghost = s
        .client
        .get(s.url("/api/v1/notebooks/executed/run-999999"))
        .send()
        .await
        .unwrap();
    assert_eq!(ghost.status(), 404);
    let gb: serde_json::Value = ghost.json().await.unwrap();
    assert_eq!(gb["error"]["code"], "UNKNOWN_TASK", "{gb}");

    // tmp output sibling really existed next to the source
    let out_path = dir.path().join(".analysis.ipynb.muxexec.ipynb");
    // retrieval does not clean the tmp itself (documented: server-side FS
    // reuse for diff re-read); it remains readable evidence of the run.
    assert!(out_path.exists(), "hidden sibling tmp must exist");

    restore_path(cur);
    drop(_g);
}

#[allow(clippy::await_holding_lock)] // env_guard serializes PATH globals by design
async fn phase_cell_run_streams_and_cleans_tmp() {
    let _g = env_guard();
    await_slot_idle(25_000).await;

    let fake_bin = tempfile::tempdir().unwrap();
    common_write_fixture(
        fake_bin.path(),
        "python3",
        "#!/bin/sh\nprintf '%s\\n' \"$1\" >/dev/null\necho cell-line-1\necho cell-line-2\nsleep 1\nexit 0\n",
    );
    let cur = std::env::var("PATH").unwrap_or_default();
    unsafe { std::env::set_var("PATH", format!("{}:{cur}", fake_bin.path().display())) };

    let dir = tempfile::tempdir().unwrap();
    std::fs::create_dir_all(dir.path().join("proj")).unwrap();
    std::fs::write(dir.path().join("proj/main.ipynb"), "{\"cells\":[]}\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;

    let post_cell = || {
        s.client
            .post(s.url("/api/v1/notebooks/cell"))
            .header("content-type", "application/json")
            .body(r#"{"root":"home","path":"proj/main.ipynb","prefix_src":"import sys","cell_src":"print('hi')"}"#)
    };
    let mut r = post_cell().send().await.unwrap();
    for _ in 0..5 {
        if r.status() != 500 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
        r = post_cell().send().await.unwrap();
    }
    assert_eq!(r.status(), 200, "cell post must spawn");
    let b: serde_json::Value = r.json().await.unwrap();
    let tid = b["task_id"].as_str().unwrap().to_string();

    // tmp script physically written INSIDE resolved parent (proot-visible)
    let mut tmp_seen = false;
    for _ in 0..100 {
        if let Ok(entries) = std::fs::read_dir(dir.path().join("proj")) {
            if entries
                .filter_map(|e| e.ok())
                .any(|e| e.file_name().to_string_lossy().starts_with(".mux_cell_"))
            {
                tmp_seen = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(30)).await;
    }
    assert!(tmp_seen, ".mux_cell_<rand>.py must exist in parent");

    // WS: lines + exit
    let mut ws = common::authed_ws_connect(&s, &format!("/api/v1/notebooks/{tid}/ws"))
        .await
        .unwrap();
    use futures_util::StreamExt;
    use tokio_tungstenite::tungstenite::Message;
    let mut lines_seen = 0usize;
    let mut exit_code: Option<i64> = None;
    for _ in 0..200 {
        if let Ok(Some(Ok(Message::Text(t)))) =
            tokio::time::timeout(Duration::from_millis(400), ws.next()).await
        {
            let f: serde_json::Value = serde_json::from_str(&t).unwrap_or_default();
            match f["type"].as_str() {
                Some("line") if f["data"].as_str().unwrap_or("").starts_with("cell-line-") => {
                    lines_seen += 1
                }
                Some("exit") => {
                    exit_code = f["code"].as_i64();
                    break;
                }
                _ => {}
            }
        }
    }
    assert_eq!(lines_seen, 2, "both stdout lines stream");
    assert_eq!(exit_code, Some(0));

    // AFTER terminal state: tmp deleted (cleanup-on-exit-frame semantics)
    let mut cleaned = false;
    for _ in 0..250 {
        let leftover = std::fs::read_dir(dir.path().join("proj"))
            .map(|es| {
                es.filter_map(|e| e.ok())
                    .any(|e| e.file_name().to_string_lossy().starts_with(".mux_cell_"))
            })
            .unwrap_or(false);
        if !leftover {
            cleaned = true;
            break;
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    restore_path(cur);
    drop(_g);
    assert!(cleaned, ".mux_cell tmp must be unlinked after exit frame");
}

fn common_write_fixture(dir: &Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, body).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
}
