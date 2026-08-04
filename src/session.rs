use crate::pty::PtySession;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tokio::sync::mpsc;
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
}

pub struct TerminalSessionInstance {
    pub metadata: SessionMetadata,
    pub pty: PtySession,
    pub output_rx: Option<mpsc::Receiver<Vec<u8>>>,
}

#[derive(Clone)]
pub struct SessionRegistry {
    sessions: Arc<Mutex<HashMap<String, Arc<TerminalSessionInstance>>>>,
}

impl SessionRegistry {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn create_session(
        &self,
        cols: u16,
        rows: u16,
        work_dir: Option<PathBuf>,
        shell: Option<String>,
    ) -> Result<SessionMetadata, String> {
        let id = format!("term-{}", rand_id());
        let token = format!("tok-{}", rand_id());

        let (tx, rx) = mpsc::channel(256);

        let pty = PtySession::new(cols, rows, work_dir, shell, tx)?;

        let metadata = SessionMetadata {
            id: id.clone(),
            token,
            cols,
            rows,
            state: SessionState::Running,
        };

        let instance = Arc::new(TerminalSessionInstance {
            metadata: metadata.clone(),
            pty,
            output_rx: Some(rx),
        });

        self.sessions.lock().unwrap().insert(id, instance);
        Ok(metadata)
    }

    pub fn take_output_rx(&self, id: &str) -> Option<mpsc::Receiver<Vec<u8>>> {
        let mut map = self.sessions.lock().unwrap();
        if let Some(instance) = map.get_mut(id) {
            if let Some(arc_inst) = Arc::get_mut(instance) {
                return arc_inst.output_rx.take();
            }
        }
        None
    }

    pub fn get_session(&self, id: &str) -> Option<Arc<TerminalSessionInstance>> {
        self.sessions.lock().unwrap().get(id).cloned()
    }

    pub fn remove_session(&self, id: &str) -> Result<(), String> {
        let mut map = self.sessions.lock().unwrap();
        if let Some(instance) = map.remove(id) {
            info!("Cleaning up terminal session {}", id);
            let _ = instance.pty.kill();
            Ok(())
        } else {
            Ok(())
        }
    }

    pub fn stop_all(&self) {
        let mut map = self.sessions.lock().unwrap();
        for (id, instance) in map.drain() {
            info!("Stopping terminal session {}", id);
            let _ = instance.pty.kill();
        }
    }

    pub fn list_sessions(&self) -> Vec<SessionMetadata> {
        let map = self.sessions.lock().unwrap();
        map.values().map(|s| s.metadata.clone()).collect()
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
