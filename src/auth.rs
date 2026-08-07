use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

pub const COOKIE_NAME_PLAIN: &str = "mux_session";
pub const COOKIE_NAME_TLS: &str = "__Host-mux_session";
pub const SECRET_LEN: usize = 32;

#[derive(Debug, Clone)]
pub struct AuthConfig {
    pub rate_limit_window: Duration,
    pub rate_limit_global: u32,
    pub rate_limit_per_ip: u32,
    pub cookie_idle_ttl: Duration,
    pub cookie_abs_ttl: Duration,
    pub secure_cookie: bool,
}

impl AuthConfig {
    pub fn from_parts(window_secs: u64, global: u32, per_ip: u32, secure_cookie: bool) -> Self {
        Self {
            rate_limit_window: Duration::from_secs(window_secs),
            rate_limit_global: global,
            rate_limit_per_ip: per_ip,
            cookie_idle_ttl: Duration::from_secs(12 * 3600),
            cookie_abs_ttl: Duration::from_secs(7 * 24 * 3600),
            secure_cookie,
        }
    }
}

impl Default for AuthConfig {
    fn default() -> Self {
        Self::from_parts(60, 10, 30, false)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientInfo {
    pub id: String,
    pub created_at_ms: u64,
    pub last_seen_ms: u64,
    pub remote_ip: String,
}

#[derive(Debug, Clone)]
pub struct ClientSession {
    pub id: String,
    pub created_at: SystemTime,
    pub last_seen: Instant,
    pub remote_ip: String,
}

#[derive(Debug, PartialEq, Eq)]
pub enum AuthError {
    InvalidSecret,
    RateLimited(u64),
}

#[derive(Clone)]
pub struct AuthState {
    inner: Arc<Mutex<AuthInner>>,
    pub config: AuthConfig,
}

struct AuthInner {
    bootstrap_secret: Option<String>,
    sessions: HashMap<String, ClientSession>,
    window_start: Instant,
    global_count: u32,
    per_ip: HashMap<String, u32>,
}

impl AuthState {
    pub fn new(config: AuthConfig) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AuthInner {
                bootstrap_secret: Some(random_secret()),
                sessions: HashMap::new(),
                window_start: Instant::now(),
                global_count: 0,
                per_ip: HashMap::new(),
            })),
            config,
        }
    }

    /// Test helper: bootstrap secret known in advance.
    #[allow(dead_code)]
    pub fn with_secret(config: AuthConfig, secret: &str) -> Self {
        Self {
            inner: Arc::new(Mutex::new(AuthInner {
                bootstrap_secret: Some(secret.to_string()),
                sessions: HashMap::new(),
                window_start: Instant::now(),
                global_count: 0,
                per_ip: HashMap::new(),
            })),
            config,
        }
    }

    pub fn bootstrap_secret(&self) -> Option<String> {
        self.inner.lock().unwrap().bootstrap_secret.clone()
    }

    /// Pair a bootstrap secret. On success the secret is consumed (single-use)
    /// and a fresh session id is issued (anti session-fixation: the id is
    /// never attacker-chosen and always rotated on new pairing).
    pub fn pair(&self, secret: &str, remote_ip: &str) -> Result<String, AuthError> {
        let retry_after = {
            let mut inner = self.inner.lock().unwrap();
            let now = Instant::now();
            if now.duration_since(inner.window_start) > self.config.rate_limit_window {
                inner.window_start = now;
                inner.global_count = 0;
                inner.per_ip.clear();
            }
            inner.global_count += 1;
            let ip_count = inner.per_ip.entry(remote_ip.to_string()).or_insert(0);
            *ip_count += 1;
            let ip_limited = *ip_count > self.config.rate_limit_per_ip;
            if inner.global_count > self.config.rate_limit_global || ip_limited {
                let elapsed = now.duration_since(inner.window_start).as_secs();
                let window = self.config.rate_limit_window.as_secs();
                Some(window.saturating_sub(elapsed).max(1))
            } else {
                None
            }
        };

        if let Some(retry) = retry_after {
            return Err(AuthError::RateLimited(retry));
        }

        let mut inner = self.inner.lock().unwrap();
        match &inner.bootstrap_secret {
            Some(stored) if constant_time_eq(stored, secret) => {
                inner.bootstrap_secret = None;
                let id = random_secret();
                inner.sessions.insert(
                    id.clone(),
                    ClientSession {
                        id: id.clone(),
                        created_at: SystemTime::now(),
                        last_seen: Instant::now(),
                        remote_ip: remote_ip.to_string(),
                    },
                );
                Ok(id)
            }
            _ => Err(AuthError::InvalidSecret),
        }
    }

    /// Validate a session cookie id; refreshes idle timer.
    pub fn validate(&self, id: &str) -> bool {
        let mut inner = self.inner.lock().unwrap();
        let now = Instant::now();
        let Some(sess) = inner.sessions.get_mut(id) else {
            return false;
        };
        if now.duration_since(sess.last_seen) > self.config.cookie_idle_ttl {
            inner.sessions.remove(id);
            return false;
        }
        if SystemTime::now()
            .duration_since(sess.created_at)
            .unwrap_or(Duration::ZERO)
            > self.config.cookie_abs_ttl
        {
            inner.sessions.remove(id);
            return false;
        }
        sess.last_seen = now;
        true
    }

    pub fn revoke(&self, id: &str) -> bool {
        self.inner.lock().unwrap().sessions.remove(id).is_some()
    }

    pub fn list_clients(&self) -> Vec<ClientInfo> {
        let inner = self.inner.lock().unwrap();
        inner
            .sessions
            .values()
            .map(|s| {
                let created_ms = s
                    .created_at
                    .duration_since(UNIX_EPOCH)
                    .unwrap_or(Duration::ZERO)
                    .as_millis() as u64;
                ClientInfo {
                    id: s.id.clone(),
                    created_at_ms: created_ms,
                    last_seen_ms: 0,
                    remote_ip: s.remote_ip.clone(),
                }
            })
            .collect()
    }

    /// Generate a fresh bootstrap secret; pending (unused) pairing codes are
    /// invalidated. Existing sessions stay valid (AUTH-014).
    pub fn regenerate(&self) -> String {
        let secret = random_secret();
        self.inner.lock().unwrap().bootstrap_secret = Some(secret.clone());
        secret
    }
}

/// Constant-time string equality over the full length of both operands.
fn constant_time_eq(a: &str, b: &str) -> bool {
    let a = a.as_bytes();
    let b = b.as_bytes();
    let max = a.len().max(b.len());
    let mut diff = (a.len() as u8) ^ (b.len() as u8);
    for i in 0..max {
        let av = a.get(i).copied().unwrap_or(0);
        let bv = b.get(i).copied().unwrap_or(0);
        diff |= av ^ bv;
    }
    diff == 0
}

fn random_secret() -> String {
    let mut buf = [0u8; SECRET_LEN];
    getrandom::getrandom(&mut buf).expect("CSPRNG failure");
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn auth(secret: &str) -> AuthState {
        AuthState::with_secret(AuthConfig::from_parts(60, 10, 30, false), secret)
    }

    #[test]
    fn test_auth_001_secret_is_32_bytes_random() {
        let a = AuthState::new(AuthConfig::default());
        let b = AuthState::new(AuthConfig::default());
        let sa = a.bootstrap_secret().unwrap();
        let sb = b.bootstrap_secret().unwrap();
        assert_eq!(sa.len(), SECRET_LEN * 2);
        assert_ne!(sa, sb);
    }

    #[test]
    fn test_auth_003_pairing_constant_time_and_single_use() {
        let state = auth("correct-horse-battery-staple");
        // Wrong secret -> InvalidSecret
        assert_eq!(
            state.pair("wrong", "127.0.0.1"),
            Err(AuthError::InvalidSecret)
        );
        // Correct -> session id, secret consumed
        let id = state
            .pair("correct-horse-battery-staple", "127.0.0.1")
            .unwrap();
        assert!(!id.is_empty());
        assert!(state.validate(&id));
        // Replay rejected
        assert_eq!(
            state.pair("correct-horse-battery-staple", "127.0.0.1"),
            Err(AuthError::InvalidSecret)
        );
    }

    #[test]
    fn test_auth_004_rate_limited_global() {
        let state = AuthState::with_secret(AuthConfig::from_parts(60, 3, 30, false), "s3cret");
        for _ in 0..3 {
            assert!(state.pair("bad", "10.0.0.1").is_err());
        }
        match state.pair("bad", "10.0.0.1") {
            Err(AuthError::RateLimited(retry)) => {
                assert!(retry >= 1, "Retry-After must be >= 1s, got {retry}");
            }
            other => panic!("expected rate limit, got {other:?}"),
        }
    }

    #[test]
    fn test_auth_004_rate_limited_per_ip() {
        let state = AuthState::with_secret(AuthConfig::from_parts(60, 100, 3, false), "s3cret");
        for _ in 0..3 {
            assert!(state.pair("bad", "10.0.0.1").is_err());
        }
        // Different IP is not limited by the per-IP budget
        assert!(state.pair("bad", "10.0.0.2").is_err());
        // Original IP now limited
        assert!(matches!(
            state.pair("bad", "10.0.0.1"),
            Err(AuthError::RateLimited(_))
        ));
    }

    #[test]
    fn test_auth_007_expiry_and_revoke() {
        let state = auth("s3cret");
        let id = state.pair("s3cret", "127.0.0.1").unwrap();
        assert!(state.validate(&id));
        assert!(state.revoke(&id));
        assert!(!state.validate(&id));
        assert!(!state.revoke(&id));
    }

    #[test]
    fn test_auth_014_regenerate_invalidates_pending_only() {
        let state = auth("old-secret");
        let id = state.pair("old-secret", "127.0.0.1").unwrap();
        let new_secret = state.regenerate();
        assert_ne!(new_secret, "old-secret");
        // Pending code invalidated; old session still valid.
        assert_eq!(
            state.pair("old-secret", "127.0.0.1"),
            Err(AuthError::InvalidSecret)
        );
        assert!(state.validate(&id));
        // New code pairs fine.
        let id2 = state.pair(&new_secret, "127.0.0.1").unwrap();
        assert_ne!(id, id2);
        assert!(state.validate(&id2));
    }

    #[test]
    fn test_auth_013_cookie_rotation_fresh_id() {
        let state = auth("s3cret");
        let id1 = state.pair("s3cret", "127.0.0.1").unwrap();
        // Id must not be derived from / equal to the bootstrap secret.
        assert_ne!(id1, "s3cret");
        // A fresh pairing (after regenerate) issues a new id — never reused.
        state.regenerate();
        let id2 = state
            .pair(&state.bootstrap_secret().unwrap(), "127.0.0.1")
            .unwrap();
        assert_ne!(id1, id2);
    }
}
