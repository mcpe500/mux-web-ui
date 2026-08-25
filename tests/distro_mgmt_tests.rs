// DISTRO-001..004 (spec 011): distro management tests with a FAKE
// proot-distro fixture — no real installs, no network.
mod common;

use std::path::PathBuf;
use std::process::Command;

/// Write the fixture script and return its path. argv contract:
///   list                       → catalog text
///   install <id> | remove <id> → echo lines; install sleeps (cancellable)
fn write_fixture(dir: &std::path::Path) -> PathBuf {
    let p = dir.join("fake-proot-distro");
    std::fs::write(
        &p,
        "#!/bin/sh
case \"$1\" in
  list)
    printf '  - ubuntu: Ubuntu LTS [installed]\\n'
    printf '  - alpine: Alpine [not installed]\\n'
    ;;
  install)
    echo \"downloading $2\"
    echo \"extracting $2\"
    sleep 30
    echo \"done $2\"
    ;;
  remove)
    echo \"removing $2\"
    ;;
esac
",
    )
    .unwrap();
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o755)).unwrap();
    }
    p
}

#[test]
fn distro_001_valid_id_regex() {
    use mux_web::distro_mgmt::valid_distro_id;
    for ok in ["ubuntu", "alpine3", "arch-linux"] {
        assert!(valid_distro_id(ok), "{ok}");
    }
    for bad in ["", "Ubuntu", "a_b", "-x", "a/b", "../../etc", "a b", "x.y"] {
        assert!(!valid_distro_id(bad), "{bad}");
    }
}

#[test]
fn distro_001_argv_builders() {
    use mux_web::distro_mgmt::{install_argv, remove_argv};
    assert_eq!(
        install_argv("alpine").unwrap(),
        vec![
            "proot-distro".to_string(),
            "install".to_string(),
            "alpine".to_string()
        ]
    );
    assert_eq!(
        remove_argv("alpine").unwrap(),
        vec![
            "proot-distro".to_string(),
            "remove".to_string(),
            "alpine".to_string()
        ]
    );
    assert!(install_argv("../../etc").is_none());
    assert!(remove_argv("").is_none());
}

#[test]
fn distro_001_parse_proot_list() {
    use mux_web::distro_mgmt::parse_proot_list;
    let out = "  - ubuntu: Ubuntu [installed]\n  - alpine: Alpine [not installed]\n";
    let v = parse_proot_list(out);
    assert_eq!(v, vec![("ubuntu".into(), true), ("alpine".into(), false)]);
}

#[test]
fn distro_002_catalog_available_vs_installed() {
    let tmp = tempfile::tempdir().unwrap();
    let fake = write_fixture(tmp.path());
    let cat = mux_web::distro_mgmt::catalog(Some(&fake));
    assert_eq!(cat.installed, vec!["ubuntu"]);
    assert_eq!(cat.available, vec!["alpine"]);
}

#[tokio::test]
async fn distro_002_spawn_stream_busy_cancel() {
    let tmp = tempfile::tempdir().unwrap();
    let fake = write_fixture(tmp.path());
    let mut reg =
        mux_web::distro_mgmt::DistroTaskRegistry::default().with_program(fake.to_str().unwrap());

    // membership gate: only ids from the official list
    assert_eq!(
        reg.spawn("install", "notindist", &["alpine".to_string()])
            .await,
        Err("UNKNOWN_DISTRO".into())
    );

    let task = reg
        .spawn("install", "alpine", &["alpine".to_string()])
        .await
        .unwrap();
    assert!(reg.has_running());

    // busy guard while the first task runs (same single slot)
    assert_eq!(
        reg.spawn("install", "alpine", &["alpine".to_string()])
            .await,
        Err("TASK_BUSY".into())
    );

    // live output lines arrive on the broadcast channel
    let mut rx = reg.subscribe(&task).unwrap();
    let mut seen = Vec::new();
    for _ in 0..2 {
        if let Ok(l) = rx.recv().await {
            seen.push(l);
        }
    }
    assert_eq!(seen, vec!["downloading alpine", "extracting alpine"]);

    // cancel kills the sleeping child quickly
    assert!(reg.cancel(&task).await);
    let mut st_running = true;
    for _ in 0..40 {
        if let Some(st) = reg.status(&task) {
            st_running = st.running;
            if !st.running && st.exit_code.is_some() {
                assert_ne!(st.exit_code, Some(0), "killed task must not exit cleanly");
                break;
            }
        }
        tokio::time::sleep(std::time::Duration::from_millis(120)).await;
    }
    assert!(!st_running, "task must report not-running after cancel");
}

// helper removed: busy-guard uses the same registry instance directly

/// DISTRO-002/004 end-to-end over HTTP: POST install → 409 TASK_BUSY on the
/// second call → DELETE cancels. Uses the shared AppState from the router.
#[tokio::test]
async fn distro_004_http_install_busy_guard() {
    let tmp = tempfile::tempdir().unwrap();
    let fake = write_fixture(tmp.path());
    let roots = vec![("home".to_string(), tmp.path().join("root"))];
    std::fs::create_dir_all(tmp.path().join("root")).unwrap();

    let config = {
        use clap::Parser as _;
        mux_web::config::Config::try_parse_from(["mux-web"]).unwrap()
    };
    let state = mux_web::http::AppState {
        allowed_roots: mux_web::paths::AllowedRoots::new(roots).unwrap(),
        sessions: mux_web::session::SessionRegistry::new(),
        auth: mux_web::auth::AuthState::with_secret(
            mux_web::auth::AuthConfig::default(),
            common::TEST_SECRET,
        ),
        share: mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default()),
        config,
        distro_tasks: std::sync::Arc::new(tokio::sync::Mutex::new(
            mux_web::distro_mgmt::DistroTaskRegistry::default()
                .with_program(fake.to_str().unwrap()),
        )),
    };
    let mut server = common::start_server_with_state(state).await;
    server.auto_pair().await;

    // first POST starts a task
    let r1 = server
        .client
        .post(server.url("/api/v1/environments/alpine/install"))
        .send()
        .await
        .unwrap();
    assert_eq!(r1.status(), 200);
    let task_id = r1.json::<serde_json::Value>().await.unwrap()["task_id"]
        .as_str()
        .unwrap()
        .to_string();

    // second POST while running → 409 TASK_BUSY
    let r2 = server
        .client
        .post(server.url("/api/v1/environments/alpine/install"))
        .send()
        .await
        .unwrap();
    assert_eq!(r2.status(), 409);
    assert_eq!(
        r2.json::<serde_json::Value>().await.unwrap()["error"]["code"],
        "TASK_BUSY"
    );

    // unknown id rejected by membership gate
    let r3 = server
        .client
        .post(server.url("/api/v1/environments/nodistro/remove"))
        .send()
        .await
        .unwrap();
    assert_eq!(r3.status(), 400);

    // cancel stops it; no orphan process remains (LIFE-002 spirit)
    let rd = server
        .client
        .delete(server.url(&format!("/api/v1/environments/tasks/{task_id}")))
        .send()
        .await
        .unwrap();
    assert_eq!(rd.status(), 204);
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    let ps = Command::new("sh")
        .arg("-c")
        .arg("ps -eo args | grep -c '[f]ake-proot-distro'")
        .output()
        .unwrap();
    let n: i32 = String::from_utf8_lossy(&ps.stdout)
        .trim()
        .parse()
        .unwrap_or(0);
    assert_eq!(n, 0, "fake proot-distro must not survive cancel");
    server.shutdown().await;
}
