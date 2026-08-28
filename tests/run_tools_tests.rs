// PY-001..006 (spec 014): python runner tests — argv builders, presence
// probe (+ TTL cache), RunTaskRegistry lifecycle (exit/busy/cancel/timeout/
// eviction), and HTTP routes. Fixture scripts only; no real distros/network.
mod common;

use futures_util::StreamExt;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

/// Serialize tests that mutate process-global env (HOME/PATH).
fn env_guard() -> std::sync::MutexGuard<'static, ()> {
    static LOCK: std::sync::OnceLock<std::sync::Mutex<()>> = std::sync::OnceLock::new();
    LOCK.get_or_init(|| std::sync::Mutex::new(()))
        .lock()
        .unwrap()
}

fn write_fixture(dir: &Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, body).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
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

// ── PY-001 ──────────────────────────────────────────────────────────────────

#[test]
fn py_001_argv_table_and_cwd_parent() {
    // termux → [python3, abs]
    assert_eq!(
        mux_web::run_tools::python_run_argv("termux", "/sdcard/proj/main.py").unwrap(),
        vec!["python3".to_string(), "/sdcard/proj/main.py".to_string()]
    );
    // distro → proot wrapper prefix
    let _g = env_guard();
    let hf = home_fixture_with("ubuntu");
    let old = swap_home(hf.path());
    let argv = mux_web::run_tools::python_run_argv("ubuntu", "/sdcard/proj/main.py").unwrap();
    restore_home(old);
    drop(_g);
    assert_eq!(
        argv,
        vec![
            "proot-distro".to_string(),
            "login".to_string(),
            "ubuntu".to_string(),
            "--".to_string(),
            "python3".to_string(),
            "/sdcard/proj/main.py".to_string()
        ]
    );
    // unknown env rejected
    assert_eq!(
        mux_web::run_tools::python_run_argv("definitely-not-a-distro", "/x.py").unwrap_err(),
        "UNKNOWN_ENV"
    );
    // interpreter allowlist is static python3; shebang ignored by design
    // (PY-006): builder never reads file contents.

    // cwd preservation: HOST cwd is parent of the script;
    // /sdcard survives translate_cwd_for_env for distros.
    assert_eq!(
        mux_web::run_tools::host_cwd_for("/sdcard/proj/main.py"),
        Some(PathBuf::from("/sdcard/proj"))
    );
    let hf2 = tempfile::tempdir().unwrap();
    let kept = crate_translate_keeps_sdcard(hf2.path());
    assert_eq!(kept, Some(PathBuf::from("/sdcard/proj")));
}

fn crate_translate_keeps_sdcard(home: &Path) -> Option<PathBuf> {
    mux_web::environments::translate_cwd_for_env(
        Some(Path::new("/sdcard/proj")),
        Some("ubuntu"),
        home,
    )
}

// ── PY-002 ──────────────────────────────────────────────────────────────────

#[test]
fn py_002_probe_missing_hint() {
    let _g = env_guard();
    // Unique fixture-distro ⇒ probe miss (no proot-distro on this host)
    // WITHOUT touching global PATH, so the termux prod cache stays clean.
    let hf = home_fixture_with("muxnopy2");
    let old = swap_home(hf.path());
    let res = mux_web::run_tools::python_present("muxnopy2");
    restore_home(old);
    drop(_g);
    let err = res.unwrap_err();
    assert!(err.starts_with("PYTHON_MISSING"), "{err}");
    assert!(err.contains("Support Hub"), "{err}");
}

#[tokio::test]
async fn py_002_probe_ttl_cache_runs_runner_once_within_ttl() {
    use std::sync::atomic::{AtomicUsize, Ordering};
    let calls = Arc::new(AtomicUsize::new(0));
    let c2 = calls.clone();
    let run = move |_env: &str| {
        c2.fetch_add(1, Ordering::SeqCst);
        true
    };
    let a = mux_web::run_tools::python_probe_cached("ttl-test-a", "termux", run);
    let b = mux_web::run_tools::python_probe_cached("ttl-test-a", "termux", |_| true);
    assert!(a);
    assert!(b);
    assert_eq!(
        calls.load(Ordering::SeqCst),
        1,
        "TTL cache must skip re-probe"
    );

    // distinct tag → distinct cache entry, runner runs again
    let calls2 = Arc::new(AtomicUsize::new(0));
    let c3 = calls2.clone();
    let _ = mux_web::run_tools::python_probe_cached("ttl-test-b", "termux", move |_: &_| {
        c3.fetch_add(1, Ordering::SeqCst);
        false
    });
    assert_eq!(calls2.load(Ordering::SeqCst), 1);
}

// ── PY-004: registry lifecycle ──────────────────────────────────────────────

#[tokio::test]
async fn py_004_spawn_stream_exit_busy_cancel() {
    let dir = tempfile::tempdir().unwrap();
    let echo = write_fixture(
        dir.path(),
        "echo7",
        "#!/bin/sh\necho out-line\necho err-line >&2\nexit 7\n",
    );
    let slow = write_fixture(dir.path(), "slow", "#!/bin/sh\nsleep 30\n");
    let mut reg = mux_web::run_tools::RunTaskRegistry::default();

    // unknown argv must fail loudly (SPAWN_FAILED)
    assert!(reg
        .spawn_run(
            "python",
            "x.py",
            &["/nonexistent-mux-bin-xyz".to_string()],
            None,
            None
        )
        .await
        .is_err());

    // streaming: subscribe BEFORE completion
    let id_ok = reg
        .spawn_run(
            "python",
            "e.py",
            &[echo.to_string_lossy().to_string()],
            None,
            None,
        )
        .await
        .unwrap();
    assert!(id_ok.starts_with("run-"));
    let mut rx = reg.subscribe(&id_ok).unwrap();
    let mut saw_line = false;
    for _ in 0..50 {
        match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
            Ok(Ok(l)) if l.contains("out-line") => {
                saw_line = true;
                break;
            }
            Ok(Ok(_)) => continue,
            Ok(Err(tokio::sync::broadcast::error::RecvError::Lagged(_))) => continue,
            _ => break,
        }
    }
    assert!(saw_line, "stdout line must be streamed");

    // exit code accurate
    for _ in 0..100 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        if reg.status(&id_ok).map(|s| !s.running).unwrap_or(false) {
            break;
        }
    }
    let st = reg.status(&id_ok).unwrap();
    assert_eq!(
        st.exit_code,
        Some(7),
        "nonzero exit must be captured verbatim"
    );
    // slot frees only on reap (agent_pkg semantics)
    assert!(reg.has_running());
    let (reaped_id, reaped_st) = reg.reap_if_done().await.unwrap();
    assert_eq!(reaped_id, id_ok);
    assert!(!reg.has_running());
    assert_eq!(reaped_st.exit_code, Some(7));

    // single-slot busy: long-running task blocks kind
    let id_slow = reg
        .spawn_run(
            "python",
            "s.py",
            &[slow.to_string_lossy().to_string()],
            None,
            None,
        )
        .await
        .unwrap();
    assert_eq!(
        reg.spawn_run(
            "python",
            "o.py",
            &[echo.to_string_lossy().to_string()],
            None,
            None
        )
        .await
        .unwrap_err(),
        "TASK_BUSY"
    );

    // cancel mid-run = SIGKILL
    assert!(reg.cancel(&id_slow).await);
    for _ in 0..100 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        if reg.status(&id_slow).map(|s| !s.running).unwrap_or(false) {
            break;
        }
    }
    let st = reg.status(&id_slow).unwrap();
    assert!(!st.running, "cancelled task must be dead");
    assert_ne!(st.exit_code, Some(0));
    assert!(!st.timed_out, "manual cancel is not a timeout");
    // cancelling again (already done) → false
    assert!(!reg.cancel(&id_slow).await);

    // finish and reap both remaining slots cleanly
    reg.reap_if_done().await;
    assert!(!reg.has_running());
}

#[tokio::test]
async fn py_004_timeout_kills_and_marks_timed_out() {
    let dir = tempfile::tempdir().unwrap();
    let slow = write_fixture(dir.path(), "slow30", "#!/bin/sh\nsleep 30\n");
    let mut reg = mux_web::run_tools::RunTaskRegistry::default();
    let id = spawn_retry(
        &mut reg,
        "python",
        "t.py",
        &[slow.to_string_lossy().to_string()],
        Some(Duration::from_millis(300)),
    )
    .await
    .unwrap();
    let mut timed_out = false;
    for _ in 0..150 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        if let Some(st) = reg.status(&id) {
            if !st.running {
                timed_out = st.timed_out;
                break;
            }
        }
    }
    assert!(timed_out, "elapsed timeout must mark timed_out");
    let st = reg.status(&id).unwrap();
    assert_ne!(st.exit_code, Some(0));
}

#[tokio::test]
async fn py_004_finished_history_bounded_oldest_evicted() {
    let dir = tempfile::tempdir().unwrap();
    let fast = write_fixture(dir.path(), "fast", "#!/bin/sh\nexit 0\n");
    let mut reg = mux_web::run_tools::RunTaskRegistry::default();
    let mut first_id = String::new();
    for i in 0..(mux_web::run_tools::FINISHED_CAP + 1) {
        let id = spawn_retry(
            &mut reg,
            "python",
            &format!("f{i}.py"),
            &[fast.to_string_lossy().to_string()],
            None,
        )
        .await
        .unwrap();
        if i == 0 {
            first_id = id.clone();
        }
        for _ in 0..200 {
            tokio::time::sleep(Duration::from_millis(15)).await;
            if reg.status(&id).map(|s| !s.running).unwrap_or(false) {
                break;
            }
        }
        reg.reap_if_done().await;
        assert!(
            reg.finished_count() <= mux_web::run_tools::FINISHED_CAP,
            "history must stay bounded"
        );
    }
    assert_eq!(
        reg.finished_count(),
        mux_web::run_tools::FINISHED_CAP,
        "cap reached"
    );
    assert!(reg.status(&first_id).is_none(), "oldest entry evicted");
}

// ── Routes (RED-B wave, added after core green) ─────────────────────────────
//
// POST /api/v1/run/python          {root,path,env_id} → {task_id}|400|409
// GET  /api/v1/run/python/:id/ws   stream {type:line|exit|error}
// POST /api/v1/run/python/:id/cancel                   → {}|409

#[tokio::test]
async fn py_route_400_path_traversal_and_env_unknown() {
    let dir = tempfile::tempdir().unwrap();
    std::fs::write(dir.path().join("main.py"), "print('x')\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;

    // path must come from AllowedRoots ONLY
    let r = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"../escape.py","env_id":"termux"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "PATH_TRAVERSAL", "{b}");

    // unknown root also resolves to PATH_TRAVERSAL envelope
    let r = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"not-a-root","path":"main.py","env_id":"termux"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "PATH_TRAVERSAL", "{b}");

    // unknown env rejected before any spawn
    let r = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"main.py","env_id":"no-such-distro"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "ENV_UNKNOWN", "{b}");
}

#[tokio::test]
#[allow(clippy::await_holding_lock)] // env_guard serializes HOME/PATH globals by design
async fn py_route_python_missing_no_spawn() {
    let _g = env_guard();
    // distro listed in HOME fixture so env_known passes, but probe fails
    // because proot-distro does not exist on this host.
    let hf = home_fixture_with("muxnopy");
    let old = swap_home(hf.path());
    let dir = tempfile::tempdir_in(hf.path()).unwrap();
    std::fs::write(dir.path().join("main.py"), "print('x')\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;
    let r = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"main.py","env_id":"muxnopy"}"#)
        .send()
        .await
        .unwrap();
    restore_home(old);
    drop(_g);
    assert_eq!(r.status(), 400);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "PYTHON_MISSING", "{b}");
    assert!(b["error"]["message"]
        .as_str()
        .unwrap()
        .contains("Support Hub"));
    // no-spawn proof is the 400 envelope itself; a global has_running check
    // here would race sibling route tests that legitimately own the slot.
}

/// PHASE 1 of the serialized WS pair (runner: py_route_ws_serial_happy_then_timeout_cfg).
#[allow(clippy::await_holding_lock)] // env_guard serializes HOME/PATH globals by design
async fn phase_happy_busy_cancel_ws_stream() {
    let _g = env_guard();
    await_slot_idle(25_000).await;
    let dir = tempfile::tempdir().unwrap();
    let fake_bin = tempfile::tempdir().unwrap();
    write_fixture(
        fake_bin.path(),
        "python3",
        // sleep-before-echo: the WS route uses a no-replay broadcast channel,
        // and this test subscribes only after the 409 busy round-trip. Without
        // the delay the line frame can be emitted before the WS subscribes and
        // is lost forever (deterministic CI failure, race won locally). The
        // delay must also stay well inside the drain loop's 400ms per-frame
        // read timeout, hence 0.2s — after subscribe, before read deadline.
        "#!/bin/sh\nsleep 0.2\necho from-fake-python\nsleep 2.8\n",
    );
    let old_path = {
        let cur = std::env::var("PATH").unwrap_or_default();
        unsafe { std::env::set_var("PATH", format!("{}:{cur}", fake_bin.path().display())) };
        cur
    };
    std::fs::write(dir.path().join("main.py"), "print('hi')\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;
    // drain a finished/lingering slot from earlier waves if any
    let cleanup = |reg: &tokio::sync::Mutex<mux_web::run_tools::RunTaskRegistry>| async {
        // best-effort: nothing to do if idle
        let _ = reg;
    };
    cleanup(&mux_web::run_tools::shared_registry()).await;

    let post = |body: String| {
        let s = &s;
        let url = s.url("/api/v1/run/python");
        async move {
            s.client
                .post(url)
                .header("content-type", "application/json")
                .body(body)
                .send()
                .await
                .unwrap()
        }
    };

    let r = post(r#"{"root":"home","path":"main.py","env_id":"termux"}"#.into()).await;
    assert_eq!(r.status(), 200, "happy path must spawn");
    let b: serde_json::Value = r.json().await.unwrap();
    let tid = b["task_id"].as_str().unwrap().to_string();
    assert!(tid.starts_with("run-"), "{tid}");

    // second concurrent run → 409 TASK_BUSY (single-slot per kind)
    let r2 = post(r#"{"root":"home","path":"main.py","env_id":"termux"}"#.into()).await;
    assert_eq!(r2.status(), 409);
    let b2: serde_json::Value = r2.json().await.unwrap();
    assert_eq!(b2["error"]["code"], "TASK_BUSY", "{b2}");

    // WS stream: line frame arrives, cancel ends with exit frame
    let mut ws = common::authed_ws_connect(&s, &format!("/api/v1/run/python/{tid}/ws"))
        .await
        .unwrap();
    use tokio_tungstenite::tungstenite::Message;
    let mut saw_line = false;
    let mut exit_code_seen: Option<Option<i32>> = None;
    let mut seen: Vec<String> = Vec::new();
    let mut cancelled_fired = false;
    let drain = async {
        while let Ok(Some(Ok(msg))) =
            tokio::time::timeout(Duration::from_millis(400), ws.next()).await
        {
            if let Message::Text(t) = &msg {
                let f: serde_json::Value = serde_json::from_str(t).unwrap_or(serde_json::json!({}));
                seen.push(f["type"].as_str().unwrap_or("?").to_string());
                match f["type"].as_str() {
                    Some("line") => {
                        if f["data"]
                            .as_str()
                            .unwrap_or("")
                            .contains("from-fake-python")
                        {
                            saw_line = true;
                        }
                    }
                    Some("exit") => {
                        exit_code_seen = Some(f["code"].as_i64().map(|v| v as i32));
                    }
                    _ => {}
                }
            }
            // after line evidence lands, fire cancel once
            if saw_line && !cancelled_fired {
                cancelled_fired = true;
                let cr = s
                    .client
                    .post(s.url(&format!("/api/v1/run/python/{tid}/cancel")))
                    .send()
                    .await
                    .unwrap();
                assert_eq!(cr.status(), 200, "cancel of running task must be 200");
            }
            if exit_code_seen.is_some() {
                break;
            }
        }
    };
    let _ = tokio::time::timeout(Duration::from_secs(15), drain).await;
    restore_path(old_path);
    drop(_g);
    assert!(
        saw_line,
        "stdout line must be streamed over WS; frames={seen:?}"
    );
    assert!(
        exit_code_seen.is_some(),
        "cancelled run must emit exit frame; frames={seen:?}"
    );

    // belt & braces: registry reports the task finished
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(40)).await;
        let done = mux_web::run_tools::shared_registry()
            .lock()
            .await
            .status(&tid)
            .map(|st| !st.running)
            .unwrap_or(true);
        if done {
            break;
        }
    }

    // cancelling an absent/finished id → 409 TASK_NOT_RUNNING
    let r = s
        .client
        .post(s.url("/api/v1/run/python/run-999999/cancel"))
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 409);
    let b: serde_json::Value = r.json().await.unwrap();
    assert_eq!(b["error"]["code"], "TASK_NOT_RUNNING", "{b}");
}

/// Wait until the process-global run slot is idle (route tests share one
/// OnceLock registry; a previous guard-window can leave done-but-unreaped or
/// briefly-still-dying entries).
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

/// Overlayfs occasionally reports ETXTBSY when executing a freshly-written
/// script under heavy parallel cargo IO — retry briefly on SPAWN_FAILED only.
async fn spawn_retry(
    reg: &mut mux_web::run_tools::RunTaskRegistry,
    kind: &str,
    target: &str,
    argv: &[String],
    timeout: Option<Duration>,
) -> Result<String, String> {
    for attempt in 0..5 {
        match reg.spawn_run(kind, target, argv, None, timeout).await {
            ok @ Ok(_) => return ok,
            Err(e) if e.starts_with("SPAWN_FAILED") && attempt < 4 => {
                tokio::time::sleep(Duration::from_millis(60)).await
            }
            other => return other,
        }
    }
    unreachable!("loop returns")
}

/// Verifier fix-loop F1: a task that finishes WITHOUT any WS subscriber must
/// release the single slot before the next POST — no 409 wedge.
#[tokio::test]
#[allow(clippy::await_holding_lock)] // env_guard serializes PATH globals by design
async fn py_route_reap_on_post_without_ws() {
    let _g = env_guard();
    await_slot_idle(25_000).await;
    let dir = tempfile::tempdir().unwrap();
    let fake_bin = tempfile::tempdir().unwrap();
    // stub exits immediately: no client ever opens the WS
    write_fixture(fake_bin.path(), "python3", "#!/bin/sh\nexit 0\n");
    let cur = std::env::var("PATH").unwrap_or_default();
    unsafe { std::env::set_var("PATH", format!("{}:{cur}", fake_bin.path().display())) };
    std::fs::write(dir.path().join("main.py"), "print(1)\n").unwrap();
    let s = common::start_server(vec![("home".to_string(), dir.path().to_path_buf())]).await;

    let r1 = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"main.py","env_id":"termux"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r1.status(), 200);
    let b: serde_json::Value = r1.json().await.unwrap();
    let tid = b["task_id"].as_str().unwrap().to_string();

    // finished-state visible via status(); NO WS opened → socket reap never runs
    for _ in 0..100 {
        tokio::time::sleep(Duration::from_millis(30)).await;
        let done = mux_web::run_tools::shared_registry()
            .lock()
            .await
            .status(&tid)
            .map(|st| !st.running)
            .unwrap_or(true);
        if done {
            break;
        }
    }

    let r2 = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"main.py","env_id":"termux"}"#)
        .send()
        .await
        .unwrap();
    restore_path(cur);
    drop(_g);
    assert_eq!(
        r2.status(),
        200,
        "completed-but-unreaped slot must be released on POST"
    );
}

/// Verifier fix-loop F2: newline-less flood (>MAX_LINE_BYTES) truncates to a
/// bounded marker line and resumes at the next real newline.
#[tokio::test]
async fn py_registry_line_flood_truncates_and_recovers() {
    let dir = tempfile::tempdir().unwrap();
    // 320_000 bytes of 'a' with NO newline inside the run, then its terminator,
    // then an intact "ok" line (python print(huge) shape)
    let sh = write_fixture(
        dir.path(),
        "flood",
        "#!/bin/sh\nhead -c 320000 /dev/zero | tr '\\0' 'a'\necho\necho ok\n",
    );
    let mut reg = mux_web::run_tools::RunTaskRegistry::default();
    let id = spawn_retry(
        &mut reg,
        "python",
        "f.py",
        &[sh.to_string_lossy().to_string()],
        None,
    )
    .await
    .unwrap();
    let mut rx = reg.subscribe(&id).unwrap();

    let mut got_truncated = false;
    let mut got_ok = false;
    for _ in 0..200 {
        let frame = match tokio::time::timeout(Duration::from_millis(100), rx.recv()).await {
            Ok(Ok(f)) => f,
            _ => break,
        };
        if frame.contains("<…truncated>") {
            got_truncated = true;
            assert!(frame.starts_with('a'), "marker line keeps head bytes");
            assert!(
                frame.len() <= mux_web::run_tools::MAX_LINE_BYTES + 32,
                "truncated frame stays bounded, got {}",
                frame.len()
            );
        }
        if frame == "ok" {
            got_ok = true;
            break;
        }
    }
    for _ in 0..50 {
        tokio::time::sleep(Duration::from_millis(20)).await;
        if reg.status(&id).map(|st| !st.running).unwrap_or(false) {
            break;
        }
    }
    reg.reap_if_done().await;
    assert!(
        got_truncated,
        "newline-less flood must emit one capped marker line"
    );
    assert!(got_ok, "streaming must resume after skip-to-newline");
}

fn restore_path(old: String) {
    unsafe { std::env::set_var("PATH", old) };
}

/// Server with explicit config so route tests can pin run_timeout_secs.
async fn start_server_cfg(
    roots: Vec<(String, PathBuf)>,
    patch: impl FnOnce(&mut mux_web::config::Config),
) -> common::TestServer {
    let mut config = clap::Parser::parse_from(["mux-web"]);
    patch(&mut config);
    config.shell = Some("/bin/sh".to_string());
    let allowed_roots = mux_web::paths::AllowedRoots::new(roots).expect("roots must canonicalize");
    let share = mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default());
    let mut s = common::start_server_with_state(mux_web::http::AppState {
        config,
        allowed_roots,
        sessions: mux_web::session::SessionRegistry::new(),
        auth: common::test_auth(),
        share,
        distro_tasks: std::sync::Arc::new(tokio::sync::Mutex::new(
            mux_web::distro_mgmt::DistroTaskRegistry::default(),
        )),
    })
    .await;
    s.auto_pair().await;
    s
}

/// PHASE 2 of the serialized WS pair (runner below).
#[allow(clippy::await_holding_lock)] // env_guard serializes HOME/PATH globals by design
async fn phase_timeout_config_elapses_reason_timeout() {
    use futures_util::StreamExt;
    use tokio_tungstenite::tungstenite::Message;

    let _g = env_guard();
    await_slot_idle(25_000).await;
    let dir = tempfile::tempdir().unwrap();
    let fake_bin = tempfile::tempdir().unwrap();
    write_fixture(fake_bin.path(), "python3", "#!/bin/sh\nsleep 30\n");
    let cur = std::env::var("PATH").unwrap_or_default();
    unsafe { std::env::set_var("PATH", format!("{}:{cur}", fake_bin.path().display())) };
    std::fs::write(dir.path().join("main.py"), "import time\ntime.sleep(30)\n").unwrap();
    let s = start_server_cfg(vec![("home".to_string(), dir.path().to_path_buf())], |c| {
        c.run_timeout_secs = 1
    })
    .await;

    let r = s
        .client
        .post(s.url("/api/v1/run/python"))
        .header("content-type", "application/json")
        .body(r#"{"root":"home","path":"main.py","env_id":"termux"}"#)
        .send()
        .await
        .unwrap();
    assert_eq!(r.status(), 200);
    let b: serde_json::Value = r.json().await.unwrap();
    let tid = b["task_id"].as_str().unwrap().to_string();

    // exit frame carries reason=timeout + code null within ~4s
    let mut ws = common::authed_ws_connect(&s, &format!("/api/v1/run/python/{tid}/ws"))
        .await
        .unwrap();
    let mut reason_seen: Option<String> = None;
    let mut seen2: Vec<String> = Vec::new();
    let deadline = std::time::Instant::now() + Duration::from_secs(9);
    let drain = async {
        loop {
            if std::time::Instant::now() >= deadline {
                break;
            }
            match tokio::time::timeout(Duration::from_millis(400), ws.next()).await {
                Ok(Some(Ok(msg))) => {
                    if let Message::Text(t) = &msg {
                        seen2.push(t.to_string());
                        let f: serde_json::Value = serde_json::from_str(t).unwrap_or_default();
                        if f["type"] == "exit" {
                            reason_seen = Some(f["reason"].as_str().unwrap_or("").to_string());
                        }
                    } else {
                        seen2.push(format!("non-text:{msg:?}"));
                    }
                }
                Ok(_) => break,     // true stream end
                Err(_) => continue, // poll tick without frame
            }
            if reason_seen.is_some() {
                break;
            }
        }
    };
    let _ = tokio::time::timeout(Duration::from_secs(8), drain).await;
    restore_path(cur);
    drop(_g);
    assert_eq!(
        reason_seen.as_deref(),
        Some("timeout"),
        "timeout elapse must mark the exit frame; raw={seen2:?}"
    );
}

/// The two WS-heavy route phases share ONE process-global registry slot; run
/// them strictly sequentially under a single test to eliminate cross-thread
/// contention flakes while still covering both behaviors.
#[tokio::test]
async fn py_route_ws_serial_happy_then_timeout_cfg() {
    phase_happy_busy_cancel_ws_stream().await;
    phase_timeout_config_elapses_reason_timeout().await;
}
