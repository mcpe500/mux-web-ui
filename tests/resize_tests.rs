mod common;

use common::{authed_ws_connect, start_health_server};
use futures_util::SinkExt;
use mux_web::protocol::{encode_frame, Frame};
use mux_web::pty::{MAX_COLS, MAX_ROWS, MIN_COLS, MIN_ROWS};
use std::time::Duration;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::{MaybeTlsStream, WebSocketStream};

type Ws = WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>;

async fn create_terminal_with_size(
    server: &common::TestServer,
    cols: Option<u16>,
    rows: Option<u16>,
) -> serde_json::Value {
    let mut body = serde_json::Map::new();
    if let Some(c) = cols {
        body.insert("cols".to_string(), serde_json::json!(c));
    }
    if let Some(r) = rows {
        body.insert("rows".to_string(), serde_json::json!(r));
    }

    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .json(&serde_json::Value::Object(body))
        .send()
        .await
        .unwrap();

    assert_eq!(resp.status(), 201);
    resp.json().await.unwrap()
}

async fn request_attach(server: &common::TestServer, id: &str) -> serde_json::Value {
    let resp = server
        .client
        .post(server.url(&format!("/api/v1/terminals/{id}/attach")))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    resp.json().await.unwrap()
}

async fn connect_ws(server: &common::TestServer, id: &str, token: &str) -> Ws {
    let path = format!("/api/v1/terminals/{id}/ws?token={token}");
    authed_ws_connect(server, &path).await.unwrap()
}

async fn send_resize(ws: &mut Ws, cols: u16, rows: u16) {
    ws.send(Message::Binary(encode_frame(&Frame::Resize { cols, rows })))
        .await
        .expect("send resize frame");
}

async fn get_terminal_metadata(server: &common::TestServer, id: &str) -> Option<serde_json::Value> {
    let resp = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let list: serde_json::Value = resp.json().await.unwrap();
    let sessions = list["sessions"].as_array().unwrap();
    sessions.iter().find(|s| s["id"] == id).cloned()
}

#[tokio::test]
async fn test_rsz_003_initial_terminal_creation_clamps_dimensions() {
    let server = start_health_server().await;

    // Test 1: Zero dimensions clamped to minimums
    let meta_zero = create_terminal_with_size(&server, Some(0), Some(0)).await;
    assert_eq!(meta_zero["cols"], MIN_COLS);
    assert_eq!(meta_zero["rows"], MIN_ROWS);

    // Test 2: Extreme dimensions clamped to maximums
    let meta_huge = create_terminal_with_size(&server, Some(65535), Some(50000)).await;
    assert_eq!(meta_huge["cols"], MAX_COLS);
    assert_eq!(meta_huge["rows"], MAX_ROWS);

    // Test 3: Normal dimensions preserved
    let meta_normal = create_terminal_with_size(&server, Some(120), Some(40)).await;
    assert_eq!(meta_normal["cols"], 120);
    assert_eq!(meta_normal["rows"], 40);
}

#[tokio::test]
async fn test_rsz_002_and_009_ws_resize_frame_updates_metadata() {
    let server = start_health_server().await;
    let create = create_terminal_with_size(&server, Some(80), Some(24)).await;
    let id = create["id"].as_str().unwrap();

    let attach = request_attach(&server, id).await;
    let token = attach["ws_token"].as_str().unwrap();
    let mut ws = connect_ws(&server, id, token).await;

    // Send valid resize frame
    send_resize(&mut ws, 140, 50).await;

    // Small delay to allow async worker task to process frame
    tokio::time::sleep(Duration::from_millis(50)).await;

    // Metadata in session registry must reflect new dimensions
    let meta = get_terminal_metadata(&server, id)
        .await
        .expect("session exists");
    assert_eq!(meta["cols"], 140);
    assert_eq!(meta["rows"], 50);

    let _ = ws.close(None).await;
}

#[tokio::test]
async fn test_rsz_002_ws_resize_frame_clamps_extreme_values() {
    let server = start_health_server().await;
    let create = create_terminal_with_size(&server, Some(80), Some(24)).await;
    let id = create["id"].as_str().unwrap();

    let attach = request_attach(&server, id).await;
    let token = attach["ws_token"].as_str().unwrap();
    let mut ws = connect_ws(&server, id, token).await;

    // Send 0x0 resize
    send_resize(&mut ws, 0, 0).await;
    tokio::time::sleep(Duration::from_millis(50)).await;

    let meta = get_terminal_metadata(&server, id)
        .await
        .expect("session exists");
    assert_eq!(meta["cols"], MIN_COLS);
    assert_eq!(meta["rows"], MIN_ROWS);

    // Send extreme values
    send_resize(&mut ws, 60000, 30000).await;
    tokio::time::sleep(Duration::from_millis(50)).await;

    let meta2 = get_terminal_metadata(&server, id)
        .await
        .expect("session exists");
    assert_eq!(meta2["cols"], MAX_COLS);
    assert_eq!(meta2["rows"], MAX_ROWS);

    let _ = ws.close(None).await;
}

#[tokio::test]
async fn test_rsz_004_and_010_rapid_resize_flood_stability() {
    let server = start_health_server().await;
    let create = create_terminal_with_size(&server, Some(80), Some(24)).await;
    let id = create["id"].as_str().unwrap();

    let attach = request_attach(&server, id).await;
    let token = attach["ws_token"].as_str().unwrap();
    let mut ws = connect_ws(&server, id, token).await;

    // Simulate rapid drag-resizing storm: 50 resize frames back-to-back
    for i in 0..50 {
        let cols = 80 + (i % 40);
        let rows = 24 + (i % 20);
        send_resize(&mut ws, cols, rows).await;
    }

    tokio::time::sleep(Duration::from_millis(100)).await;

    // Verify session remains active and responds normally
    let meta = get_terminal_metadata(&server, id)
        .await
        .expect("session exists");
    assert_eq!(meta["state"], "running");

    let _ = ws.close(None).await;
}

#[tokio::test]
async fn test_rsz_005_and_006_resize_on_closed_session_is_safe() {
    let server = start_health_server().await;
    let create = create_terminal_with_size(&server, Some(80), Some(24)).await;
    let id = create["id"].as_str().unwrap();

    let attach = request_attach(&server, id).await;
    let token = attach["ws_token"].as_str().unwrap();
    let mut ws = connect_ws(&server, id, token).await;

    // Terminate shell process by sending exit
    ws.send(Message::Binary(encode_frame(&Frame::Input(
        b"exit\n".to_vec(),
    ))))
    .await
    .unwrap();

    tokio::time::sleep(Duration::from_millis(200)).await;

    // Send resize after exit — must not panic or crash server
    send_resize(&mut ws, 100, 30).await;
    tokio::time::sleep(Duration::from_millis(50)).await;

    let _ = ws.close(None).await;
}
