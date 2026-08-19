use crate::assets::static_handler;
use crate::auth::{self, AuthState, COOKIE_NAME_PLAIN, COOKIE_NAME_TLS};
use crate::config::Config;
use crate::files::list_directory;
use crate::paths::AllowedRoots;
use crate::protocol::{decode_frame, encode_frame, Frame};
use crate::session::{self, SessionRegistry};
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
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
}

#[derive(Deserialize)]
pub struct CreateTerminalReq {
    pub cols: Option<u16>,
    pub rows: Option<u16>,
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
        .route("/api/v1/auth/pair", post(pair_handler))
        .route("/api/v1/auth/logout", post(logout_handler))
        .route("/api/v1/auth/clients", get(clients_handler))
        .route("/api/v1/auth/clients/:id", delete(revoke_client_handler))
        .route("/api/v1/auth/regenerate", post(regenerate_handler))
        .route_layer(middleware::from_fn_with_state(
            state.clone(),
            auth_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            state.clone(),
            host_origin_middleware,
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

async fn pair_handler(State(state): State<AppState>, Json(req): Json<PairReq>) -> Response {
    let ip = "127.0.0.1".to_string();
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

    if path.starts_with("/api/v1/") && !is_pair {
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

    match state.sessions.create_session(
        cols,
        rows,
        state.config.work_dir.clone(),
        state.config.shell.clone(),
    ) {
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
