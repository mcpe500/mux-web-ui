mod common;

use common::start_health_server;
use mux_web::packages::PackageService;

#[tokio::test]
async fn test_pkg_001_detect_system_backend() {
    let backend = PackageService::detect_backend();
    // Should detect at least one or unknown, but not panic
    assert!(matches!(
        backend.kind,
        mux_web::packages::PackageBackendKind::Pkg
            | mux_web::packages::PackageBackendKind::Apt
            | mux_web::packages::PackageBackendKind::Pacman
            | mux_web::packages::PackageBackendKind::Apk
            | mux_web::packages::PackageBackendKind::Unknown
    ));
}

#[tokio::test]
async fn test_pkg_002_list_installed_packages_via_http() {
    let server = start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/packages/installed"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body.is_array());
    server.shutdown().await;
}

#[tokio::test]
async fn test_pkg_003_search_repository_packages() {
    let server = start_health_server().await;
    // Too short query should be 400
    let resp = server
        .client
        .get(server.url("/api/v1/packages/search?q=a"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400);
    // Valid query should succeed (stub returns empty)
    let resp = server
        .client
        .get(server.url("/api/v1/packages/search?q=git"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body.is_array());
    server.shutdown().await;
}

#[tokio::test]
async fn test_pkg_004_package_name_regex_rejection() {
    assert!(!PackageService::is_valid_package_name("curl; reboot"));
    assert!(!PackageService::is_valid_package_name("pkg$(rm -rf)"));
    assert!(!PackageService::is_valid_package_name(";evil"));
    assert!(!PackageService::is_valid_package_name(""));
    assert!(PackageService::is_valid_package_name("git"));
    assert!(PackageService::is_valid_package_name("python3"));
    assert!(PackageService::is_valid_package_name("my-pkg+extra_1"));
    assert!(!PackageService::is_valid_package_name("-bad"));
}

#[tokio::test]
async fn test_pkg_005_search_injection_blocked_http() {
    let server = start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/packages/search?q=git; rm -rf /"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 400, "injection query should be rejected");
    server.shutdown().await;
}

#[tokio::test]
async fn test_pkg_backend_http() {
    let server = start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/packages/backend"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body.get("backend").is_some());
    assert!(body.get("available").is_some());
    server.shutdown().await;
}
