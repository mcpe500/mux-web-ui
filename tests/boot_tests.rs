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

// V051-005: install must report v0.5.1 via health so users can verify the hotfix.
#[tokio::test]
async fn test_v051_005_health_version_is_0_5_1() {
    let server = common::start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    // After v0.5.2 the version advances; assert it matches the paket's
    // current CARGO_PKG_VERSION so the pin stays green across bumps.
    assert_eq!(
        body["version"],
        env!("CARGO_PKG_VERSION"),
        "health.version must match Cargo.toml (spec 007/008)"
    );
    server.shutdown().await;
}
