// DISTRO-001..002 (spec 011): proot-distro catalog + install/remove task
// runner. Security posture: argv-only (no `sh -c`), ids validated against
// BOTH a strict regex and the official `proot-distro list` membership, one
// management task at a time, cancel = kill.
use std::collections::HashMap;
use std::path::Path;
use std::sync::{Arc, OnceLock};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex};

/// DISTRO-001: installed vs available distro catalog.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DistroCatalog {
    pub installed: Vec<String>,
    /// Known-but-not-installed distros (installable).
    pub available: Vec<String>,
}

pub fn valid_distro_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 32
        && id
            .chars()
            .next()
            .map(|c| c.is_ascii_lowercase())
            .unwrap_or(false)
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

/// Parse `proot-distro list` human output: lines like
/// `  - ubuntu: Ubuntu 24.04 LTS [installed]` / `[not installed]`.
/// Tolerates `--terse` style bare names (treated as installed).
pub fn parse_proot_list(stdout: &str) -> Vec<(String, bool)> {
    let mut out: Vec<(String, bool)> = Vec::new();
    for line in stdout.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let l = l.strip_prefix('-').unwrap_or(l).trim();
        if l.contains('[') && l.contains(']') && l.contains(':') {
            let name = l.split(':').next().unwrap_or("").trim().to_string();
            let installed = l.to_ascii_lowercase().contains("[installed]");
            if valid_distro_id(&name) && !out.iter().any(|(n, _)| n == &name) {
                out.push((name, installed));
            }
        } else if l.contains(':') {
            let name = l.split(':').next().unwrap_or("").trim().to_string();
            if valid_distro_id(&name) && !out.iter().any(|(n, _)| n == &name) {
                out.push((name, false));
            }
        } else if valid_distro_id(l.split_whitespace().next().unwrap_or("")) {
            out.push((l.split_whitespace().next().unwrap_or("").to_string(), true));
        }
    }
    out
}

/// DISTRO-001: build the catalog. Uses CLI when present; falls back to the
/// filesystem installed-distros listing (environments.rs) otherwise.
pub fn catalog(program: Option<&Path>) -> DistroCatalog {
    let run_list = |prog: &Path| -> Option<Vec<(String, bool)>> {
        let out = std::process::Command::new(prog).arg("list").output().ok()?;
        if !out.status.success() {
            return None;
        }
        Some(parse_proot_list(&String::from_utf8_lossy(&out.stdout)))
    };
    let parsed = program.and_then(run_list);
    match parsed {
        Some(v) if !v.is_empty() => DistroCatalog {
            installed: v
                .iter()
                .filter(|(_, i)| *i)
                .map(|(n, _)| n.clone())
                .collect(),
            available: v
                .iter()
                .filter(|(_, i)| !*i)
                .map(|(n, _)| n.clone())
                .collect(),
        },
        _ => {
            let installed = crate::environments::list_distros(None);
            DistroCatalog {
                installed,
                available: Vec::new(),
            }
        }
    }
}

/// Argv builders — None when the id fails validation. Membership against the
/// official list is enforced by callers via `catalog()`.
pub fn install_argv(id: &str) -> Option<Vec<String>> {
    if !valid_distro_id(id) {
        return None;
    }
    Some(vec![
        "proot-distro".into(),
        "install".into(),
        id.to_string(),
    ])
}

/// Q2/D-log (spec 011): `proot-distro remove` is non-interactive in current
/// releases; no extra flag needed. Runner additionally pipes "y\n" as a belt-
/// and-braces measure for older builds.
pub fn remove_argv(id: &str) -> Option<Vec<String>> {
    if !valid_distro_id(id) {
        return None;
    }
    Some(vec!["proot-distro".into(), "remove".into(), id.to_string()])
}

// ── Task registry ────────────────────────────────────────────────────────────

#[derive(Clone)]
struct TaskHandle {
    kind: String,
    distro: String,
    child: Arc<std::sync::Mutex<Child>>,
    done: Arc<std::sync::atomic::AtomicBool>,
    exit_code: Arc<std::sync::Mutex<Option<i32>>>,
    lines_tx: broadcast::Sender<String>,
}

impl TaskHandle {
    fn snapshot(&self) -> MgmtTaskStatus {
        MgmtTaskStatus {
            kind: self.kind.clone(),
            distro: self.distro.clone(),
            running: !self.done.load(std::sync::atomic::Ordering::Relaxed),
            exit_code: *self.exit_code.lock().expect("exit mutex"),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MgmtTaskStatus {
    pub kind: String,
    pub distro: String,
    pub running: bool,
    pub exit_code: Option<i32>,
}

#[derive(Default)]
pub struct DistroTaskRegistry {
    program: Option<String>,
    current: Option<(String, TaskHandle)>,
    finished: HashMap<String, TaskHandle>,
}

/// Global shared registry (one process-wide management slot).
pub fn shared_registry() -> Arc<Mutex<DistroTaskRegistry>> {
    static CELL: OnceLock<Arc<Mutex<DistroTaskRegistry>>> = OnceLock::new();
    CELL.get_or_init(|| Arc::new(Mutex::new(DistroTaskRegistry::default())))
        .clone()
}

impl DistroTaskRegistry {
    /// Override the proot-distro binary path (tests inject a fixture script).
    pub fn with_program(mut self, program: impl Into<String>) -> Self {
        self.program = Some(program.into());
        self
    }

    fn prog(&self) -> String {
        self.program
            .clone()
            .unwrap_or_else(|| "proot-distro".into())
    }

    /// DISTRO-001 via the (possibly injected) CLI program.
    pub fn catalog(&self) -> DistroCatalog {
        catalog(self.program.as_deref().map(std::path::Path::new))
    }

    /// DISTRO-002: spawn install/remove. Validation first (bad id → error),
    /// then the single-slot guard (TASK_BUSY) for otherwise-valid requests.
    pub async fn spawn(
        &mut self,
        kind: &str,
        distro_id: &str,
        allowed_ids: &[String],
    ) -> Result<String, String> {
        let argv = match kind {
            "install" => install_argv(distro_id),
            "remove" => remove_argv(distro_id),
            _ => return Err(String::from("BAD_KIND")),
        }
        .ok_or_else(|| String::from("INVALID_ID"))?;
        // double gate: regex (above) + official list membership
        if !allowed_ids.iter().any(|a| a == distro_id) {
            return Err(String::from("UNKNOWN_DISTRO"));
        }
        if self.current.is_some() {
            return Err(String::from("TASK_BUSY"));
        }
        let mut cmd = Command::new(self.prog());
        cmd.args(&argv[1..]);
        cmd.stdin(std::process::Stdio::piped());
        cmd.stdout(std::process::Stdio::piped());
        cmd.stderr(std::process::Stdio::piped());
        let mut child = cmd.spawn().map_err(|e| format!("SPAWN_FAILED:{e}"))?;
        // non-interactive confirmation for older remove builds (Q2/D-log)
        if let Some(mut si) = child.stdin.take() {
            use tokio::io::AsyncWriteExt;
            let _ = si.write_all(b"y\n").await;
            drop(si); // EOF so tools reading stdin exit cleanly
        }
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
        let id = format!("task-{}", next_task_id_seq());
        let handle = TaskHandle {
            kind: kind.into(),
            distro: distro_id.into(),
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

    /// Subscribe to live output lines of a task.
    pub fn subscribe(&self, task_id: &str) -> Option<broadcast::Receiver<String>> {
        let h = self.handle_of(task_id)?;
        Some(h.lines_tx.subscribe())
    }

    pub fn status(&self, task_id: &str) -> Option<MgmtTaskStatus> {
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

    /// Cancel the running task (SIGKILL via start_kill). Returns false when
    /// unknown/finished.
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
    pub async fn reap_if_done(&mut self) -> Option<(String, MgmtTaskStatus)> {
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
