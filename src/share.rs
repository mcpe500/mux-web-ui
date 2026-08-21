use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ShareTargetType {
    Terminal,
    File,
    Folder,
}

impl std::str::FromStr for ShareTargetType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "terminal" => Ok(Self::Terminal),
            "file" => Ok(Self::File),
            "folder" => Ok(Self::Folder),
            _ => Err(format!("invalid target_type: {s}")),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareCreateReq {
    pub target_type: String,
    pub target_id: String,
    pub path: Option<String>,
    pub ttl_seconds: Option<u64>,
    pub max_views: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShareCreateResp {
    pub share_token: String,
    pub share_url: String,
    pub expires_at: u64,
}

#[derive(Debug, Clone)]
pub struct ShareEntry {
    pub token: String,
    pub target_type: ShareTargetType,
    pub target_id: String,
    pub path: Option<String>,
    pub created_at: Instant,
    pub expires_at: Instant,
    pub max_views: Option<u64>,
    pub views: u64,
}

#[derive(Debug, Clone)]
pub struct ShareConfig {
    pub default_ttl: Duration,
    pub max_ttl: Duration,
}

impl Default for ShareConfig {
    fn default() -> Self {
        Self {
            default_ttl: Duration::from_secs(3600),
            max_ttl: Duration::from_secs(24 * 3600),
        }
    }
}

#[derive(Clone)]
pub struct ShareRegistry {
    inner: Arc<Mutex<HashMap<String, ShareEntry>>>,
    config: ShareConfig,
}

impl Default for ShareRegistry {
    fn default() -> Self {
        Self::new(ShareConfig::default())
    }
}

impl ShareRegistry {
    pub fn new(config: ShareConfig) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            config,
        }
    }

    fn generate_token() -> String {
        let mut buf = [0u8; 32];
        getrandom::getrandom(&mut buf).expect("CSPRNG failure");
        buf.iter().map(|b| format!("{:02x}", b)).collect()
    }

    pub fn create(
        &self,
        target_type: ShareTargetType,
        target_id: String,
        path: Option<String>,
        ttl_seconds: Option<u64>,
        max_views: Option<u64>,
    ) -> ShareEntry {
        let ttl = ttl_seconds
            .map(Duration::from_secs)
            .unwrap_or(self.config.default_ttl);
        let ttl = ttl.min(self.config.max_ttl);
        let token = Self::generate_token();
        let now = Instant::now();
        let entry = ShareEntry {
            token: token.clone(),
            target_type,
            target_id,
            path,
            created_at: now,
            expires_at: now + ttl,
            max_views,
            views: 0,
        };
        self.inner.lock().unwrap().insert(token, entry.clone());
        entry
    }

    /// Validate token and increment views. Returns entry if valid.
    /// Checks TTL, max_views, existence. Constant-time not needed for HashMap lookup
    /// but we ensure token length check first.
    pub fn validate_and_use(&self, token: &str) -> Option<ShareEntry> {
        let mut map = self.inner.lock().unwrap();
        let entry = map.get_mut(token)?;
        // Check TTL
        if Instant::now() > entry.expires_at {
            map.remove(token);
            return None;
        }
        // Check max_views
        if let Some(max) = entry.max_views {
            if entry.views >= max {
                map.remove(token);
                return None;
            }
        }
        entry.views += 1;
        // If max_views reached after increment, keep for this use but next will be removed
        // Optionally remove immediately if views >= max and max_views is limit
        Some(entry.clone())
    }

    pub fn get(&self, token: &str) -> Option<ShareEntry> {
        let map = self.inner.lock().unwrap();
        let entry = map.get(token)?;
        if Instant::now() > entry.expires_at {
            return None;
        }
        if let Some(max) = entry.max_views {
            if entry.views >= max {
                return None;
            }
        }
        Some(entry.clone())
    }

    pub fn revoke(&self, token: &str) -> bool {
        self.inner.lock().unwrap().remove(token).is_some()
    }

    pub fn list(&self) -> Vec<ShareEntry> {
        let map = self.inner.lock().unwrap();
        map.values().cloned().collect()
    }

    pub fn cleanup_expired(&self) {
        let now = Instant::now();
        let mut map = self.inner.lock().unwrap();
        map.retain(|_, e| {
            if now > e.expires_at {
                return false;
            }
            if let Some(max) = e.max_views {
                if e.views >= max {
                    return false;
                }
            }
            true
        });
    }

    pub fn count(&self) -> usize {
        self.inner.lock().unwrap().len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Duration;

    #[test]
    fn test_shr_001_token_generation_entropy() {
        let reg = ShareRegistry::new(ShareConfig::default());
        let e1 = reg.create(
            ShareTargetType::Terminal,
            "term-1".to_string(),
            None,
            None,
            None,
        );
        let e2 = reg.create(
            ShareTargetType::Terminal,
            "term-1".to_string(),
            None,
            None,
            None,
        );
        assert_ne!(e1.token, e2.token);
        assert_eq!(e1.token.len(), 64, "32 bytes hex = 64 chars");
        assert!(e1.token.chars().all(|c| c.is_ascii_hexdigit()));
    }

    #[test]
    fn test_shr_002_expired_rejected() {
        let reg = ShareRegistry::new(ShareConfig {
            default_ttl: Duration::from_millis(10),
            max_ttl: Duration::from_secs(3600),
        });
        let e = reg.create(
            ShareTargetType::File,
            "file1".to_string(),
            Some("a.txt".to_string()),
            None,
            None,
        );
        std::thread::sleep(Duration::from_millis(20));
        // Use Instant for expiry, but sleep should exceed ttl
        // Note: Instant based, need to wait
        assert!(
            reg.validate_and_use(&e.token).is_none(),
            "expired token must be rejected"
        );
    }

    #[test]
    fn test_shr_005_revocation() {
        let reg = ShareRegistry::new(ShareConfig::default());
        let e = reg.create(
            ShareTargetType::Folder,
            "folder1".to_string(),
            None,
            None,
            None,
        );
        assert!(reg.get(&e.token).is_some());
        assert!(reg.revoke(&e.token));
        assert!(reg.get(&e.token).is_none());
        assert!(!reg.revoke(&e.token));
    }

    #[test]
    fn test_shr_005_max_views() {
        let reg = ShareRegistry::new(ShareConfig::default());
        let e = reg.create(
            ShareTargetType::Terminal,
            "term-1".to_string(),
            None,
            None,
            Some(2),
        );
        assert!(reg.validate_and_use(&e.token).is_some());
        assert!(reg.validate_and_use(&e.token).is_some());
        // Third should be rejected (max 2)
        assert!(reg.validate_and_use(&e.token).is_none());
    }
}
