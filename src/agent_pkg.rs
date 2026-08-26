// APKG-001..007 (spec 013): coding-agent package center — install/uninstall
// npm-packaged agents from the UI. Security posture mirrors distro_mgmt.rs:
// argv-only (no `sh -c`), package names come from a STATIC allowlist, env ids
// are validated against the environment list, one management task at a time,
// cancel = SIGKILL.
use std::collections::HashMap;
use std::sync::{Arc, OnceLock};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex};

/// APKG-001: static npm package allowlist per agent id. Agents absent here
/// (e.g. `antigravity`) are NOT server-installable (spec 013 D4).
pub fn npm_package(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "opencode" => Some("opencode-ai"),
        "claude-code" => Some("@anthropic-ai/claude-code"),
        "codex" => Some("@openai/codex"),
        "9router" => Some("9router"),
        _ => None,
    }
}

fn env_known(env_id: &str) -> bool {
    env_id == "termux"
        || crate::environments::list_environments()
            .iter()
            .any(|e| e.id == env_id)
}

/// argv prefix to run a command inside env (empty for termux host).
fn base_argv(env_id: &str) -> Result<Vec<String>, String> {
    if !env_known(env_id) {
        return Err(String::from("UNKNOWN_ENV"));
    }
    Ok(if env_id == "termux" {
        Vec::new()
    } else {
        vec![
            "proot-distro".into(),
            "login".into(),
            env_id.to_string(),
            "--".into(),
        ]
    })
}

/// APKG-004: pre-check Node.js presence (`node --version`) inside env.
pub fn node_check_argv(env_id: &str) -> Result<Vec<String>, String> {
    let mut v = base_argv(env_id)?;
    v.extend(["node".into(), "--version".into()]);
    Ok(v)
}

/// APKG-002: argv-only install command for an npm-packaged agent.
pub fn pkg_install_argv(env_id: &str, agent_id: &str) -> Result<Vec<String>, String> {
    let pkg = npm_package(agent_id).ok_or_else(|| String::from("UNKNOWN_AGENT"))?;
    let mut v = base_argv(env_id)?;
    v.extend(["npm".into(), "install".into(), "-g".into(), pkg.into()]);
    Ok(v)
}

/// APKG-002: argv-only uninstall command.
pub fn pkg_uninstall_argv(env_id: &str, agent_id: &str) -> Result<Vec<String>, String> {
    let pkg = npm_package(agent_id).ok_or_else(|| String::from("UNKNOWN_AGENT"))?;
    let mut v = base_argv(env_id)?;
    v.extend(["npm".into(), "uninstall".into(), "-g".into(), pkg.into()]);
    Ok(v)
}

/// APKG-004: synchronous node pre-check; Err carries a user-facing hint.
pub fn node_present(env_id: &str) -> Result<(), String> {
    let argv = node_check_argv(env_id)?;
    let ok = argv
        .split_first()
        .and_then(|(prog, args)| std::process::Command::new(prog).args(args).output().ok())
        .map(|o| o.status.success())
        .unwrap_or(false);
    if ok {
        Ok(())
    } else {
        Err(String::from(
            "NODE_MISSING: Node.js tidak ditemukan di environment ini. \
             Install dulu (mis. `pkg install nodejs-lts` di Termux atau \
             `apt install nodejs` di dalam distro), lalu coba lagi.",
        ))
    }
}

// ── APKG-003: task registry (single slot, argv spawn, broadcast lines) ──────

#[derive(Clone)]
struct TaskHandle {
    kind: String,
    target: String,
    child: Arc<std::sync::Mutex<Child>>,
    done: Arc<std::sync::atomic::AtomicBool>,
    exit_code: Arc<std::sync::Mutex<Option<i32>>>,
    lines_tx: broadcast::Sender<String>,
}

impl TaskHandle {
    fn snapshot(&self) -> AgentTaskStatus {
        AgentTaskStatus {
            kind: self.kind.clone(),
            target: self.target.clone(),
            running: !self.done.load(std::sync::atomic::Ordering::Relaxed),
            exit_code: *self.exit_code.lock().expect("exit mutex"),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentTaskStatus {
    pub kind: String,
    pub target: String,
    pub running: bool,
    pub exit_code: Option<i32>,
}

#[derive(Default)]
pub struct AgentTaskRegistry {
    current: Option<(String, TaskHandle)>,
    finished: HashMap<String, TaskHandle>,
}

/// Process-wide single slot so concurrent npm runs never fight over locks.
pub fn shared_registry() -> Arc<Mutex<AgentTaskRegistry>> {
    static CELL: OnceLock<Arc<Mutex<AgentTaskRegistry>>> = OnceLock::new();
    CELL.get_or_init(|| Arc::new(Mutex::new(AgentTaskRegistry::default())))
        .clone()
}

impl AgentTaskRegistry {
    /// Spawn a fully-built argv (program + args). Validation is the caller's
    /// job via the pure builders above.
    pub async fn spawn_argv(
        &mut self,
        kind: &str,
        target: &str,
        argv: &[String],
    ) -> Result<String, String> {
        if self.current.is_some() {
            return Err(String::from("TASK_BUSY"));
        }
        let (prog, args) = argv
            .split_first()
            .ok_or_else(|| String::from("EMPTY_ARGV"))?;
        let mut cmd = Command::new(prog);
        cmd.args(args);
        cmd.stdin(std::process::Stdio::null());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("SPAWN_FAILED:{e}"))?;
        let stdout = child.stdout.take().expect("stdout piped");
        let stderr = child.stderr.take().expect("stderr piped");
        let (tx, _) = broadcast::channel::<String>(256);
        fn boxed(
            r: impl tokio::io::AsyncRead + Unpin + Send + 'static,
        ) -> Box<dyn tokio::io::AsyncRead + Unpin + Send> {
            Box::new(r)
        }
        for mut stream in [boxed(stdout), boxed(stderr)] {
            let tx = tx.clone();
            tokio::spawn(async move {
                let mut lines = tokio::io::BufReader::new(&mut stream).lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    let _ = tx.send(line);
                }
            });
        }
        let id = format!("tool-{}", next_task_id_seq());
        let handle = TaskHandle {
            kind: kind.into(),
            target: target.into(),
            child: Arc::new(std::sync::Mutex::new(child)),
            done: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            exit_code: Arc::new(std::sync::Mutex::new(None)),
            lines_tx: tx,
        };
        // Watcher polls try_wait (never parks on the child lock so cancel()
        // can always reach it).
        let watcher = handle.clone();
        tokio::spawn(async move {
            let code = loop {
                {
                    let mut g = watcher.child.lock().expect("child mutex");
                    match g.try_wait() {
                        Ok(Some(st)) => break st.code(),
                        Ok(None) => {}
                        Err(_) => break None,
                    }
                }
                tokio::time::sleep(std::time::Duration::from_millis(120)).await;
            };
            *watcher.exit_code.lock().expect("exit mutex") = code;
            watcher
                .done
                .store(true, std::sync::atomic::Ordering::Relaxed);
        });
        self.current = Some((id.clone(), handle));
        Ok(id)
    }

    pub fn subscribe(&self, task_id: &str) -> Option<broadcast::Receiver<String>> {
        self.handle_of(task_id).map(|h| h.lines_tx.subscribe())
    }

    pub fn status(&self, task_id: &str) -> Option<AgentTaskStatus> {
        self.handle_of(task_id).map(|h| h.snapshot())
    }

    fn handle_of(&self, task_id: &str) -> Option<TaskHandle> {
        if let Some((cur_id, h)) = &self.current {
            if cur_id == task_id {
                return Some(h.clone());
            }
        }
        self.finished.get(task_id).cloned()
    }

    /// Cancel the running task (SIGKILL via start_kill). False when unknown.
    pub async fn cancel(&mut self, task_id: &str) -> bool {
        match self.current.take() {
            Some((id, h)) if id == task_id => {
                let _ = h.child.lock().expect("child mutex").start_kill();
                self.finished.insert(id, h);
                true
            }
            other => {
                self.current = other;
                false
            }
        }
    }

    /// Reap finished current-task into history; returns its status once done.
    pub async fn reap_if_done(&mut self) -> Option<(String, AgentTaskStatus)> {
        let running = match &self.current {
            Some((_, h)) => !h.done.load(std::sync::atomic::Ordering::Relaxed),
            None => return None,
        };
        if running {
            return None;
        }
        let (id, h) = self.current.take()?;
        let st = h.snapshot();
        self.finished.insert(id.clone(), h);
        Some((id, st))
    }

    pub fn has_running(&self) -> bool {
        self.current.is_some()
    }
}

fn next_task_id_seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(1);
    SEQ.fetch_add(1, Ordering::Relaxed)
}
