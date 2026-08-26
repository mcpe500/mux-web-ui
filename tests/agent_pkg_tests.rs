// APKG-001..007 (spec 013): agent package center tests with FAKE npm/proot
// fixtures — no real installs, no network.
mod common;

use std::path::PathBuf;

/// Fixture `npm` script: install prints lines; `--version` style checks pass;
/// uninstall prints a line. Used via PATH override in argv builders? No — the
/// builders emit literal "npm", so tests inject the fixture by spawning the
/// registry with a program override path instead (spawn_argv takes full argv).
fn write_fixture(dir: &std::path::Path, name: &str, body: &str) -> PathBuf {
    let p = dir.join(name);
    std::fs::write(&p, body).unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
}

#[test]
fn apkg_001_static_package_allowlist() {
    use mux_web::agent_pkg::npm_package;
    assert_eq!(npm_package("opencode"), Some("opencode-ai"));
    assert_eq!(
        npm_package("claude-code"),
        Some("@anthropic-ai/claude-code")
    );
    assert_eq!(npm_package("codex"), Some("@openai/codex"));
    assert_eq!(npm_package("9router"), Some("9router"));
    // antigravity is not npm-installable (spec 013 D4)
    assert_eq!(npm_package("antigravity"), None);
    // injection attempts resolve to nothing
    assert_eq!(npm_package("opencode; rm -rf /"), None);
    assert_eq!(npm_package(""), None);
}

#[test]
fn apkg_002_argv_builders_termux_and_distro() {
    use mux_web::agent_pkg::{node_check_argv, pkg_install_argv, pkg_uninstall_argv};
    // termux host: bare npm
    assert_eq!(
        pkg_install_argv("termux", "opencode").unwrap(),
        vec!["npm", "install", "-g", "opencode-ai"]
    );
    assert_eq!(
        pkg_uninstall_argv("termux", "9router").unwrap(),
        vec!["npm", "uninstall", "-g", "9router"]
    );
    assert_eq!(
        node_check_argv("termux").unwrap(),
        vec!["node", "--version"]
    );
    // unknown agent rejected
    assert_eq!(
        pkg_install_argv("termux", "nope").unwrap_err(),
        "UNKNOWN_AGENT"
    );
    // unknown env rejected
    assert_eq!(
        pkg_install_argv("definitely-not-a-distro", "codex").unwrap_err(),
        "UNKNOWN_ENV"
    );
}

/// HOME fixture so distro env validation sees an installed "ubuntu".
fn fake_home_with_ubuntu() -> tempfile::TempDir {
    let dir = tempfile::tempdir().unwrap();
    let base = dir.path().join(".proot-distro/installed-distros");
    std::fs::create_dir_all(&base).unwrap();
    std::fs::write(base.join("ubuntu"), "").unwrap();
    dir
}

#[test]
fn apkg_002_argv_builders_distro_wrapper() {
    use mux_web::agent_pkg::pkg_install_argv;
    let dir = fake_home_with_ubuntu();
    let old = std::env::var("HOME").ok();
    unsafe { std::env::set_var("HOME", dir.path()) };
    let argv = pkg_install_argv("ubuntu", "codex").unwrap();
    if let Some(v) = old {
        unsafe { std::env::set_var("HOME", v) };
    } else {
        unsafe { std::env::remove_var("HOME") };
    }
    assert_eq!(
        argv,
        vec![
            "proot-distro",
            "login",
            "ubuntu",
            "--",
            "npm",
            "install",
            "-g",
            "@openai/codex"
        ]
    );
}

/// APKG-007 + APKG-003: registry lifecycle against a fixture script —
/// success path streams lines and reaches exit code; busy guard; cancel.
#[tokio::test]
async fn apkg_007_spawn_stream_success_busy_cancel() {
    use mux_web::agent_pkg::AgentTaskRegistry;
    let dir = tempfile::tempdir().unwrap();
    let sh = write_fixture(
        dir.path(),
        "fake-npm",
        "#!/bin/sh\necho \"adding $4\"\necho \"installed $4\"\n",
    );
    let mut reg = AgentTaskRegistry::default();
    let prog = sh.to_string_lossy().to_string();
    let argv = vec![prog, "install".into(), "-g".into(), "opencode-ai".into()];

    let task_id = reg.spawn_argv("install", "opencode", &argv).await.unwrap();
    assert!(task_id.starts_with("tool-"));
    // second spawn while first runs → TASK_BUSY
    let err = reg.spawn_argv("install", "codex", &argv).await.unwrap_err();
    assert_eq!(err, "TASK_BUSY");
    assert!(reg.has_running());

    // wait for completion and reap
    let mut exit = None;
    for _ in 0..100 {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        if reg.status(&task_id).map(|s| !s.running).unwrap_or(false) {
            break;
        }
    }
    if let Some((tid, st)) = reg.reap_if_done().await {
        assert_eq!(tid, task_id);
        exit = st.exit_code;
    }
    assert_eq!(exit, Some(0));

    // cancel path: long-running fixture killed mid-flight
    let sleep_sh = write_fixture(dir.path(), "slow-npm", "#!/bin/sh\nsleep 30\n");
    let slow_argv = vec![sleep_sh.to_string_lossy().to_string()];
    let tid2 = reg
        .spawn_argv("install", "codex", &slow_argv)
        .await
        .unwrap();
    assert!(reg.cancel(&tid2).await);
    // cancelled task is finished and reports non-success
    for _ in 0..50 {
        tokio::time::sleep(std::time::Duration::from_millis(40)).await;
        if reg.status(&tid2).map(|s| !s.running).unwrap_or(false) {
            break;
        }
    }
    let st = reg.status(&tid2).unwrap();
    assert!(!st.running);
    assert_ne!(st.exit_code, Some(0));
}

/// APKG-004: node pre-check helper reports NODE_MISSING when node is absent.
#[test]
fn apkg_004_node_missing_hint() {
    // PATH stripped of any node binary → NODE_MISSING
    let old = std::env::var("PATH").ok();
    unsafe { std::env::set_var("PATH", "/nonexistent-mux-fixture") };
    let res = mux_web::agent_pkg::node_present("termux");
    match old {
        Some(v) => unsafe { std::env::set_var("PATH", v) },
        None => unsafe { std::env::remove_var("PATH") },
    }
    let err = res.unwrap_err();
    assert!(err.starts_with("NODE_MISSING"), "{err}");
}
