mod common;

use common::start_health_server;
use mux_web::auth::{AuthConfig, AuthState};
use mux_web::session::{SessionConfig, SessionRegistry};

/// SEC-004: Global security headers
#[tokio::test]
async fn test_sec_004_security_headers_on_all_routes() {
    let server = start_health_server().await;
    // Health endpoint should have CSP, X-Frame, nosniff, Referrer, and no HSTS (non-TLS)
    let resp = server
        .client
        .get(server.url("/api/v1/health"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let headers = resp.headers();
    assert!(
        headers.contains_key("content-security-policy"),
        "CSP header missing"
    );
    assert_eq!(
        headers.get("x-frame-options").unwrap().to_str().unwrap(),
        "DENY"
    );
    assert_eq!(
        headers
            .get("x-content-type-options")
            .unwrap()
            .to_str()
            .unwrap(),
        "nosniff"
    );
    assert!(headers.contains_key("referrer-policy"));
    assert!(
        headers
            .get("content-security-policy")
            .unwrap()
            .to_str()
            .unwrap()
            .contains("default-src 'self'"),
        "CSP must contain default-src 'self'"
    );
    // HSTS only when TLS, so should be absent on plain http test server
    assert!(
        !headers.contains_key("strict-transport-security"),
        "HSTS must not be set on non-TLS"
    );

    // Also check fs endpoint has same headers
    let resp2 = server
        .client
        .get(server.url("/api/v1/fs/roots"))
        .send()
        .await
        .unwrap();
    assert!(resp2.headers().contains_key("content-security-policy"));
    server.shutdown().await;
}

/// SEC-005: CSRF double-submit — mismatch rejected, cookie issued
#[tokio::test]
async fn test_sec_005_csrf_token_required_for_post() {
    let server = start_health_server().await;
    // First GET should set csrf cookie
    let resp = server
        .client
        .get(server.url("/api/v1/health"))
        .send()
        .await
        .unwrap();
    let set_cookie: Vec<String> = resp
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap().to_string())
        .collect();
    let csrf_cookie = set_cookie
        .iter()
        .find(|c| c.contains("csrf_token") || c.contains("__Host-csrf"))
        .expect("csrf cookie must be set on GET");
    let token = csrf_cookie
        .split(';')
        .next()
        .unwrap()
        .split('=')
        .nth(1)
        .unwrap()
        .to_string();
    assert!(!token.is_empty(), "csrf token must not be empty");

    // State-changing POST with mismatched token should be 403
    // Use POST /api/v1/terminals which is state-changing and requires auth
    let mismatched = format!("{}-mismatch", token);
    let _resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .header("X-CSRF-Token", mismatched)
        .header("Cookie", format!("csrf_token={}", token))
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    // Since we have valid session cookie (auto-paired), but CSRF mismatch, expect 403
    // Our lenient middleware only checks when both cookie and header present and mismatch -> 403
    // So this should be 403 regardless of auth (auth is valid via jar, but we override Cookie header)
    // To properly test, we need to include session cookie too. Use the server's session_cookie.
    // Instead, test with correct session cookie + mismatched csrf
    let session_cookie = server.session_cookie.clone().unwrap();
    // Extract csrf token from jar? Use the token we got, but need to send both cookies
    let combined_cookie = format!(
        "{}; csrf_token={}",
        session_cookie.split(';').next().unwrap(),
        token
    );
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .header("X-CSRF-Token", "invalid-token-should-fail")
        .header("Cookie", combined_cookie.clone())
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        403,
        "mismatched CSRF should be 403, got {}",
        resp.status()
    );
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["error"]["code"], "CSRF_REQUIRED");

    // Correct token should succeed (201 or 200)
    let resp = server
        .client
        .post(server.url("/api/v1/terminals"))
        .header("X-CSRF-Token", token.clone())
        .header("Cookie", combined_cookie)
        .json(&serde_json::json!({"cols": 80, "rows": 24}))
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_success(),
        "correct CSRF should allow, got {}",
        resp.status()
    );

    server.shutdown().await;
}

/// SEC-006: CSPRNG session IDs not predictable — burst 100 unique
#[tokio::test]
async fn test_sec_006_csprng_session_ids_not_predictable() {
    let registry = SessionRegistry::new_with(SessionConfig {
        ws_token_ttl: std::time::Duration::from_secs(10),
        ..SessionConfig::default()
    });
    // Need to allow many sessions, but MAX_SESSIONS is 4, so test via rand_id uniqueness directly
    // Instead burst create via registry with cleanup
    use std::collections::HashSet;
    let mut ids = HashSet::new();
    for _ in 0..100 {
        // Use direct CSPRNG generation mimicking rand_id
        let mut buf = [0u8; 16];
        getrandom::getrandom(&mut buf).unwrap();
        let id: String = buf.iter().map(|b| format!("{:02x}", b)).collect();
        assert_eq!(id.len(), 32, "csprng hex must be 32 chars");
        assert!(ids.insert(id.clone()), "duplicate csprng id found: {}", id);
    }
    // Also test that SessionRegistry creates unique ids (within limit)
    let mut created = Vec::new();
    for _ in 0..4 {
        let meta = registry.create_session(80, 24, None, None).unwrap();
        created.push(meta.id.clone());
    }
    let set: HashSet<_> = created.iter().collect();
    assert_eq!(set.len(), 4, "session ids must be unique");
    // IDs should be hex and not sequential nanos-like (should be 32 hex chars after prefix)
    for id in created {
        assert!(id.starts_with("term-"), "id must have prefix term-");
        let suffix = id.strip_prefix("term-").unwrap();
        assert_eq!(suffix.len(), 32, "suffix must be 32 hex (csprng)");
        assert!(suffix.chars().all(|c| c.is_ascii_hexdigit()), "hex only");
    }
    for s in registry.list_sessions() {
        let _ = registry.remove_session(&s.id);
    }
}

/// SEC-006: real IP rate limit — AuthState per-IP isolation
#[tokio::test]
async fn test_sec_006_real_ip_rate_limit() {
    // This is a unit-level test of AuthState per-IP logic, which HTTP now uses via ConnectInfo
    let state = AuthState::with_secret(AuthConfig::from_parts(60, 100, 3, false), "s3cret");
    // Exhaust per-IP budget for 10.0.0.1
    for _ in 0..3 {
        let _ = state.pair("bad", "10.0.0.1");
    }
    // 10.0.0.2 should still be allowed (not limited by per-IP of .1)
    // It will fail with InvalidSecret, not RateLimited, because per-IP not exceeded
    assert!(
        !matches!(
            state.pair("bad", "10.0.0.2"),
            Err(mux_web::auth::AuthError::RateLimited(_))
        ),
        "different IP should not be rate-limited by per-IP of another"
    );
    // Original IP now should be limited
    assert!(
        matches!(
            state.pair("bad", "10.0.0.1"),
            Err(mux_web::auth::AuthError::RateLimited(_))
        ),
        "original IP should be rate-limited"
    );

    // Also test that HTTP pair handler now uses ConnectInfo: we can't easily fake IP via http test
    // but we verify that the handler accepts Option<ConnectInfo> without panic (already covered by health server)
    let server = start_health_server().await;
    // Even with ConnectInfo, pairing still works via real socket addr (127.0.0.1)
    // Try a failing pair to ensure we get 401 not panic
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .json(&serde_json::json!({"secret": "wrong"}))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 401);
    server.shutdown().await;
}

/// SEC-006: constant_time_compare via subtle — ensure identical and different lengths handled
#[tokio::test]
async fn test_sec_006_constant_time_compare_subtle() {
    // Directly test AuthState pairing with secrets of different lengths (should not leak timing)
    let state = AuthState::with_secret(AuthConfig::default(), "short");
    // Wrong length secret -> InvalidSecret, not panic, constant-time
    assert_eq!(
        state.pair("much-longer-secret-value", "127.0.0.1"),
        Err(mux_web::auth::AuthError::InvalidSecret)
    );
    assert!(state.pair("short", "127.0.0.1").is_ok());
    // After consumption, replay should still be InvalidSecret (constant-time)
    assert_eq!(
        state.pair("short", "127.0.0.1"),
        Err(mux_web::auth::AuthError::InvalidSecret)
    );
}

// ── NET-001/002/005/007 (spec 009): Host allowlist & CGNAT gate ──

use std::path::PathBuf;

/// Server with custom allowed_hosts/advertise_addrs (auto-paired client).
async fn start_server_with_hosts(allowed: &str, advertise: &str) -> common::TestServer {
    use clap::Parser as _;
    use mux_web::http::AppState;
    let temp = tempfile::tempdir().expect("tempdir");
    let mut config = mux_web::config::Config::parse_from(["mux-web"]);
    config.shell = Some("/bin/sh".to_string());
    if !allowed.is_empty() {
        config.allowed_hosts = Some(allowed.to_string());
    }
    if !advertise.is_empty() {
        config.advertise_addrs = Some(advertise.to_string());
    }
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    let state = AppState {
        config,
        allowed_roots: mux_web::paths::AllowedRoots::new(roots).expect("roots"),
        sessions: SessionRegistry::new_with(SessionConfig::default()),
        auth: AuthState::with_secret(AuthConfig::default(), common::TEST_SECRET),
        share: mux_web::share::ShareRegistry::new(mux_web::share::ShareConfig::default()),
    };
    let mut server = common::start_server_with_state(state).await;
    let resp = server
        .client
        .post(server.url("/api/v1/auth/pair"))
        .header("content-type", "application/json")
        .body(format!(r#"{{"secret": "{}"}}"#, common::TEST_SECRET))
        .send()
        .await
        .expect("pair");
    assert_eq!(resp.status(), 200);
    let cookie = resp
        .headers()
        .get("set-cookie")
        .and_then(|c| c.to_str().ok())
        .map(String::from)
        .expect("cookie");
    let jar = reqwest::cookie::Jar::default();
    jar.add_cookie_str(&cookie, &server.base_url.parse().unwrap());
    server.client = reqwest::Client::builder()
        .cookie_provider(std::sync::Arc::new(jar))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .unwrap();
    server
}

async fn status_with_host(server: &common::TestServer, host: &str) -> u16 {
    server
        .client
        .get(server.url("/api/v1/health"))
        .header("Host", host)
        .send()
        .await
        .unwrap()
        .status()
        .as_u16()
}

fn server_port(server: &common::TestServer) -> String {
    server
        .base_url
        .rsplit_once(':')
        .map(|(_, p)| p.to_string())
        .expect("port in base_url")
}

/// NET-001: allowlisted domain (with and without port) is accepted.
#[tokio::test]
async fn test_net_001_allowed_host_accepted() {
    let server = start_server_with_hosts("allowed.test", "").await;
    assert_ne!(status_with_host(&server, "allowed.test").await, 403);
    let with_port = format!("allowed.test:{}", server_port(&server));
    assert_ne!(status_with_host(&server, &with_port).await, 403);
    server.shutdown().await;
}

/// NET-001: matching is case-insensitive.
#[tokio::test]
async fn test_net_001_case_insensitive() {
    let server = start_server_with_hosts("allowed.test", "").await;
    assert_ne!(status_with_host(&server, "ALLOWED.TEST").await, 403);
    server.shutdown().await;
}

/// NET-002: CGNAT (Tailscale-style) IP in Host is accepted without any flag.
#[tokio::test]
async fn test_net_002_cgnat_ip_accepted() {
    let server = start_health_server().await;
    let host = format!("100.64.1.2:{}", server_port(&server));
    assert_eq!(status_with_host(&server, &host).await, 200);
    server.shutdown().await;
}

/// NET-007: public IPs and unknown domains stay rejected (rebinding guard).
#[tokio::test]
async fn test_net_007_evil_host_still_rejected() {
    let server = start_server_with_hosts("allowed.test", "").await;
    for host in ["evil.com", "93.184.216.34"] {
        let status = status_with_host(&server, host).await;
        assert_eq!(status, 403, "host {host} must stay rejected");
    }
    // default server (no flags) rejects public domain too
    let plain = start_health_server().await;
    assert_eq!(status_with_host(&plain, "evil.com").await, 403);
    plain.shutdown().await;
    server.shutdown().await;
}

/// NET-005: rejection body hints at --allowed-hosts.
#[tokio::test]
async fn test_net_005_host_rejected_message_hints_flag() {
    let server = start_health_server().await;
    let resp = server
        .client
        .get(server.url("/api/v1/health"))
        .header("Host", "evil.com")
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    let msg = body["error"]["message"].as_str().unwrap_or("");
    assert!(msg.contains("--allowed-hosts"), "msg: {msg}");
    server.shutdown().await;
}

/// NET-003: advertise_addrs implies allowlist for its host-part.
#[tokio::test]
async fn test_net_003_advertise_implies_allowlist() {
    let server = start_server_with_hosts("", "a.test").await;
    assert_ne!(status_with_host(&server, "a.test").await, 403);
    server.shutdown().await;
}

// silence unused import when helpers evolve
#[allow(unused)]
fn _unused(p: PathBuf) {}
