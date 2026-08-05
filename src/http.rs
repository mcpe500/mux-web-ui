use crate::assets::static_handler;
use crate::config::Config;
use crate::files::list_directory;
use crate::paths::AllowedRoots;
use crate::protocol::{decode_frame, encode_frame, Frame};
use crate::session::SessionRegistry;
use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        Path, Query, State,
    },
    http::{header, HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{delete, get, post},
    Json, Router,
};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tracing::info;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub allowed_roots: AllowedRoots,
    pub sessions: SessionRegistry,
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
        .route("/api/v1/terminals", post(create_terminal_handler))
        .route("/api/v1/terminals/:id", delete(delete_terminal_handler))
        .route("/api/v1/terminals/:id/ws", get(terminal_ws_handler))
        .route("/api/v1/actions/terminals/stop-all", post(stop_all_terminals_handler))
        .route("/api/v1/fs/roots", get(list_roots_handler))
        .route("/api/v1/fs/entries", get(list_entries_handler))
        .route("/api/v1/fs/file", get(get_file_handler).put(put_file_handler))
        .route("/api/v1/metrics", get(metrics_handler))
        .fallback(static_handler)
        .with_state(state)
}

async fn health_handler() -> Json<HealthResp> {
    Json(HealthResp {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

async fn create_terminal_handler(
    State(state): State<AppState>,
    Json(req): Json<CreateTerminalReq>,
) -> Result<impl IntoResponse, (StatusCode, String)> {
    let cols = req.cols.unwrap_or(80);
    let rows = req.rows.unwrap_or(24);

    let meta = state
        .sessions
        .create_session(cols, rows, state.config.work_dir.clone(), state.config.shell.clone())
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

    Ok((StatusCode::CREATED, Json(meta)))
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

    let listing = list_directory(&resolved, &q.root, &q.path)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e))?;

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

async fn terminal_ws_handler(
    State(state): State<AppState>,
    Path(id): Path<String>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    // CRITICAL: take_output_rx MUST happen BEFORE get_session.
    // get_session clones the Arc (ref count = 2), which makes
    // Arc::get_mut inside take_output_rx return None, causing
    // the WebSocket to immediately disconnect with no output.
    let rx = state.sessions.take_output_rx(&id);

    let session = match state.sessions.get_session(&id) {
        Some(s) => s,
        None => return StatusCode::NOT_FOUND.into_response(),
    };

    ws.on_upgrade(move |socket| handle_terminal_ws(socket, session, rx))
}

async fn handle_terminal_ws(
    socket: WebSocket,
    session: Arc<crate::session::TerminalSessionInstance>,
    mut output_rx: Option<tokio::sync::mpsc::Receiver<Vec<u8>>>,
) {
    info!("WebSocket client connected for terminal {}", session.metadata.id);

    let (mut ws_sender, mut ws_receiver) = socket.split();

    // Forward PTY output -> WebSocket client
    let mut out_task = tokio::spawn(async move {
        if let Some(ref mut rx) = output_rx {
            while let Some(bytes) = rx.recv().await {
                let frame = Frame::Output(bytes);
                let encoded = encode_frame(&frame);
                if ws_sender.send(Message::Binary(encoded)).await.is_err() {
                    break;
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
                        let _ = session_in.pty.resize(cols, rows);
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
        _ = &mut out_task => in_task.abort(),
        _ = &mut in_task => out_task.abort(),
    }

    info!("WebSocket disconnected for terminal {}", session.metadata.id);
}
