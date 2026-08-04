use mux_web::pty::PtySession;
use mux_web::session::SessionRegistry;
use tokio::sync::mpsc;
use std::time::Duration;

#[tokio::test]
async fn test_term_003_and_005_pty_spawn_and_output() {
    let (tx, mut rx) = mpsc::channel(256);
    let pty = PtySession::new(80, 24, None, None, tx).expect("Failed to spawn PTY");

    // Write a echo command to PTY
    pty.write_input(b"echo MUX_TEST_OUTPUT\n").unwrap();

    let mut output = String::new();
    let timeout = tokio::time::sleep(Duration::from_secs(3));
    tokio::pin!(timeout);

    loop {
        tokio::select! {
            Some(bytes) = rx.recv() => {
                let text = String::from_utf8_lossy(&bytes);
                output.push_str(&text);
                if output.contains("MUX_TEST_OUTPUT") {
                    break;
                }
            }
            _ = &mut timeout => {
                panic!("Timeout waiting for PTY output. Output so far: {}", output);
            }
        }
    }

    assert!(output.contains("MUX_TEST_OUTPUT"));
    let _ = pty.kill();
}

#[tokio::test]
async fn test_life_003_session_registry_cleanup() {
    let registry = SessionRegistry::new();
    let meta = registry.create_session(80, 24, None, None).expect("Session creation failed");

    assert!(registry.get_session(&meta.id).is_some());

    registry.remove_session(&meta.id).expect("Session removal failed");
    assert!(registry.get_session(&meta.id).is_none());

    // Idempotent delete
    assert!(registry.remove_session(&meta.id).is_ok());
}
