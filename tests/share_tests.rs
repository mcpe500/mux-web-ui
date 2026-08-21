mod common;

use common::start_health_server;
use futures_util::{SinkExt, StreamExt};
use mux_web::protocol::{decode_frame, encode_frame, Frame};
use tokio_tungstenite::tungstenite::Message;

#[tokio::test]
async fn test_shr_001_create_share_token_csp_rng() {
    let server = start_health_server().await;
    // Create a terminal to share
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols":80,"rows":24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({
            "target_type": "terminal",
            "target_id": id,
            "ttl_seconds": 3600
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201, "share create should be 201");
    let body: serde_json::Value = resp.json().await.unwrap();
    let token = body["share_token"].as_str().unwrap();
    assert_eq!(token.len(), 64, "256-bit hex = 64 chars");
    assert!(token.chars().all(|c| c.is_ascii_hexdigit()));
    // Second token must be different
    let resp2 = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({"target_type":"terminal","target_id":id,"ttl_seconds":3600}))
        .send()
        .await
        .unwrap();
    let token2 = resp2.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();
    assert_ne!(token, token2);

    server.shutdown().await;
}

#[tokio::test]
async fn test_shr_002_expired_token_rejected() {
    let server = start_health_server().await;
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols":80,"rows":24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({"target_type":"terminal","target_id":id,"ttl_seconds":1}))
        .send()
        .await
        .unwrap();
    let token = resp.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();

    // Valid immediately
    let resp = server
        .client
        .get(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    tokio::time::sleep(std::time::Duration::from_millis(1200)).await;
    let resp = server
        .client
        .get(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404, "expired token should be 404");

    server.shutdown().await;
}

#[tokio::test]
async fn test_shr_003_terminal_share_drops_input() {
    let server = start_health_server().await;
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols":80,"rows":24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({"target_type":"terminal","target_id":id}))
        .send()
        .await
        .unwrap();
    let token = resp.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();

    // Connect to share WS (read-only)
    let ws_url = format!(
        "{}/api/v1/share/ws/terminal/{}",
        server.base_url.replace("http://", "ws://"),
        token
    );
    // Need to use direct tungstenite without auth cookie? Share WS doesn't require auth
    let (mut ws, _) = tokio_tungstenite::connect_async(ws_url)
        .await
        .expect("share ws connect");

    // Try to send Input frame — should be dropped, not forwarded to PTY
    ws.send(Message::Binary(encode_frame(&Frame::Input(
        b"echo SHOULD_NOT_APPEAR\n".to_vec(),
    ))))
    .await
    .unwrap();
    // Give time, then check that PTY didn't receive it by creating a normal attach and checking output
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    // The share WS should still be open and not have echoed input
    // We check that we didn't get Output containing SHOULD_NOT_APPEAR via share WS (should be none or unrelated)
    // Use timeout to ensure no output with that string
    let timeout = tokio::time::sleep(std::time::Duration::from_millis(500));
    tokio::pin!(timeout);
    let mut got_unexpected = false;
    loop {
        tokio::select! {
            msg = ws.next() => {
                if let Some(Ok(Message::Binary(b))) = msg {
                    if let Ok(Frame::Output(bytes)) = decode_frame(&b) {
                        if String::from_utf8_lossy(&bytes).contains("SHOULD_NOT_APPEAR") {
                            got_unexpected = true;
                            break;
                        }
                    }
                } else if msg.is_none() {
                    break;
                }
            },
            _ = &mut timeout => break,
        }
    }
    assert!(!got_unexpected, "share WS must drop Input frames (SHR-003)");

    let _ = ws.close(None).await;
    server.shutdown().await;
}

#[tokio::test]
async fn test_shr_004_file_share_readonly() {
    let temp = tempfile::tempdir().unwrap();
    let file_path = temp.path().join("secret.txt");
    std::fs::write(&file_path, b"secret content").unwrap();
    let server = common::start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({
            "target_type": "file",
            "target_id": "home",
            "path": "secret.txt",
            "ttl_seconds": 3600
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 201);
    let token = resp.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();

    // GET share info should succeed
    let resp = server
        .client
        .get(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    // PUT/POST to share endpoint should be blocked (405 or 403 or 404)
    let resp = server
        .client
        .put(server.url(&format!("/api/v1/share/{}", token)))
        .body("hacked")
        .send()
        .await
        .unwrap();
    assert!(
        resp.status() == 405 || resp.status() == 403 || resp.status() == 404,
        "mutations must be blocked, got {}",
        resp.status()
    );

    // DELETE with wrong method? POST to share create with same token should not allow overwrite via PUT
    server.shutdown().await;
}

#[tokio::test]
async fn test_shr_005_instant_revocation() {
    let server = start_health_server().await;
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols":80,"rows":24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({"target_type":"terminal","target_id":id}))
        .send()
        .await
        .unwrap();
    let token = resp.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();

    // Revoke
    let resp = server
        .client
        .delete(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);

    // Subsequent GET should be 404
    let resp = server
        .client
        .get(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 404);

    // WS connect should fail
    let ws_url = format!(
        "{}/api/v1/share/ws/terminal/{}",
        server.base_url.replace("http://", "ws://"),
        token
    );
    let ws_result = tokio_tungstenite::connect_async(ws_url).await;
    assert!(
        ws_result.is_err() || {
            // If connects, it should immediately be rejected? Our handler returns 404 before upgrade, so connect should fail
            false
        },
        "revoked token WS should fail"
    );

    server.shutdown().await;
}

#[tokio::test]
async fn test_shr_005_max_views() {
    let server = start_health_server().await;
    let create: serde_json::Value = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::json!({"cols":80,"rows":24}))
        .send()
        .await
        .unwrap()
        .json()
        .await
        .unwrap();
    let id = create["id"].as_str().unwrap().to_string();

    let resp = server
        .client
        .post(server.url("/api/v1/share/create"))
        .json(&serde_json::json!({"target_type":"terminal","target_id":id, "max_views": 1}))
        .send()
        .await
        .unwrap();
    let token = resp.json::<serde_json::Value>().await.unwrap()["share_token"]
        .as_str()
        .unwrap()
        .to_string();

    // First use via validate_and_use (WS connect counts as use)
    let _resp = server
        .client
        .get(server.url(&format!("/api/v1/share/{}", token)))
        .send()
        .await
        .unwrap();
    // GET via share_get_handler uses get() not validate_and_use, so views not incremented there. Need to use WS to increment.
    // Connect WS first time
    let ws_url = format!(
        "{}/api/v1/share/ws/terminal/{}",
        server.base_url.replace("http://", "ws://"),
        token
    );
    let (mut ws, _) = tokio_tungstenite::connect_async(ws_url.clone())
        .await
        .expect("first WS should succeed");
    let _ = ws.close(None).await;
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    // Second WS should fail due to max_views 1
    let ws_result = tokio_tungstenite::connect_async(ws_url).await;
    // Our validate_and_use increments views, so second should be rejected with 404 (WS upgrade fails)
    // The connect_async may still succeed in TCP but server returns 404 before upgrade, so tungstenite will get error
    assert!(
        ws_result.is_err(),
        "second WS with max_views 1 should be rejected"
    );

    server.shutdown().await;
}
