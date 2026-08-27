// NB-006..009 (spec 014): notebook execution backend. Security posture is a
// byte-level mirror of run_tools.rs: argv-only (no `sh -c` with interpolated
// strings), interpreter from a STATIC allowlist ("jupyter"), paths resolved by
// the caller via AllowedRoots, timeout = min(MUX_WEB_RUN_TIMEOUT_SECS, 600).
// Uses run_tools' shared RunTaskRegistry (single global slot; independent from
// agent installs per spec D9 note — kinds "jupyter"/"python-cell").
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::sync::{Mutex as StdMutex, OnceLock};
use std::time::{Duration, Instant};

fn env_known(env_id: &str) -> bool {
    env_id == "termux"
        || crate::environments::list_environments()
            .iter()
            .any(|e| e.id == env_id)
}

/// NB-007: hidden sibling `<basename>.muxexec.ipynb` — nbconvert writes the
/// executed result next to the source so proot sees it without extra mounts.
pub fn exec_output_tmp_name(abs_path: &str) -> Option<PathBuf> {
    let p = Path::new(abs_path);
    let name = p.file_name()?.to_str()?;
    Some(p.with_file_name(format!(".{name}.muxexec.ipynb")))
}

/// NB-007/NB-008: pure argv builder; interpreter "jupyter" is a STATIC token.
pub fn jupyter_run_argv(env_id: &str, abs_path: &str) -> Result<Vec<String>, String> {
    if !env_known(env_id) {
        return Err(String::from("UNKNOWN_ENV"));
    }
    let out = exec_output_tmp_name(abs_path).ok_or_else(|| String::from("BAD_PATH"))?;
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
    v.extend([
        "jupyter".to_string(),
        "nbconvert".to_string(),
        "--to".to_string(),
        "notebook".to_string(),
        "--execute".to_string(),
        "--output".to_string(),
        out.file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_default(),
        abs_path.to_string(),
    ]);
    Ok(v)
}

type ProbeCache = HashMap<(String, String), (bool, Instant)>;

fn probe_cache() -> &'static StdMutex<ProbeCache> {
    static CELL: OnceLock<StdMutex<ProbeCache>> = OnceLock::new();
    CELL.get_or_init(|| StdMutex::new(HashMap::new()))
}

pub const PROBE_TTL: Duration = Duration::from_secs(30);

/// Presence probe core, 30s TTL keyed by `tag`:env_id (run_tools.rs:61 style;
/// module-private cache so injected fakes never touch run_tools entries).
pub fn jupyter_probe_cached(tag: &str, env_id: &str, runner: impl FnOnce(&str) -> bool) -> bool {
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
        which("jupyter")
    } else {
        // distro probe inside the proot root; the shell string is a FIXED
        // literal with zero interpolation (run_tools.rs real_probe precedent,
        // SV-01-safe: same shape as agents.rs `command -v` probing).
        std::process::Command::new("proot-distro")
            .args(["login", env_id, "--", "sh", "-lc", "command -v jupyter"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
}

/// Err carries the user-facing JUPYTER_MISSING hint (install via Support Hub).
pub fn jupyter_present(env_id: &str) -> Result<(), String> {
    let ok = jupyter_probe_cached("real-jupyter", env_id, real_probe);
    if ok {
        Ok(())
    } else {
        Err(format!(
            "JUPYTER_MISSING: jupyter tidak ditemukan di environment '{env_id}'. \
             Install dulu via Support Hub (`pip install jupyter` di Termux atau \
             di dalam distro), lalu coba lagi."
        ))
    }
}

/// Notebook ops cap at 600s even when config allows more (NB-007); 0 = None.
pub fn effective_run_timeout(config_secs: u64) -> Option<Duration> {
    match config_secs {
        0 => None,
        s => Some(Duration::from_secs(s.min(600))),
    }
}

/// Pure concatenation for the L2 temp cell script (FE cellScript.ts mirrors
/// this exact layout: prefix + marker + active cell source).
pub fn cell_script_body(prefix_src: &str, cell_src: &str) -> String {
    format!(
        "{}\n# %% MUXCELL\n{}",
        prefix_src.trim_end_matches('\n'),
        cell_src.trim_end_matches('\n')
    )
}

// ── Server-side path side-table ─────────────────────────────────────────────
//
// Executed-result locations and cell tmp scripts must NEVER travel through
// client-supplied paths (SEC): handlers remember them here at spawn time and
// consumers fetch by task_id only. Bounded LRU cap of 32; retrieval purges.
pub const PATH_TABLE_CAP: usize = 32;

struct PathSideTable {
    map: HashMap<String, String>,
    order: VecDeque<String>,
}

impl PathSideTable {
    fn new() -> Self {
        Self {
            map: HashMap::new(),
            order: VecDeque::new(),
        }
    }
}

fn side_table() -> &'static StdMutex<PathSideTable> {
    static CELL: OnceLock<StdMutex<PathSideTable>> = OnceLock::new();
    CELL.get_or_init(|| StdMutex::new(PathSideTable::new()))
}

fn remember_side(task_id: &str, path: &str) {
    let mut t = side_table().lock().unwrap();
    while t.order.len() >= PATH_TABLE_CAP {
        if let Some(old) = t.order.pop_front() {
            t.map.remove(&old);
        }
    }
    t.map.insert(task_id.to_string(), path.to_string());
    t.order.push_back(task_id.to_string());
}

fn take_side(task_id: &str) -> Option<String> {
    let mut t = side_table().lock().unwrap();
    t.order.retain(|id| id != task_id);
    t.map.remove(task_id)
}

pub fn remember_exec_output(task_id: &str, path: &str) {
    remember_side(task_id, path);
}

pub fn take_exec_output(task_id: &str) -> Option<String> {
    take_side(task_id)
}

pub fn remember_cell_tmp(task_id: &str, path: &str) {
    remember_side(task_id, path);
}

pub fn take_cell_tmp(task_id: &str) -> Option<String> {
    take_side(task_id)
}

/// Random-6 hex tag for tmp cell script names (time + atomic counter).
pub fn rand_tag6() -> String {
    use std::sync::atomic::{AtomicU64, Ordering};
    static SEQ: AtomicU64 = AtomicU64::new(0);
    let n = SEQ.fetch_add(1, Ordering::Relaxed);
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos() as u64)
        .unwrap_or(0);
    format!("{:06x}", (nanos ^ n.rotate_left(24)) & 0xff_ffff)
}
