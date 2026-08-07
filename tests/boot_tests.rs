mod common;

#[tokio::test]
async fn test_boot_001_and_006_health_endpoint() {
    let server = common::start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "health endpoint must be reachable");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    assert_eq!(body["version"], env!("CARGO_PKG_VERSION"));
    server.shutdown().await;
}
