// PY-001..006 (spec 014): python runner. Security posture mirrors
// agent_pkg.rs: argv-only (no `sh -c`), interpreter from a STATIC allowlist
// ("python3" only, shebang ignored — spec PY-006 v1), paths resolved by the
// caller via AllowedRoots, separate single-slot RunTaskRegistry so long runs
// never block agent installs (spec D9), timeout via MUX_WEB_RUN_TIMEOUT_SECS.
use std::collections::{HashMap, VecDeque};
use std::path::Path;
use std::sync::{Arc, Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};
use tokio::process::{Child, Command};
use tokio::sync::{broadcast, Mutex};

/// Host directory a run should start in: parent of the script on HOST.
/// For distro envs shared prefixes (/sdcard etc.) survive via
/// translate_cwd_for_env; private dirs fall back to distro HOME.
pub fn host_cwd_for(abs_path: &str) -> Option<std::path::PathBuf> {
    Path::new(abs_path)
        .parent()
        .filter(|p| !p.as_os_str().is_empty())
        .map(|p| p.to_path_buf())
}

fn env_known(env_id: &str) -> bool {
    env_id == "termux"
        || crate::environments::list_environments()
            .iter()
            .any(|e| e.id == env_id)
}

/// PY-001: pure argv builder. Interpreter comes from a STATIC allowlist
/// ("python3", shebang ignored per PY-006 v1); user code never touches argv.
pub fn python_run_argv(env_id: &str, abs_path: &str) -> Result<Vec<String>, String> {
    if !env_known(env_id) {
        return Err(String::from("UNKNOWN_ENV"));
    }
    let mut v = if env_id == "termux" {
        Vec::new()
    } else {
        vec![
            "proot-distro".into(),
            "login".into(),
            env_id.to_string(),
            "--".into(),
        ]
    };
    v.extend(["python3".to_string(), abs_path.to_string()]);
    Ok(v)
}

type ProbeCache = HashMap<(String, String), (bool, Instant)>;

fn probe_cache() -> &'static StdMutex<ProbeCache> {
    static CELL: OnceLock<StdMutex<ProbeCache>> = OnceLock::new();
    CELL.get_or_init(|| StdMutex::new(HashMap::new()))
}

pub const PROBE_TTL: Duration = Duration::from_secs(30);

/// Testable core of the presence probe with 30s TTL caching keyed by
/// `tag`:env_id so injected fakes never poison production entries.
pub fn python_probe_cached(tag: &str, env_id: &str, runner: impl FnOnce(&str) -> bool) -> bool {
    let key = (tag.to_string(), env_id.to_string());
    {
        let map = probe_cache().lock().unwrap();
        if let Some((found, ts)) = map.get(&key) {
            if ts.elapsed() < PROBE_TTL {
                return *found;
            }
        }
    }
    let found = runner(env_id);
    probe_cache()
        .lock()
        .unwrap()
        .insert(key, (found, Instant::now()));
    found
}

fn which(bin: &str) -> bool {
    std::env::var("PATH")
        .ok()
        .map(|paths| std::env::split_paths(&paths).any(|p| p.join(bin).is_file()))
        .unwrap_or(false)
}

fn real_probe(env_id: &str) -> bool {
    if env_id == "termux" {
        which("python3")
    } else {
        // distro: command -v inside the proot root (agents.rs pattern)
        std::process::Command::new("proot-distro")
            .args(["login", env_id, "--", "sh", "-lc", "command -v python3"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// APKG-004-style pre-check; Err carries the user-facing PYTHON_MISSING hint.
pub fn python_present(env_id: &str) -> Result<(), String> {
    let ok = python_probe_cached("real-python3", env_id, real_probe);
    if ok {
        Ok(())
    } else {
        Err(format!(
            "PYTHON_MISSING: python3 tidak ditemukan di environment '{env_id}'. \
             Install dulu via Support Hub (`pm install python` di Termux atau \
             `apt install python3` di dalam distro), lalu coba lagi."
        ))
    }
}

// ── PY-004: run task registry (separate slot, argv spawn, bounded history) ──

#[derive(Clone)]
struct RunHandle {
    kind: String,
    target: String,
    child: Arc<std::sync::Mutex<Child>>,
    done: Arc<std::sync::atomic::AtomicBool>,
    exit_code: Arc<std::sync::Mutex<Option<i32>>>,
    timed_out: Arc<std::sync::atomic::AtomicBool>,
    lines_tx: broadcast::Sender<String>,
}

impl RunHandle {
    fn snapshot(&self) -> RunTaskStatus {
        RunTaskStatus {
            kind: self.kind.clone(),
            target: self.target.clone(),
            running: !self.done.load(std::sync::atomic::Ordering::Relaxed),
            exit_code: *self.exit_code.lock().expect("exit mutex"),
            timed_out: self.timed_out.load(std::sync::atomic::Ordering::Relaxed),
        }
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct RunTaskStatus {
    pub kind: String,
    pub target: String,
    pub running: bool,
    pub exit_code: Option<i32>,
    pub timed_out: bool,
}

/// Max retained finished tasks; oldest evicted by insertion order.
pub const FINISHED_CAP: usize = 16;

/// F2 (spec 014 flood guard): hard cap for ONE streamed line; longer runs are
/// emitted as a single truncated head + "\n<…truncated>" marker.
pub const MAX_LINE_BYTES: usize = 256 * 1024;

#[derive(Default)]
pub struct RunTaskRegistry {
    current: Option<(String, RunHandle)>,
    finished: HashMap<String, RunHandle>,
    order: VecDeque<String>,
}

impl RunTaskRegistry {
    /// Spawn a fully-built argv. Caller owns validation (allowlist builder +
    /// AllowedRoots resolution). `timeout` = Some(elapse → SIGKILL + timed_out
    /// flag); `None` = unbounded (still cancellable).
    pub async fn spawn_run(
        &mut self,
        kind: &str,
        target: &str,
        argv: &[String],
        cwd: Option<&Path>,
        timeout: Option<Duration>,
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
        if let Some(dir) = cwd {
            if dir.is_dir() {
                cmd.current_dir(dir);
            }
        }
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
                pump_capped_lines(&mut stream, &tx).await;
            });
        }
        let id = format!("run-{}", next_run_id_seq());
        let handle = RunHandle {
            kind: kind.into(),
            target: target.into(),
            child: Arc::new(std::sync::Mutex::new(child)),
            done: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            exit_code: Arc::new(std::sync::Mutex::new(None)),
            timed_out: Arc::new(std::sync::atomic::AtomicBool::new(false)),
            lines_tx: tx,
        };
        // Watcher polls try_wait with a deadline; never parks on the child
        // lock so cancel() can always reach it.
        let watcher = handle.clone();
        tokio::spawn(async move {
            let deadline = timeout.map(|d| Instant::now() + d);
            let code = loop {
                {
                    let mut g = watcher.child.lock().expect("child mutex");
                    match g.try_wait() {
                        Ok(Some(st)) => break st.code(),
                        Ok(None) => {}
                        Err(_) => break None,
                    }
                    if let Some(dl) = deadline {
                        if Instant::now() >= dl {
                            watcher
                                .timed_out
                                .store(true, std::sync::atomic::Ordering::Relaxed);
                            let _ = g.start_kill();
                        }
                    }
                }
                tokio::time::sleep(Duration::from_millis(120)).await;
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

    pub fn status(&self, task_id: &str) -> Option<RunTaskStatus> {
        self.handle_of(task_id).map(|h| h.snapshot())
    }

    fn handle_of(&self, task_id: &str) -> Option<RunHandle> {
        if let Some((cur_id, h)) = &self.current {
            if cur_id == task_id {
                return Some(h.clone());
            }
        }
        self.finished.get(task_id).cloned()
    }

    fn insert_finished(&mut self, id: String, h: RunHandle) {
        while self.order.len() >= FINISHED_CAP {
            if let Some(old) = self.order.pop_front() {
                self.finished.remove(&old);
            }
        }
        self.finished.insert(id.clone(), h);
        self.order.push_back(id);
    }

    /// Cancel the RUNNING task (SIGKILL). False when absent or already done;
    /// finished tasks stay queryable either way.
    pub async fn cancel(&mut self, task_id: &str) -> bool {
        match self.current.take() {
            Some((id, h)) if id == task_id => {
                let already_done = h.done.load(std::sync::atomic::Ordering::Relaxed);
                if !already_done {
                    let _ = h.child.lock().expect("child mutex").start_kill();
                    self.insert_finished(id, h);
                    true
                } else {
                    self.insert_finished(id, h);
                    false
                }
            }
            other => {
                self.current = other;
                false
            }
        }
    }

    /// Liveness fallback: if the watcher task itself is gone (its runtime was
    /// dropped before it observed exit), we can still observe child death via
    /// a synchronous try_wait here — the slot must NEVER wedge on missing
    /// task-local state.
    fn observe_child_once(&self) {
        let Some((_, h)) = &self.current else {
            return;
        };
        if h.done.load(std::sync::atomic::Ordering::Relaxed) {
            return;
        }
        let mut g = h.child.lock().expect("child mutex");
        if let Ok(Some(st)) = g.try_wait() {
            *h.exit_code.lock().expect("exit mutex") = st.code();
            h.done.store(true, std::sync::atomic::Ordering::Relaxed);
        }
    }

    /// Reap finished current-task into bounded history.
    pub async fn reap_if_done(&mut self) -> Option<(String, RunTaskStatus)> {
        self.observe_child_once();
        let running = match &self.current {
            Some((_, h)) => !h.done.load(std::sync::atomic::Ordering::Relaxed),
            None => return None,
        };
        if running {
            return None;
        }
        let (id, h) = self.current.take()?;
        let st = h.snapshot();
        self.insert_finished(id.clone(), h);
        Some((id, st))
    }

    pub fn has_running(&self) -> bool {
        self.current.is_some()
    }

    /// Test diagnostics: snapshot of the current slot (if any).
    #[doc(hidden)]
    pub fn debug_current_status(&self) -> Option<RunTaskStatus> {
        self.current.as_ref().map(|(_, h)| h.snapshot())
    }

    pub fn finished_count(&self) -> usize {
        self.finished.len()
    }
}

/// Process-wide registry for the "python" run kind (NOT agent_pkg's slot).
pub fn shared_registry() -> Arc<Mutex<RunTaskRegistry>> {
    static CELL: OnceLock<Arc<Mutex<RunTaskRegistry>>> = OnceLock::new();
    CELL.get_or_init(|| Arc::new(Mutex::new(RunTaskRegistry::default())))
        .clone()
}

fn next_run_id_seq() -> u64 {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(1);
    SEQ.fetch_add(1, Ordering::Relaxed)
}

const TRUNC_MARKER: &str = "\n<…truncated>";

/// F2 flood guard: read one stream emitting newline-delimited lines, each hard
/// capped at MAX_LINE_BYTES. An overlong (newline-less) run is flushed once as
/// head+marker, then consumed silently until the next real `\n`.
async fn pump_capped_lines(
    r: &mut (dyn tokio::io::AsyncRead + Unpin + Send),
    tx: &broadcast::Sender<String>,
) {
    let mut chunk = [0u8; 8192];
    let mut acc: Vec<u8> = Vec::with_capacity(8192);
    let mut skipping = false;
    loop {
        let n = match tokio::io::AsyncReadExt::read(r, &mut chunk).await {
            Ok(0) | Err(_) => break,
            Ok(n) => n,
        };
        for &b in &chunk[..n] {
            if skipping {
                if b == b'\n' {
                    skipping = false;
                }
                continue;
            }
            acc.push(b);
            if b == b'\n' {
                acc.pop();
                let _ = tx.send(String::from_utf8_lossy(&acc).into_owned());
                acc.clear();
            } else if acc.len() >= MAX_LINE_BYTES {
                acc.truncate(MAX_LINE_BYTES);
                let mut s = String::from_utf8_lossy(&acc).into_owned();
                s.push_str(TRUNC_MARKER);
                let _ = tx.send(s);
                acc.clear();
                skipping = true;
            }
        }
    }
    if !acc.is_empty() && !skipping {
        let _ = tx.send(String::from_utf8_lossy(&acc).into_owned());
    }
}
