mod common;

use clap::Parser;
use common::TestServer;
use mux_web::auth::{AuthConfig, AuthState};
use mux_web::config::Config;
use mux_web::http::AppState;
use mux_web::paths::AllowedRoots;
use mux_web::session::SessionRegistry;
use mux_web::share::{ShareConfig, ShareRegistry};
use tempfile::tempdir;

const SECRET: &str = "test-bootstrap-secret-0123456789abcdef";

async fn start_auth_server(global_limit: u32) -> TestServer {
    let temp = tempdir().unwrap();
    let config = Config::parse_from(["mux-web"]);
    let state = AppState {
        config,
        allowed_roots: AllowedRoots::new(vec![("home".to_string(), temp.path().to_path_buf())])
            .unwrap(),
        sessions: SessionRegistry::new(),
        auth: AuthState::with_secret(AuthConfig::from_parts(60, global_limit, 30, false), SECRET),
        share: ShareRegistry::new(ShareConfig::default()),
    };
    common::start_server_with_state(state).await
}

fn pair_body(secret: &str) -> String {
    format!(r#"{{"secret": "{}"}}"#, secret)
}

#[tokio::test]
async fn test_auth_001_unauthorized_request_rejected() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401, "unauthenticated request must be 401");
    let body = resp.text().await.unwrap();
    assert!(
        body.contains("AUTH_REQUIRED"),
        "error envelope must contain AUTH_REQUIRED, got: {body}"
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_pair_wrong_secret_rejected_401() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body("wrong-secret"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401, "wrong secret must be 401");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_pair_success_sets_cookie_and_grants_access() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);

    let set_cookie = resp
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    assert!(
        set_cookie.contains("HttpOnly"),
        "cookie must be HttpOnly: {set_cookie}"
    );
    assert!(
        set_cookie.contains("SameSite=Strict"),
        "cookie must be SameSite=Strict: {set_cookie}"
    );
    assert!(
        set_cookie.contains("Path=/"),
        "cookie must be Path=/: {set_cookie}"
    );
    // Cookie id must not be the bootstrap secret (AUTH-013 rotation).
    assert!(!set_cookie.contains(SECRET));

    // Cookie jar reused -> authenticated now.
    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&set_cookie, &server.base_url.parse().unwrap());
    let client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .build()
        .unwrap();
    let resp = client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "authenticated request must succeed");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_pair_single_use_replay_rejected() {
    let server = start_auth_server(10).await;
    for _ in 0..2 {
        let resp = server
            .client
            .post(server.url("/api/v1/auth/pair"))
            .header("content-type", "application/json")
            .body(pair_body(SECRET))
            .send()
            .await
            .unwrap();
        assert!(resp.status().is_success() || resp.status() == 401);
    }
    // Second pairing with the same secret must not create a session.
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401, "replayed secret must be rejected");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_004_brute_force_rate_limited_429() {
    let server = start_auth_server(3).await;
    let mut got_429 = false;
    for _ in 0..6 {
        let resp = server
            .client
            .post(server.url("/api/v1/auth/pair"))
            .header("content-type", "application/json")
            .body(pair_body("wrong"))
            .send()
            .await
            .unwrap();
        if resp.status() == 429 {
            got_429 = true;
            let retry = resp.headers().get("retry-after").cloned();
            assert!(retry.is_some(), "429 must include Retry-After header");
            break;
        }
    }
    assert!(got_429, "brute force must be rate limited with 429");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_006_spoofed_host_rejected_403() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .get(server.url("/api/v1/terminals"))
        .header("host", "evil.example.com")
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        403,
        "spoofed Host header must be rejected (dns-rebinding defense)"
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_006_mismatched_origin_rejected_403() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .header("origin", "http://evil.example.com")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 403, "cross-origin request must be rejected");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_009_logout_revokes_self() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    let set_cookie = resp
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&set_cookie, &server.base_url.parse().unwrap());
    let client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .build()
        .unwrap();

    let resp = client
        .post(server.url("/api/v1/auth/logout"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);

    let resp = client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401, "session must be revoked after logout");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_008_clients_list_and_revoke() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    let set_cookie = resp
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();

    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&set_cookie, &server.base_url.parse().unwrap());
    let client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .build()
        .unwrap();

    let resp = client
        .get(server.url("/api/v1/auth/clients"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body = resp.text().await.unwrap();
    assert!(
        !body.contains(SECRET),
        "client list must not leak the bootstrap secret"
    );

    let resp = client
        .get(server.url("/api/v1/auth/clients"))
        .send()
        .await
        .unwrap();
    let clients: Vec<serde_json::Value> = resp.json().await.unwrap();
    assert_eq!(clients.len(), 1);
    let client_id = clients[0]["id"].as_str().unwrap().to_string();

    let resp = client
        .delete(server.url(&format!("/api/v1/auth/clients/{}", client_id)))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 204);

    let resp = client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401, "revoked client must lose access");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_014_regenerate_new_secret_old_invalid() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    let set_cookie = resp
        .headers()
        .get("set-cookie")
        .unwrap()
        .to_str()
        .unwrap()
        .to_string();
    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&set_cookie, &server.base_url.parse().unwrap());
    let client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .build()
        .unwrap();

    let resp = client
        .post(server.url("/api/v1/auth/regenerate"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let new_secret = body["bootstrap"].as_str().unwrap().to_string();
    assert_ne!(new_secret, SECRET);

    // Old secret no longer pairs.
    let resp = client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body(SECRET))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        401,
        "old secret must be invalid after regenerate"
    );

    // Existing session survives regenerate (only pending codes are cancelled).
    let resp = client
        .get(server.url("/api/v1/terminals"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "existing session must stay valid");
    server.shutdown().await;
}

#[tokio::test]
async fn test_auth_012_secret_never_in_responses() {
    let server = start_auth_server(10).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(pair_body("wrong"))
        .send()
        .await
        .unwrap();
    assert!(
        !resp.text().await.unwrap().contains(SECRET),
        "error responses must not leak the secret"
    );
    server.shutdown().await;
}
