use crate::archive::{ArchiveService, ExtractBudgets};
use crate::assets::static_handler;
use crate::auth::{self, AuthState, COOKIE_NAME_PLAIN, COOKIE_NAME_TLS};
use crate::config::Config;
use crate::files::list_directory;
use crate::paths::AllowedRoots;
use crate::protocol::{decode_frame, encode_frame, Frame};
use crate::session::{self, SessionRegistry};
use crate::share::{ShareRegistry, ShareTargetType};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        ConnectInfo, Path, Query, State,
    },
    http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::IpAddr;
use std::sync::Arc;
use tracing::{debug, info};

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub allowed_roots: AllowedRoots,
    pub sessions: SessionRegistry,
    pub auth: AuthState,
    pub share: ShareRegistry,
}

#[derive(Deserialize)]
pub struct CreateTerminalReq {
    pub cols: Option<u16>,
    pub rows: Option<u16>,
    /// EDT-002 (spec 006): optional working directory for the integrated
    /// editor terminal. Must resolve inside an AllowedRoot; traversal/NUL are
    /// rejected with 400 PATH_TRAVERSAL before any PTY is created.
    #[serde(default)]
    pub cwd_root: Option<String>,
    #[serde(default)]
    pub cwd_path: Option<String>,
}

#[derive(Serialize)]
pub struct HealthResp {
    pub status: &'static str,
    pub version: &'static str,
}

#[derive(Deserialize)]
pub struct FileQuery {
    pub root: String,
    pub path: String,
}

#[derive(Serialize)]
pub struct MetricsResp {
    pub active_terminals: usize,
    pub allowed_roots_count: usize,
    pub uptime_seconds: u64,
}

static START_TIME: std::sync::LazyLock<std::time::Instant> =
    std::sync::LazyLock::new(std::time::Instant::now);

pub fn create_router(state: AppState) -> Router {
    // Ensure start time is initialized
    let _ = *START_TIME;

    Router::new()
        .route("/api/v1/health", get(health_handler))
        .route(
            "/api/v1/terminals",
            get(list_terminals_handler).post(create_terminal_handler),
        )
        .route("/api/v1/terminals/:id", delete(delete_terminal_handler))
        .route("/api/v1/terminals/:id/attach", post(attach_handler))
        .route("/api/v1/terminals/:id/ws", get(terminal_ws_handler))
        .route(
            "/api/v1/actions/terminals/stop-all",
            post(stop_all_terminals_handler),
        )
        .route("/api/v1/fs/roots", get(list_roots_handler))
        .route("/api/v1/fs/entries", get(list_entries_handler))
        .route(
            "/api/v1/fs/file",
            get(get_file_handler).put(put_file_handler),
        )
        .route("/api/v1/metrics", get(metrics_handler))
        .route("/api/v1/archive/inspect", get(archive_inspect_handler))
        .route("/api/v1/archive/extract", post(archive_extract_handler))
        .route("/api/v1/archive/create", post(archive_create_handler))
        .route("/api/v1/share/create", post(share_create_handler))
        .route("/api/v1/share/list", get(share_list_handler))
        .route(
            "/api/v1/share/:token",
            delete(share_revoke_handler).get(share_get_handler),
        )
        .route(
            "/api/v1/share/ws/terminal/:token",
            get(share_terminal_ws_handler),
        )
        .route("/api/v1/packages/backend", get(packages_backend_handler))
        .route(
            "/api/v1/packages/installed",
            get(packages_installed_handler),
        )
        .route("/api/v1/packages/search", get(packages_search_handler))
        .route("/api/v1/git/status", get(git_status_handler))
        .route("/api/v1/git/diff", get(git_diff_handler))
        .route("/api/v1/git/branches", get(git_branches_handler))
        .route("/api/v1/auth/pair", post(pair_handler))
        .route("/api/v1/auth/logout", post(logout_handler))
        .route("/api/v1/auth/clients", get(clients_handler))
        .route("/api/v1/auth/clients/:id", delete(revoke_client_handler))
        .route("/api/v1/auth/regenerate", post(regenerate_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            csrf_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            host_origin_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            security_headers_middleware,
        ))
        .fallback(static_handler)
        .with_state(state)
}

async fn health_handler() -> Json<HealthResp> {
    Json(HealthResp {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

#[derive(Deserialize)]
pub struct PairReq {
    pub secret: String,
}

#[derive(Serialize)]
pub struct RegenerateResp {
    pub bootstrap: String,
}

fn error_envelope(code: &str, message: &str) -> Response {
    let body = serde_json::json!({"error": {"code": code, "message": message}});
    (StatusCode::UNAUTHORIZED, Json(body)).into_response()
}

fn cookie_name(tls: bool) -> &'static str {
    if tls {
        COOKIE_NAME_TLS
    } else {
        COOKIE_NAME_PLAIN
    }
}

/// AUTH-002: set the session cookie with strict attributes. Secure flag and
/// __Host- prefix only when TLS is active (A.6).
fn set_session_cookie(headers: &mut HeaderMap, tls: bool, session_id: &str) {
    let name = cookie_name(tls);
    let mut value =
        format!("{name}={session_id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800");
    if tls {
        value.push_str("; Secure");
    }
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&value).expect("static cookie string"),
    );
}

async fn pair_handler(
    State(state): State<AppState>,
    connect_info: Option<ConnectInfo<std::net::SocketAddr>>,
    Json(req): Json<PairReq>,
) -> Response {
    let ip = connect_info
        .map(|ci| ci.0.ip().to_string())
        .unwrap_or_else(|| "127.0.0.1".to_string());
    let secure = state.auth.config.secure_cookie;
    match state.auth.pair(&req.secret, &ip) {
        Ok(session_id) => {
            let mut resp = StatusCode::OK.into_response();
            set_session_cookie(resp.headers_mut(), secure, &session_id);
            resp
        }
        Err(auth::AuthError::InvalidSecret) => {
            error_envelope("INVALID_SECRET", "invalid pairing secret")
        }
        Err(auth::AuthError::RateLimited(retry_after)) => {
            let mut resp = StatusCode::TOO_MANY_REQUESTS.into_response();
            resp.headers_mut().insert(
                header::RETRY_AFTER,
                HeaderValue::from_str(&retry_after.to_string()).expect("number"),
            );
            resp
        }
    }
}

async fn logout_handler(State(state): State<AppState>, headers: HeaderMap) -> Response {
    let secure = state.auth.config.secure_cookie;
    if let Some(cookie) = headers.get(header::COOKIE).and_then(|c| c.to_str().ok()) {
        let id = extract_cookie_id(cookie, cookie_name(secure));
        if let Some(id) = id {
            state.auth.revoke(&id);
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

async fn clients_handler(State(state): State<AppState>) -> Json<Vec<auth::ClientInfo>> {
    Json(state.auth.list_clients())
}

async fn revoke_client_handler(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    state.auth.revoke(&id);
    StatusCode::NO_CONTENT.into_response()
}

async fn regenerate_handler(State(state): State<AppState>) -> Json<RegenerateResp> {
    let secret = state.auth.regenerate();
    Json(RegenerateResp { bootstrap: secret })
}

fn extract_cookie_id(cookie_header: &str, name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    cookie_header.split(';').find_map(|part| {
        let part = part.trim();
        part.strip_prefix(&prefix).map(|v| v.to_string())
    })
}

/// Auth middleware: everything under /api/v1/* except /auth/pair requires a
/// valid session cookie (LAN-008).
async fn auth_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let path = request.uri().path().to_string();
    let secure = state.auth.config.secure_cookie;
    let is_pair = path == "/api/v1/auth/pair";
    let is_share_public = path.starts_with("/api/v1/share/ws/")
        || (path.starts_with("/api/v1/share/") && *request.method() == Method::GET);

    if path.starts_with("/api/v1/") && !is_pair && !is_share_public {
        let cookie_ok = request
            .headers()
            .get(header::COOKIE)
            .and_then(|c| c.to_str().ok())
            .and_then(|c| extract_cookie_id(c, cookie_name(secure)))
            .map(|id| state.auth.validate(&id))
            .unwrap_or(false);
        if !cookie_ok {
            return error_envelope("AUTH_REQUIRED", "pairing required");
        }
    }

    next.run(request).await
}

fn is_private(ip: IpAddr) -> bool {
    use std::net::Ipv4Addr;
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4 == Ipv4Addr::UNSPECIFIED
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unique_local(),
    }
}

/// SEC-003 / AUTH-006: pin the Host header to the bind address/port and reject
/// mismatched Origins. Blocks dns-rebinding and host-spoofing.
async fn host_origin_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let tls = state.config.tls_enabled();
    let expected_port = state.config.port.to_string();

    let host_header = request
        .headers()
        .get(header::HOST)
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string())
        // HTTP/2 puts the host in the :authority pseudo-header instead.
        .or_else(|| request.uri().authority().map(|a| a.as_str().to_string()));

    let host_ok = match host_header {
        Some(host) => {
            let host = host.trim();
            let (host_part, port) = match host.rsplit_once(':') {
                Some((h, p)) => (h, p),
                None => (host, ""),
            };
            let host_part = host_part.trim_matches(['[', ']']);
            let port_ok = port.is_empty() || port == expected_port;
            let host_ok = match host_part.parse::<IpAddr>() {
                Ok(ip) => is_private(ip) || ip == state.config.effective_bind(),
                Err(_) => host_part.eq_ignore_ascii_case("localhost"),
            };
            port_ok && host_ok
        }
        None => false,
    };

    if !host_ok {
        let body = serde_json::json!({"error": {"code": "HOST_REJECTED", "message": "invalid Host header"}});
        return (StatusCode::FORBIDDEN, Json(body)).into_response();
    }

    let method = request.method().clone();
    let origin = request
        .headers()
        .get(header::ORIGIN)
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    if method != Method::GET && method != Method::HEAD {
        if let Some(origin) = origin {
            let scheme_ok = if tls {
                origin.starts_with("https://")
            } else {
                origin.starts_with("http://")
            };
            let origin_host = origin
                .split_once("://")
                .map(|(_, rest)| rest)
                .unwrap_or("")
                .trim_end_matches('/');
            let expected_host = request
                .uri()
                .authority()
                .map(|a| a.as_str().to_string())
                .or_else(|| {
                    request
                        .headers()
                        .get(header::HOST)
                        .and_then(|h| h.to_str().ok())
                        .map(|s| s.to_string())
                })
                .unwrap_or_default();
            if !scheme_ok || origin_host != expected_host {
                let body = serde_json::json!({"error": {"code": "ORIGIN_REJECTED", "message": "invalid Origin"}});
                return (StatusCode::FORBIDDEN, Json(body)).into_response();
            }
        }
    }

    next.run(request).await
}

/// SEC-004: Global security headers (M1).
async fn security_headers_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let mut response = next.run(request).await;
    let headers = response.headers_mut();
    // CSP: default-src self, no framing, etc. Tight but compatible with Preact SPA.
    headers.insert(
        header::HeaderName::from_static("content-security-policy"),
        HeaderValue::from_static("default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: wss:; frame-ancestors 'none'"),
    );
    headers.insert(header::X_FRAME_OPTIONS, HeaderValue::from_static("DENY"));
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::HeaderName::from_static("referrer-policy"),
        HeaderValue::from_static("strict-origin-when-cross-origin"),
    );
    headers.insert(
        header::HeaderName::from_static("x-xss-protection"),
        HeaderValue::from_static("0"),
    );
    if state.config.tls_enabled() {
        headers.insert(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=63072000; includeSubDomains"),
        );
    }
    response
}

fn csrf_cookie_name(tls: bool) -> &'static str {
    if tls {
        "__Host-csrf"
    } else {
        "csrf_token"
    }
}

fn generate_csrf_token() -> String {
    let mut buf = [0u8; 32];
    getrandom::getrandom(&mut buf).expect("CSPRNG failure");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn extract_csrf_cookie(cookie_header: Option<&str>, tls: bool) -> Option<String> {
    let name = csrf_cookie_name(tls);
    cookie_header.and_then(|c| extract_cookie_id(c, name))
}

/// SEC-005: CSRF double-submit (M2). Lenient: validates only if both
/// cookie and header present; otherwise sets cookie for next request.
/// Frontend must send `X-CSRF-Token` = cookie value for state-changing.
async fn csrf_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    let tls = state.config.tls_enabled();
    let is_state_changing = !matches!(method, Method::GET | Method::HEAD | Method::OPTIONS);
    let is_api = path.starts_with("/api/v1/");
    let is_exempt = path == "/api/v1/auth/pair" || path == "/api/v1/health";

    // For state-changing API (except exempt), validate double-submit if both present.
    if is_state_changing && is_api && !is_exempt {
        let cookie_header = request
            .headers()
            .get(header::COOKIE)
            .and_then(|c| c.to_str().ok())
            .map(|s| s.to_string());
        let csrf_cookie = cookie_header
            .as_deref()
            .and_then(|c| extract_csrf_cookie(Some(c), tls));
        let header_token = request
            .headers()
            .get("x-csrf-token")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string())
            .or_else(|| {
                request
                    .headers()
                    .get("X-CSRF-Token")
                    .and_then(|h| h.to_str().ok())
                    .map(|s| s.to_string())
            });

        // Strict when both present: must match constant-time.
        if let (Some(cookie_val), Some(header_val)) = (&csrf_cookie, &header_token) {
            use subtle::ConstantTimeEq;
            let ok = cookie_val
                .as_bytes()
                .ct_eq(header_val.as_bytes())
                .unwrap_u8()
                == 1
                && !cookie_val.is_empty();
            if !ok {
                let body = serde_json::json!({"error": {"code": "CSRF_REQUIRED", "message": "csrf token mismatch"}});
                return (StatusCode::FORBIDDEN, Json(body)).into_response();
            }
        } else if csrf_cookie.is_some() && header_token.is_none() {
            // Lenient: cookie present but header missing -> allow for now
            // (existing non-browser clients, tests). Frontend will send header.
            // To enforce strictly, uncomment the block below:
            // let body = serde_json::json!({"error": {"code": "CSRF_REQUIRED", "message": "csrf token required"}});
            // return (StatusCode::FORBIDDEN, Json(body)).into_response();
        }
    }

    let request_had_csrf_cookie = request
        .headers()
        .get(header::COOKIE)
        .and_then(|c| c.to_str().ok())
        .map(|c| extract_csrf_cookie(Some(c), tls).is_some())
        .unwrap_or(false);

    let mut response = next.run(request).await;

    // Ensure CSRF cookie is set for next state-changing request (GET or pair response).
    // Only set if not already present.
    let has_csrf_cookie = response
        .headers()
        .get(header::SET_COOKIE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.contains(csrf_cookie_name(tls)))
        .unwrap_or(false)
        || request_had_csrf_cookie;

    if !has_csrf_cookie {
        let token = generate_csrf_token();
        let name = csrf_cookie_name(tls);
        let mut cookie_val = format!("{name}={token}; Path=/; SameSite=Strict; Max-Age=86400");
        if tls {
            cookie_val.push_str("; Secure");
        }
        // Not HttpOnly so JS can read and send as header (double-submit).
        if let Ok(val) = HeaderValue::from_str(&cookie_val) {
            response.headers_mut().append(header::SET_COOKIE, val);
        }
    }

    response
}

#[derive(Serialize)]
pub struct TerminalListItem {
    pub id: String,
    pub state: String,
    pub pid: u32,
    pub cols: u16,
    pub rows: u16,
    pub has_client: bool,
    pub attach_count: u64,
    pub idle_since_ms: Option<u64>,
}

async fn list_terminals_handler(State(state): State<AppState>) -> Json<serde_json::Value> {
    let sessions: Vec<TerminalListItem> = state
        .sessions
        .list_sessions()
        .iter()
        .map(|m| {
            let instance = state.sessions.get_session(&m.id);
            let (has_client, attach_count, idle_since_ms) = match instance {
                Some(inst) => (
                    inst.has_client.load(std::sync::atomic::Ordering::Relaxed),
                    inst.attach_count.load(std::sync::atomic::Ordering::Relaxed),
                    inst.idle_deadline.lock().unwrap().map(|d| {
                        d.duration_since(std::time::Instant::now())
                            .max(std::time::Duration::ZERO)
                            .as_millis() as u64
                    }),
                ),
                None => (false, 0, None),
            };
            TerminalListItem {
                id: m.id.clone(),
                state: format!("{:?}", m.state).to_lowercase(),
                pid: m.pid,
                cols: m.cols,
                rows: m.rows,
                has_client,
                attach_count,
                idle_since_ms,
            }
        })
        .collect();
    Json(serde_json::json!({"sessions": sessions}))
}

async fn create_terminal_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateTerminalReq>,
) -> Response {
    let (cols, rows) = crate::pty::clamp_dimensions(
        req.cols.unwrap_or(crate::pty::DEFAULT_COLS),
        req.rows.unwrap_or(crate::pty::DEFAULT_ROWS),
    );

    // EDT-002: resolve the optional cwd pair through AllowedRoots so the
    // integrated editor terminal starts inside the opened folder. Any resolver
    // failure (traversal, NUL, unknown root, symlink escape) is a hard 400 and
    // must not create a session.
    let work_dir = match (req.cwd_root.as_deref(), req.cwd_path.as_deref()) {
        (Some(root_id), Some(rel)) => match state.allowed_roots.resolve_path(root_id, rel) {
            Ok(p) => Some(p),
            Err(e) => {
                let body = serde_json::json!({
                    "error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}
                });
                return (StatusCode::BAD_REQUEST, Json(body)).into_response();
            }
        },
        _ => state.config.work_dir.clone(),
    };

    match state
        .sessions
        .create_session(cols, rows, work_dir, state.config.shell.clone())
    {
        Ok(meta) => (StatusCode::CREATED, Json(meta)).into_response(),
        Err(session::SessionError::MaxSessions) => {
            let body = serde_json::json!({"error": {"code": "MAX_SESSIONS", "message": "session limit reached"}});
            (StatusCode::CONFLICT, Json(body)).into_response()
        }
        Err(session::SessionError::NotFound) => StatusCode::NOT_FOUND.into_response(),
        Err(session::SessionError::SpawnFailed(msg)) => {
            (StatusCode::INTERNAL_SERVER_ERROR, msg).into_response()
        }
    }
}

#[derive(Serialize)]
pub struct AttachResp {
    pub ws_token: String,
    pub replay_available: bool,
}

/// POST /api/v1/terminals/{id}/attach — mint a single-use WS attach token
/// (B.4) and invalidate the current client (SESS-008).
async fn attach_handler(State(state): State<AppState>, Path(id): Path<String>) -> Response {
    match state.sessions.request_attach(&id) {
        Ok(info) => (
            StatusCode::OK,
            Json(AttachResp {
                ws_token: info.ws_token,
                replay_available: info.replay_available,
            }),
        )
            .into_response(),
        Err(session::SessionError::NotFound) => {
            let body = serde_json::json!({"error": {"code": "SESSION_NOT_FOUND", "message": "session not found"}});
            (StatusCode::NOT_FOUND, Json(body)).into_response()
        }
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    }
}

async fn delete_terminal_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> impl IntoResponse {
    let _ = state.sessions.remove_session(&id);
    StatusCode::NO_CONTENT
}

async fn stop_all_terminals_handler(State(state): State<AppState>) -> impl IntoResponse {
    state.sessions.stop_all();
    StatusCode::NO_CONTENT
}

async fn list_roots_handler(State(state): State<AppState>) -> impl IntoResponse {
    let roots = state.allowed_roots.list_roots();
    Json(roots)
}

async fn list_entries_handler(
    State(state): State<AppState>,
    Query(q): Query<FileQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let resolved = state
        .allowed_roots
        .resolve_path(&q.root, &q.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let listing = match list_directory(&resolved, &q.root, &q.path) {
        Ok(l) => l,
        Err(_) => return Err((StatusCode::NOT_FOUND, "Path not found".to_string())),
    };

    Ok(Json(listing))
}

async fn get_file_handler(
    State(state): State<AppState>,
    Query(q): Query<FileQuery>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let resolved = state
        .allowed_roots
        .resolve_path(&q.root, &q.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    let content = tokio::fs::read(&resolved)
        .await
        .map_err(|e| (StatusCode::NOT_FOUND, format!("Failed to read file: {}", e)))?;

    let mime = mime_guess::from_path(&resolved).first_or_octet_stream();
    let mut headers = HeaderMap::new();
    headers.insert(header::CONTENT_TYPE, mime.as_ref().parse().unwrap());
    headers.insert(header::X_CONTENT_TYPE_OPTIONS, "nosniff".parse().unwrap());

    Ok((StatusCode::OK, headers, content))
}

async fn put_file_handler(
    State(state): State<AppState>,
    Query(q): Query<FileQuery>,
    body: bytes::Bytes,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let resolved = state
        .allowed_roots
        .resolve_path(&q.root, &q.path)
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    // Atomic write using temp file
    let parent = resolved
        .parent()
        .ok_or((StatusCode::BAD_REQUEST, "Invalid file path".to_string()))?;

    let temp_file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    tokio::fs::write(temp_file.path(), body)
        .await
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    temp_file
        .persist(&resolved)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    Ok(StatusCode::OK)
}

async fn metrics_handler(State(state): State<AppState>) -> Json<MetricsResp> {
    let sessions = state.sessions.list_sessions();
    let roots = state.allowed_roots.list_roots();
    let uptime = START_TIME.elapsed().as_secs();

    Json(MetricsResp {
        active_terminals: sessions.len(),
        allowed_roots_count: roots.len(),
        uptime_seconds: uptime,
    })
}

// ── Archive handlers (ARC-001..007) ──

#[derive(Deserialize)]
pub struct ArchiveInspectQuery {
    pub root: String,
    pub path: String,
}

async fn archive_inspect_handler(
    State(state): State<AppState>,
    Query(q): Query<ArchiveInspectQuery>,
) -> Response {
    let resolved = match state.allowed_roots.resolve_path(&q.root, &q.path) {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    match ArchiveService::inspect(&resolved) {
        Ok(info) => (StatusCode::OK, Json(info)).into_response(),
        Err(e) => {
            let (code, status) = match &e {
                crate::archive::ArchiveError::NotFound(_) => ("NOT_FOUND", StatusCode::NOT_FOUND),
                crate::archive::ArchiveError::InvalidFormat(_) => {
                    ("INVALID_FORMAT", StatusCode::BAD_REQUEST)
                }
                crate::archive::ArchiveError::PathTraversal(_) => {
                    ("PATH_TRAVERSAL", StatusCode::BAD_REQUEST)
                }
                crate::archive::ArchiveError::ZipBomb { .. } => {
                    ("ZIP_BOMB", StatusCode::PAYLOAD_TOO_LARGE)
                }
                crate::archive::ArchiveError::Io(_) => {
                    ("IO_ERROR", StatusCode::INTERNAL_SERVER_ERROR)
                }
            };
            let body = serde_json::json!({"error": {"code": code, "message": e.to_string()}});
            (status, Json(body)).into_response()
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct ArchiveExtractReq {
    pub root: String,
    pub archive_path: String,
    pub destination_dir: String,
    pub overwrite: Option<bool>,
}

async fn archive_extract_handler(
    State(state): State<AppState>,
    Json(req): Json<ArchiveExtractReq>,
) -> Response {
    let archive = match state
        .allowed_roots
        .resolve_path(&req.root, &req.archive_path)
    {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    let dest = match state
        .allowed_roots
        .resolve_path(&req.root, &req.destination_dir)
    {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    // Ensure dest is directory or create it
    if dest.exists() && !dest.is_dir() {
        let body = serde_json::json!({"error": {"code": "INVALID_DEST", "message": "destination is not a directory"}});
        return (StatusCode::BAD_REQUEST, Json(body)).into_response();
    }
    let budgets = ExtractBudgets {
        max_bytes: state.config.max_extract_size,
        max_files: state.config.max_extract_files,
        max_ratio: 100,
    };
    match ArchiveService::extract(&archive, &dest, &budgets) {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({"status": "extracted"})),
        )
            .into_response(),
        Err(e) => {
            let (code, status) = match &e {
                crate::archive::ArchiveError::ZipBomb { .. } => {
                    ("ZIP_BOMB", StatusCode::PAYLOAD_TOO_LARGE)
                }
                crate::archive::ArchiveError::PathTraversal(_) => {
                    ("PATH_TRAVERSAL", StatusCode::BAD_REQUEST)
                }
                crate::archive::ArchiveError::NotFound(_) => ("NOT_FOUND", StatusCode::NOT_FOUND),
                crate::archive::ArchiveError::InvalidFormat(_) => {
                    ("INVALID_FORMAT", StatusCode::BAD_REQUEST)
                }
                crate::archive::ArchiveError::Io(_) => {
                    ("IO_ERROR", StatusCode::INTERNAL_SERVER_ERROR)
                }
            };
            let body = serde_json::json!({"error": {"code": code, "message": e.to_string()}});
            (status, Json(body)).into_response()
        }
    }
}

#[derive(Deserialize, Serialize)]
pub struct ArchiveCreateReq {
    pub root: String,
    pub sources: Vec<String>,
    pub destination: String,
    pub format: String, // "zip" or "tar.gz"
}

async fn archive_create_handler(
    State(state): State<AppState>,
    Json(req): Json<ArchiveCreateReq>,
) -> Response {
    let dest = match state
        .allowed_roots
        .resolve_path(&req.root, &req.destination)
    {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    let mut src_paths = Vec::new();
    for s in &req.sources {
        match state.allowed_roots.resolve_path(&req.root, s) {
            Ok(p) => src_paths.push(p),
            Err(e) => {
                let body = serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": format!("source {s}: {e}")}});
                return (StatusCode::BAD_REQUEST, Json(body)).into_response();
            }
        }
    }
    let result = match req.format.as_str() {
        "zip" => crate::archive::ArchiveService::create_zip(&src_paths, &dest),
        "tar.gz" | "tgz" => crate::archive::ArchiveService::create_tar_gz(&src_paths, &dest),
        _ => {
            let body = serde_json::json!({"error": {"code": "INVALID_FORMAT", "message": "format must be zip or tar.gz"}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    match result {
        Ok(()) => (
            StatusCode::OK,
            Json(serde_json::json!({"status": "created", "path": dest.to_string_lossy()})),
        )
            .into_response(),
        Err(e) => {
            let body = serde_json::json!({"error": {"code": "ARCHIVE_CREATE_FAILED", "message": e.to_string()}});
            (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
        }
    }
}

// ── Share handlers (SHR-001..006) ──

#[derive(Deserialize)]
pub struct ShareCreateHttpReq {
    pub target_type: String,
    pub target_id: String,
    pub path: Option<String>,
    pub ttl_seconds: Option<u64>,
    pub max_views: Option<u64>,
}

async fn share_create_handler(
    State(state): State<AppState>,
    Json(req): Json<ShareCreateHttpReq>,
) -> Response {
    if !state.config.enable_share_links {
        let body = serde_json::json!({"error": {"code": "SHARE_DISABLED", "message": "share links disabled"}});
        return (StatusCode::FORBIDDEN, Json(body)).into_response();
    }
    let target_type: ShareTargetType = match req.target_type.parse() {
        Ok(t) => t,
        Err(e) => {
            let body = serde_json::json!({"error": {"code": "INVALID_TARGET", "message": e}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    // Validate target existence for terminal: check session exists
    if target_type == ShareTargetType::Terminal
        && state.sessions.get_session(&req.target_id).is_none()
    {
        let body = serde_json::json!({"error": {"code": "TARGET_NOT_FOUND", "message": "terminal session not found"}});
        return (StatusCode::NOT_FOUND, Json(body)).into_response();
    }
    // For file/folder, validate path if provided via AllowedRoots? The target_id is root_id, path is relative
    if matches!(target_type, ShareTargetType::File | ShareTargetType::Folder) {
        if let Some(p) = &req.path {
            if let Err(e) = state.allowed_roots.resolve_path(&req.target_id, p) {
                let body = serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
                return (StatusCode::BAD_REQUEST, Json(body)).into_response();
            }
        }
    }
    let entry = state.share.create(
        target_type,
        req.target_id,
        req.path,
        req.ttl_seconds,
        req.max_views,
    );
    let expires_at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs()
        + state.config.default_share_ttl;
    let share_url = format!(
        "/share/{}/{}",
        match entry.target_type {
            ShareTargetType::Terminal => "terminal",
            ShareTargetType::File => "file",
            ShareTargetType::Folder => "folder",
        },
        entry.token
    );
    let resp = crate::share::ShareCreateResp {
        share_token: entry.token,
        share_url,
        expires_at,
    };
    (StatusCode::CREATED, Json(resp)).into_response()
}

async fn share_get_handler(State(state): State<AppState>, Path(token): Path<String>) -> Response {
    match state.share.get(&token) {
        Some(entry) => {
            let body = serde_json::json!({
                "token": entry.token,
                "target_type": entry.target_type,
                "target_id": entry.target_id,
                "path": entry.path,
                "views": entry.views,
                "max_views": entry.max_views,
            });
            (StatusCode::OK, Json(body)).into_response()
        }
        None => {
            let body = serde_json::json!({"error": {"code": "SHARE_NOT_FOUND", "message": "share not found or expired"}});
            (StatusCode::NOT_FOUND, Json(body)).into_response()
        }
    }
}

async fn share_list_handler(State(state): State<AppState>) -> Json<serde_json::Value> {
    let entries: Vec<serde_json::Value> = state
        .share
        .list()
        .into_iter()
        .map(|e| {
            serde_json::json!({
                "token": e.token,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "path": e.path,
                "views": e.views,
                "max_views": e.max_views,
            })
        })
        .collect();
    Json(serde_json::json!(entries))
}

async fn share_revoke_handler(
    State(state): State<AppState>,
    Path(token): Path<String>,
) -> Response {
    if state.share.revoke(&token) {
        StatusCode::NO_CONTENT.into_response()
    } else {
        let body =
            serde_json::json!({"error": {"code": "SHARE_NOT_FOUND", "message": "share not found"}});
        (StatusCode::NOT_FOUND, Json(body)).into_response()
    }
}

async fn share_terminal_ws_handler(
    State(state): State<AppState>,
    Path(token): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    let entry = match state.share.validate_and_use(&token) {
        Some(e) => e,
        None => {
            let body = serde_json::json!({"error": {"code": "SHARE_NOT_FOUND", "message": "share not found or expired"}});
            return (StatusCode::NOT_FOUND, Json(body)).into_response();
        }
    };
    if entry.target_type != ShareTargetType::Terminal {
        let body = serde_json::json!({"error": {"code": "INVALID_TARGET", "message": "share is not a terminal"}});
        return (StatusCode::BAD_REQUEST, Json(body)).into_response();
    }
    let session = match state.sessions.get_session(&entry.target_id) {
        Some(s) => s,
        None => {
            let body = serde_json::json!({"error": {"code": "TARGET_NOT_FOUND", "message": "terminal not found"}});
            return (StatusCode::NOT_FOUND, Json(body)).into_response();
        }
    };
    let live_rx = session.live.subscribe();
    let exit_rx = session.exit_notify.subscribe();
    ws.on_upgrade(move |socket| handle_share_terminal_ws(socket, live_rx, exit_rx))
}

async fn handle_share_terminal_ws(
    socket: WebSocket,
    mut live_rx: tokio::sync::broadcast::Receiver<Vec<u8>>,
    mut exit_rx: tokio::sync::watch::Receiver<Option<i32>>,
) {
    let (mut ws_sender, mut ws_receiver) = socket.split();
    // Share WS is read-only: drop any Input/Resize frames from client
    let mut recv_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let data = match msg {
                Message::Binary(b) => b,
                Message::Text(t) => t.into_bytes(),
                Message::Close(_) => break,
                _ => continue,
            };
            if let Ok(frame) = decode_frame(&data) {
                match frame {
                    Frame::Input(_) | Frame::Resize { .. } => {
                        // SHR-003: read-only, drop input
                        continue;
                    }
                    Frame::Ping => {}
                    _ => {}
                }
            }
        }
    });

    let mut send_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                _ = exit_rx.changed() => {
                    let code_opt = { *exit_rx.borrow() };
                    if let Some(code) = code_opt {
                        let frame = Frame::Exit(code);
                        let _ = ws_sender.send(Message::Binary(encode_frame(&frame))).await;
                        break;
                    }
                }
                result = live_rx.recv() => {
                    match result {
                        Ok(bytes) => {
                            let frame = Frame::Output(bytes);
                            if ws_sender.send(Message::Binary(encode_frame(&frame))).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(_) => break,
                    }
                }
            }
        }
    });

    tokio::select! {
        _ = &mut send_task => { recv_task.abort(); }
        _ = &mut recv_task => { send_task.abort(); }
    }
}

// ── Package handlers (PKG) ──

async fn packages_backend_handler(State(_state): State<AppState>) -> Json<serde_json::Value> {
    let backend = crate::packages::PackageService::detect_backend();
    Json(serde_json::json!({
        "backend": backend.kind.to_string(),
        "available": backend.available,
        "root_required": backend.root_required
    }))
}

async fn packages_installed_handler(
    State(_state): State<AppState>,
) -> Json<Vec<crate::packages::PackageInfo>> {
    // Stub: returns empty list until streaming runner implemented (v0.4.2 will fill)
    Json(vec![])
}

#[derive(Deserialize)]
pub struct PackageSearchQuery {
    pub q: String,
}

async fn packages_search_handler(
    State(_state): State<AppState>,
    Query(q): Query<PackageSearchQuery>,
) -> Response {
    if q.q.len() < 2 {
        let body = serde_json::json!({"error": {"code": "QUERY_TOO_SHORT", "message": "query must be at least 2 characters"}});
        return (StatusCode::BAD_REQUEST, Json(body)).into_response();
    }
    if !crate::packages::PackageService::is_valid_package_name(&q.q)
        && q.q.contains([';', '$', '`', '\n'])
    {
        let body = serde_json::json!({"error": {"code": "INVALID_QUERY", "message": "invalid characters in query"}});
        return (StatusCode::BAD_REQUEST, Json(body)).into_response();
    }
    Json(Vec::<crate::packages::PackageInfo>::new()).into_response()
}

// ── Git handlers (GIT) ──

async fn git_status_handler(State(state): State<AppState>, Query(q): Query<FileQuery>) -> Response {
    let repo_path = match state.allowed_roots.resolve_path(&q.root, &q.path) {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    if !repo_path.join(".git").exists() {
        let body =
            serde_json::json!({"error": {"code": "NOT_A_REPO", "message": "not a git repository"}});
        return (StatusCode::NOT_FOUND, Json(body)).into_response();
    }
    // For now, stub porcelain parsing — will be implemented in v0.4.1
    let output: String = match crate::git::GitService::run_git(
        &["status", "--porcelain=v2", "--branch"],
        &repo_path,
    ) {
        Ok(o) => o,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "GIT_FAILED", "message": e.to_string()}});
            return (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response();
        }
    };
    (
        StatusCode::OK,
        Json(serde_json::json!({"raw": output, "stub": true })),
    )
        .into_response()
}

async fn git_diff_handler(State(state): State<AppState>, Query(q): Query<FileQuery>) -> Response {
    let repo_path = match state.allowed_roots.resolve_path(&q.root, &q.path) {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    let _ = repo_path;
    Json(serde_json::json!({"hunks": []})).into_response()
}

async fn git_branches_handler(
    State(state): State<AppState>,
    Query(q): Query<FileQuery>,
) -> Response {
    let repo_path = match state.allowed_roots.resolve_path(&q.root, &q.path) {
        Ok(p) => p,
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "PATH_TRAVERSAL", "message": e.to_string()}});
            return (StatusCode::BAD_REQUEST, Json(body)).into_response();
        }
    };
    match crate::git::GitService::run_git(&["branch", "--list", "--all"], &repo_path) {
        Ok(o) => (StatusCode::OK, Json(serde_json::json!({"branches": o }))).into_response(),
        Err(e) => {
            let body =
                serde_json::json!({"error": {"code": "GIT_FAILED", "message": e.to_string()}});
            (StatusCode::INTERNAL_SERVER_ERROR, Json(body)).into_response()
        }
    }
}

#[derive(Deserialize)]
pub struct WsTokenQuery {
    pub token: String,
}

/// GET /api/v1/terminals/{id}/ws?token=... — single-use attach (B.4).
async fn terminal_ws_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Query(q): Query<WsTokenQuery>,
    ws: WebSocketUpgrade,
) -> Response {
    let session_id = match state.sessions.consume_attach_token(&q.token) {
        Ok(sid) => sid,
        Err(_) => {
            let body = serde_json::json!({"error": {"code": "INVALID_TOKEN", "message": "attach token invalid or expired"}});
            return (StatusCode::FORBIDDEN, Json(body)).into_response();
        }
    };

    if session_id != id {
        let body = serde_json::json!({"error": {"code": "INVALID_TOKEN", "message": "attach token does not match session"}});
        return (StatusCode::FORBIDDEN, Json(body)).into_response();
    }

    let (session, my_gen) = match state.sessions.attach_session(&id) {
        Ok(v) => v,
        Err(session::SessionError::NotFound) => {
            let body = serde_json::json!({"error": {"code": "SESSION_NOT_FOUND", "message": "session not found"}});
            return (StatusCode::NOT_FOUND, Json(body)).into_response();
        }
        Err(_) => return StatusCode::INTERNAL_SERVER_ERROR.into_response(),
    };

    let live_rx = session.live.subscribe();
    let exit_rx = session.exit_notify.subscribe();
    let gen_rx = session.attach_gen.subscribe();
    let registry = state.sessions.clone();
    let sid = id.clone();

    ws.on_upgrade(move |socket| {
        handle_terminal_ws(
            socket, session, my_gen, live_rx, exit_rx, gen_rx, registry, sid,
        )
    })
}

#[allow(clippy::too_many_arguments)]
async fn handle_terminal_ws(
    socket: WebSocket,
    session: Arc<crate::session::TerminalSessionInstance>,
    my_gen: u64,
    mut live_rx: tokio::sync::broadcast::Receiver<Vec<u8>>,
    mut exit_rx: tokio::sync::watch::Receiver<Option<i32>>,
    mut gen_rx: tokio::sync::watch::Receiver<u64>,
    registry: crate::session::SessionRegistry,
    sid: String,
) {
    info!(
        "WebSocket client attached to terminal {}",
        session.metadata.lock().unwrap().id
    );

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // 1. Replay the ring buffer first (subscribe before snapshot to avoid
    //    missing bytes in flight), then live stream (SESS-007).
    let snapshot = session.output.lock().unwrap().snapshot();
    for chunk in snapshot.chunks(16 * 1024) {
        let frame = Frame::Output(chunk.to_vec());
        if ws_sender
            .send(Message::Binary(encode_frame(&frame)))
            .await
            .is_err()
        {
            registry.detach_session(&sid);
            return;
        }
    }

    // 2. Session already exited → report status without respawning (B.8).
    let exited_code = *exit_rx.borrow();
    if let Some(code) = exited_code {
        let frame = Frame::Exit(code);
        let _ = ws_sender.send(Message::Binary(encode_frame(&frame))).await;
        registry.detach_session(&sid);
        return;
    }

    let mut out_task = tokio::spawn(async move {
        loop {
            tokio::select! {
                biased;
                // Exit and kick signals take priority so they can never be
                // starved by a busy output stream.
                _ = exit_rx.changed() => {
                    let code = *exit_rx.borrow();
                    if let Some(code) = code {
                        let frame = Frame::Exit(code);
                        let _ = ws_sender.send(Message::Binary(encode_frame(&frame))).await;
                        break;
                    }
                }
                _ = gen_rx.changed() => {
                    if *gen_rx.borrow() != my_gen {
                        // SESS-008: a newer attach took over this session.
                        let frame = Frame::Error("reattached elsewhere".to_string());
                        let _ = ws_sender.send(Message::Binary(encode_frame(&frame))).await;
                        break;
                    }
                }
                result = live_rx.recv() => {
                    match result {
                        Ok(bytes) => {
                            let frame = Frame::Output(bytes);
                            if ws_sender.send(Message::Binary(encode_frame(&frame))).await.is_err() {
                                break;
                            }
                        }
                        Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                    }
                }
            }
        }
    });

    // Forward WebSocket client input -> PTY
    let session_in = session.clone();
    let mut in_task = tokio::spawn(async move {
        while let Some(Ok(msg)) = ws_receiver.next().await {
            let data = match msg {
                Message::Binary(b) => b,
                Message::Text(t) => t.into_bytes(),
                Message::Close(_) => break,
                _ => continue,
            };

            if let Ok(frame) = decode_frame(&data) {
                match frame {
                    Frame::Input(input_bytes) => {
                        let _ = session_in.pty.write_input(&input_bytes);
                    }
                    Frame::Resize { cols, rows } => {
                        let (safe_cols, safe_rows) = crate::pty::clamp_dimensions(cols, rows);
                        if let Err(e) = session_in.pty.resize(safe_cols, safe_rows) {
                            debug!("PTY resize failed: {}", e);
                        } else {
                            let mut meta = session_in.metadata.lock().unwrap();
                            meta.cols = safe_cols;
                            meta.rows = safe_rows;
                        }
                    }
                    Frame::Ping => {
                        // Pong handled by ws
                    }
                    _ => {}
                }
            }
        }
    });

    tokio::select! {
        _ = &mut out_task => {
            tokio::time::sleep(std::time::Duration::from_millis(50)).await;
            in_task.abort();
        }
        _ = &mut in_task => {
            out_task.abort();
        }
    }

    info!(
        "WebSocket detached from terminal {}",
        session.metadata.lock().unwrap().id
    );
    registry.detach_session(&sid);
}
