use crate::pty::PtySession;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{broadcast, mpsc, watch};
use tracing::info;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Creating,
    Running,
    Exiting,
    Closed,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadata {
    pub id: String,
    pub token: String,
    pub cols: u16,
    pub rows: u16,
    pub state: SessionState,
    pub pid: u32,
}

#[derive(Debug, Clone)]
pub struct SessionConfig {
    pub grace_period: Duration,
    pub output_buffer: usize,
    pub ws_token_ttl: Duration,
}

impl Default for SessionConfig {
    fn default() -> Self {
        Self {
            grace_period: Duration::from_secs(60),
            output_buffer: 256 * 1024,
            ws_token_ttl: Duration::from_secs(10),
        }
    }
}

pub const MAX_SESSIONS: usize = 4;

#[derive(Debug, PartialEq, Eq)]
pub enum SessionError {
    MaxSessions,
    NotFound,
    SpawnFailed(String),
}

#[derive(Debug, PartialEq, Eq)]
pub enum AttachError {
    InvalidToken,
    TokenExpired,
}

#[derive(Debug, Clone, Serialize)]
pub struct AttachInfo {
    pub ws_token: String,
    pub replay_available: bool,
}

/// Bounded byte ring buffer, drop-oldest (SESS-007).
pub struct RingBuffer {
    buf: VecDeque<u8>,
    capacity: usize,
}

impl RingBuffer {
    pub fn new(capacity: usize) -> Self {
        Self {
            buf: VecDeque::with_capacity(capacity.min(1 << 20)),
            capacity,
        }
    }

    pub fn push(&mut self, bytes: &[u8]) {
        for &b in bytes {
            if self.buf.len() == self.capacity {
                self.buf.pop_front();
            }
            self.buf.push_back(b);
        }
    }

    pub fn snapshot(&self) -> Vec<u8> {
        self.buf.iter().copied().collect()
    }

    pub fn is_empty(&self) -> bool {
        self.buf.is_empty()
    }
}

pub struct TerminalSessionInstance {
    pub metadata: Mutex<SessionMetadata>,
    pub pty: PtySession,
    /// Ring buffer with the most recent output (replayed on reattach).
    pub output: Arc<Mutex<RingBuffer>>,
    /// Live output broadcast; receivers subscribe per attach.
    pub live: broadcast::Sender<Vec<u8>>,
    /// Exit state: watch of Option<exit code> (B.8). changed() never misses.
    pub exit_notify: watch::Sender<Option<i32>>,
    /// Attach generation: each successful attach bumps it and the previous
    /// client (holding a lower generation) is kicked (SESS-008).
    pub attach_gen: watch::Sender<u64>,
    /// Permanent receivers keep the watch channels alive so Sender::send
    /// always persists the value (tokio drops send() with no receivers).
    _exit_rx: watch::Receiver<Option<i32>>,
    _gen_rx: watch::Receiver<u64>,
    pub has_client: AtomicBool,
    pub attach_count: AtomicU64,
    /// Grace deadline: cleanup time when no client is attached.
    pub idle_deadline: Mutex<Option<Instant>>,
}

struct PendingAttach {
    session_id: String,
    expires: Instant,
}

#[derive(Clone)]
pub struct SessionRegistry {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSessionInstance>>>>,
    attach_tokens: Arc<Mutex<HashMap<String, PendingAttach>>>,
    config: SessionConfig,
}

impl Default for SessionRegistry {
    fn default() -> Self {
        Self::new()
    }
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self::new_with(SessionConfig::default())
    }

    pub fn new_with(config: SessionConfig) -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            attach_tokens: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }

    pub fn create_session(
        &self,
        cols: u16,
        rows: u16,
        work_dir: Option<PathBuf>,
        shell: Option<String>,
    ) -> Result<SessionMetadata, SessionError> {
        let mut map = self.sessions.lock().unwrap();
        if map.len() >= MAX_SESSIONS {
            return Err(SessionError::MaxSessions);
        }
        let id = format!("term-{}", rand_id());
        let token = format!("tok-{}", rand_id());

        let (output_tx, mut output_rx) = mpsc::channel::<Vec<u8>>(256);
        let (exit_tx, mut exit_rx) = mpsc::channel::<i32>(4);

        let (cols, rows) = crate::pty::clamp_dimensions(cols, rows);
        let pty = PtySession::new(cols, rows, work_dir, shell, output_tx, exit_tx)
            .map_err(SessionError::SpawnFailed)?;

        let metadata = SessionMetadata {
            id: id.clone(),
            token,
            cols,
            rows,
            state: SessionState::Running,
            pid: pty.pid(),
        };

        let (live_tx, _) = broadcast::channel::<Vec<u8>>(128);
        let (exit_tx_w, exit_rx_w) = watch::channel::<Option<i32>>(None);
        let (gen_tx, gen_rx_w) = watch::channel::<u64>(0);

        let instance = Arc::new(TerminalSessionInstance {
            metadata: Mutex::new(metadata.clone()),
            pty,
            output: Arc::new(Mutex::new(RingBuffer::new(self.config.output_buffer))),
            live: live_tx,
            exit_notify: exit_tx_w,
            attach_gen: gen_tx,
            _exit_rx: exit_rx_w,
            _gen_rx: gen_rx_w,
            has_client: AtomicBool::new(false),
            attach_count: AtomicU64::new(0),
            idle_deadline: Mutex::new(Some(Instant::now() + self.config.grace_period)),
        });

        map.insert(id.clone(), instance.clone());
        drop(map);

        // Writer task: PTY output -> ring buffer + live broadcast (SESS-007).
        let ring = instance.output.clone();
        let live = instance.live.clone();
        tokio::spawn(async move {
            while let Some(bytes) = output_rx.recv().await {
                let _ = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let mut g = ring.lock().unwrap();
                    g.push(&bytes);
                }));
                let _ = live.send(bytes);
            }
        });

        // Exit watcher: mark closed, notify attached client, start cleanup
        // deadline so reattach-after-exit can still report the status (B.8).
        let registry = self.clone();
        let sid = id.clone();
        let sid2 = sid.clone();
        let grace = self.config.grace_period;
        tokio::spawn(async move {
            while let Some(code) = exit_rx.recv().await {
                let Some(instance) = registry.get_session(&sid) else {
                    return;
                };
                {
                    let mut meta = instance.metadata.lock().unwrap();
                    meta.state = SessionState::Closed;
                }
                let _ = instance.exit_notify.send(Some(code));
                if !instance.has_client.load(Ordering::Relaxed) {
                    *instance.idle_deadline.lock().unwrap() = Some(Instant::now() + grace);
                }
            }
        });

        // Janitor: reap detached sessions after the grace period (LIFE-005,
        // SESS-004) and closed sessions after the same deadline.
        let registry = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(1));
            loop {
                tick.tick().await;
                let Some(instance) = registry.get_session(&sid2) else {
                    return;
                };
                let has_client = instance.has_client.load(Ordering::Relaxed);
                if has_client {
                    continue;
                }
                let deadline = *instance.idle_deadline.lock().unwrap();
                if let Some(d) = deadline {
                    if Instant::now() >= d {
                        let _ = registry.remove_session(&sid2);
                        return;
                    }
                }
            }
        });

        Ok(metadata)
    }

    /// POST /attach: mint a single-use WS token (TTL 10s) and invalidate the
    /// current client (B.4 / SESS-008). `replay_available` reports whether the
    /// ring buffer holds detached output.
    pub fn request_attach(&self, id: &str) -> Result<AttachInfo, SessionError> {
        let map = self.sessions.lock().unwrap();
        let instance = map.get(id).ok_or(SessionError::NotFound)?;
        let state = instance.metadata.lock().unwrap().state;
        if state == SessionState::Failed {
            return Err(SessionError::SpawnFailed("session failed".to_string()));
        }
        let replay_available = !instance.output.lock().unwrap().is_empty();

        let token = format!("att-{}", rand_id());
        self.attach_tokens.lock().unwrap().insert(
            token.clone(),
            PendingAttach {
                session_id: id.to_string(),
                expires: Instant::now() + self.config.ws_token_ttl,
            },
        );

        // Invalidate the old attach immediately (spec B.4).
        let gen = instance.attach_gen.borrow().wrapping_add(1);
        let _ = instance.attach_gen.send(gen);

        Ok(AttachInfo {
            ws_token: token,
            replay_available,
        })
    }

    /// Consume a WS attach token (single-use). Expired or unknown tokens fail.
    pub fn consume_attach_token(&self, token: &str) -> Result<String, AttachError> {
        let mut tokens = self.attach_tokens.lock().unwrap();
        let pending = tokens.remove(token).ok_or(AttachError::InvalidToken)?;
        if Instant::now() > pending.expires {
            return Err(AttachError::TokenExpired);
        }
        Ok(pending.session_id)
    }

    /// Register an attached client: bump generation (kicks the previous
    /// client) and clear the grace deadline. Returns (instance, my_generation).
    pub fn attach_session(
        &self,
        id: &str,
    ) -> Result<(Arc<TerminalSessionInstance>, u64), SessionError> {
        let instance = self.get_session(id).ok_or(SessionError::NotFound)?;
        let gen = instance.attach_gen.borrow().wrapping_add(1);
        let _ = instance.attach_gen.send(gen);
        instance.has_client.store(true, Ordering::Relaxed);
        *instance.idle_deadline.lock().unwrap() = None;
        instance.attach_count.fetch_add(1, Ordering::Relaxed);
        Ok((instance, gen))
    }

    /// Called when a client detaches: restart the grace deadline.
    pub fn detach_session(&self, id: &str) {
        let Some(instance) = self.get_session(id) else {
            return;
        };
        instance.has_client.store(false, Ordering::Relaxed);
        let state = instance.metadata.lock().unwrap().state;
        if state != SessionState::Closed {
            *instance.idle_deadline.lock().unwrap() =
                Some(Instant::now() + self.config.grace_period);
        }
    }

    pub fn get_session(&self, id: &str) -> Option<Arc<TerminalSessionInstance>> {
        self.sessions.lock().unwrap().get(id).cloned()
    }

    pub fn remove_session(&self, id: &str) -> Result<(), String> {
        let mut map = self.sessions.lock().unwrap();
        if let Some(instance) = map.remove(id) {
            info!("Cleaning up terminal session {}", id);
            instance.pty.terminate();
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn stop_all(&self) {
        let mut map = self.sessions.lock().unwrap();
        for (id, instance) in map.drain() {
            info!("Stopping terminal session {}", id);
            instance.pty.terminate();
        }
    }

    pub fn list_sessions(&self) -> Vec<SessionMetadata> {
        let map = self.sessions.lock().unwrap();
        map.values()
            .map(|s| s.metadata.lock().unwrap().clone())
            .collect()
    }
}

fn rand_id() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    format!("{:x}", nanos)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sess_007_ring_buffer_drop_oldest() {
        let mut ring = RingBuffer::new(8);
        ring.push(b"abcdefgh");
        ring.push(b"ij"); // overflow -> drop "ab"
        let snap = ring.snapshot();
        assert_eq!(snap, b"cdefghij");
        assert!(!ring.is_empty());
    }

    #[test]
    fn test_sess_007_ring_buffer_empty_snapshot() {
        let ring = RingBuffer::new(1024);
        assert!(ring.is_empty());
        assert_eq!(ring.snapshot(), Vec::<u8>::new());
    }

    #[tokio::test]
    async fn test_sess_005_max_sessions_limit() {
        let registry = SessionRegistry::new();
        let mut created = 0;
        for _ in 0..(MAX_SESSIONS + 1) {
            match registry.create_session(80, 24, None, None) {
                Ok(_) => created += 1,
                Err(SessionError::MaxSessions) => break,
                Err(e) => panic!("unexpected error: {e:?}"),
            }
        }
        assert_eq!(created, MAX_SESSIONS, "limit must cap concurrent sessions");
        // Cleanup
        for id in registry.list_sessions() {
            let _ = registry.remove_session(&id.id);
        }
    }

    #[tokio::test]
    async fn test_sess_004_attach_token_ttl_and_single_use() {
        let registry = SessionRegistry::new_with(SessionConfig {
            ws_token_ttl: Duration::from_millis(50),
            ..SessionConfig::default()
        });
        let meta = registry.create_session(80, 24, None, None).unwrap();

        // Expired token rejected.
        let expired = registry.request_attach(&meta.id).unwrap();
        tokio::time::sleep(Duration::from_millis(80)).await;
        assert_eq!(
            registry.consume_attach_token(&expired.ws_token),
            Err(AttachError::TokenExpired)
        );

        // Fresh token works, then is single-use.
        let fresh = registry.request_attach(&meta.id).unwrap();
        assert_eq!(
            registry.consume_attach_token(&fresh.ws_token).unwrap(),
            meta.id
        );
        assert_eq!(
            registry.consume_attach_token(&fresh.ws_token),
            Err(AttachError::InvalidToken)
        );
        assert_eq!(
            registry.consume_attach_token("att-nonexistent"),
            Err(AttachError::InvalidToken)
        );
        let _ = registry.remove_session(&meta.id);
    }

    #[tokio::test]
    async fn test_sess_008_attach_generation_kicks_previous() {
        let registry = SessionRegistry::new();
        let meta = registry.create_session(80, 24, None, None).unwrap();

        let (inst, gen_a) = registry.attach_session(&meta.id).unwrap();
        assert_eq!(gen_a, 1);
        assert!(inst.has_client.load(Ordering::Relaxed));

        let (_inst_b, gen_b) = registry.attach_session(&meta.id).unwrap();
        assert_eq!(gen_b, 2);
        assert_ne!(gen_a, gen_b, "new attach must bump the generation");
        assert!(*inst.attach_gen.borrow() > gen_a);

        let _ = registry.remove_session(&meta.id);
    }

    #[tokio::test]
    async fn test_sess_003_exit_detection_marks_closed() {
        let registry = SessionRegistry::new();
        let meta = registry.create_session(80, 24, None, None).unwrap();
        let instance = registry.get_session(&meta.id).unwrap();

        // PTY child must be reaped and state set to Closed.
        let mut exit_rx = instance.exit_notify.subscribe();
        let trigger_registry = registry.clone();
        let trigger_id = meta.id.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(50)).await;
            let inst = trigger_registry.get_session(&trigger_id).unwrap();
            let _ = inst.pty.write_input(b"exit 0\n");
        });
        let _ = tokio::time::timeout(Duration::from_secs(5), exit_rx.changed())
            .await
            .expect("exit notification within 5s");
        assert_eq!(*exit_rx.borrow(), Some(0));
        assert_eq!(
            instance.metadata.lock().unwrap().state,
            SessionState::Closed
        );
        let _ = registry.remove_session(&meta.id);
    }
}
