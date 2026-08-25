use clap::Parser;
use mux_web::auth::{AuthConfig, AuthState};
use mux_web::config::Config;
use mux_web::http::{create_router, AppState};
use mux_web::paths::AllowedRoots;
use mux_web::session::SessionRegistry;
use mux_web::share::{ShareConfig, ShareRegistry};
use std::path::PathBuf;

pub const TEST_SECRET: &str = "test-bootstrap-secret-0123456789abcdef";

#[allow(dead_code)]
pub fn test_auth() -> AuthState {
    AuthState::with_secret(AuthConfig::default(), TEST_SECRET)
}

pub struct TestServer {
    pub base_url: String,
    pub client: reqwest::Client,
    pub session_cookie: Option<String>,
    pub sessions: SessionRegistry,
    task: tokio::task::JoinHandle<()>,
}

impl TestServer {
    pub fn url(&self, path: &str) -> String {
        format!("{}{}", self.base_url, path)
    }

    #[allow(dead_code)]
    pub async fn shutdown(self) {
        self.sessions.stop_all();
        self.task.abort();
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        self.sessions.stop_all();
        self.task.abort();
    }
}

/// Start the full router on an ephemeral port (127.0.0.1:0) — parallel-safe.
/// The returned client is already authenticated (auto-paired).
#[allow(dead_code)]
pub async fn start_server(roots: Vec<(String, PathBuf)>) -> TestServer {
    let mut config = Config::parse_from(["mux-web"]);
    config.shell = Some("/bin/sh".to_string());
    let allowed_roots = AllowedRoots::new(roots).expect("roots must canonicalize");
    let share = ShareRegistry::new(ShareConfig::default());
    let mut server = start_server_with_state(AppState {
        config,
        allowed_roots,
        sessions: SessionRegistry::new(),
        auth: test_auth(),
        share,
        distro_tasks: std::sync::Arc::new(tokio::sync::Mutex::new(
            mux_web::distro_mgmt::DistroTaskRegistry::default(),
        )),
    })
    .await;
    server.auto_pair().await;
    server
}

/// Server with default roots and a pre-authenticated client.
#[allow(dead_code)]
pub async fn start_health_server() -> TestServer {
    let temp = tempfile::tempdir().expect("tempdir");
    let roots = vec![("home".to_string(), temp.path().to_path_buf())];
    start_server(roots).await
}

pub async fn start_server_with_state(state: AppState) -> TestServer {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
        .await
        .expect("bind ephemeral port");
    let addr = listener.local_addr().unwrap();
    // Host validation compares against config.port, so patch it to the real one.
    let mut state = state;
    state.config.port = addr.port();
    let sessions = state.sessions.clone();
    let app = create_router(state);
    let task = tokio::spawn(async move {
        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
        )
        .await
        .expect("server run");
    });
    TestServer {
        base_url: format!("http://{}", addr),
        client: reqwest::Client::builder()
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .unwrap(),
        session_cookie: None,
        sessions,
        task,
    }
}

impl TestServer {
    #[allow(dead_code)]
    pub async fn auto_pair(&mut self) {
        let resp = self
            .client
            .post(self.url("/api/v1/auth/pair"))
            .header("content-type", "application/json")
            .body(format!(r#"{{"secret": "{}"}}"#, TEST_SECRET))
            .send()
            .await
            .expect("pair request");
        assert_eq!(
            resp.status(),
            200,
            "pairing must succeed (is the secret consumed elsewhere?)"
        );
        self.session_cookie = resp
            .headers()
            .get("set-cookie")
            .and_then(|c| c.to_str().ok())
            .map(|c| c.to_string());
        let cookie = self.session_cookie.clone().expect("Set-Cookie present");
        let jar = reqwest::cookie::Jar::default();
        jar.add_cookie_str(&cookie, &self.base_url.parse().unwrap());
        self.client = reqwest::Client::builder()
            .cookie_provider(std::sync::Arc::new(jar))
            .build()
            .unwrap();
    }
}

/// Connect a WebSocket to a server path with the session cookie.
#[allow(dead_code)]
pub async fn authed_ws_connect(
    server: &TestServer,
    path: &str,
) -> Result<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    String,
> {
    use tokio_tungstenite::tungstenite::client::IntoClientRequest;

    let host = server
        .base_url
        .strip_prefix("http://")
        .expect("http base url");
    let uri = format!("ws://{}{}", host, path);
    let cookie = server.session_cookie.clone().ok_or("server not paired")?;
    let mut req = uri.into_client_request().map_err(|e| e.to_string())?;
    req.headers_mut().insert(
        http::header::COOKIE,
        http::HeaderValue::from_str(&cookie).map_err(|e| e.to_string())?,
    );
    let (ws, _) = tokio_tungstenite::connect_async(req)
        .await
        .map_err(|e| e.to_string())?;
    Ok(ws)
}
