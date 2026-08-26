use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

#[derive(Debug, Clone, serde::Serialize)]
pub struct AgentDef {
    pub id: String,
    pub binary: String,
    pub label: String,
    pub color: String,
    /// DISTRO-003 (spec 011): static install hint shown in the UI. The server
    /// NEVER executes installs — this is documentation, not a command runner.
    pub install_hint: String,
}

pub fn registry() -> Vec<AgentDef> {
    vec![
        AgentDef {
            id: "opencode".to_string(),
            binary: "opencode".to_string(),
            label: "OpenCode".to_string(),
            color: "#6366f1".to_string(),
            install_hint: "npm i -g opencode-ai  (di dalam distro)".to_string(),
        },
        AgentDef {
            id: "claude-code".to_string(),
            binary: "claude".to_string(),
            label: "Claude Code".to_string(),
            color: "#f59e0b".to_string(),
            install_hint: "npm i -g @anthropic-ai/claude-code  (di dalam distro)".to_string(),
        },
        AgentDef {
            id: "codex".to_string(),
            binary: "codex".to_string(),
            label: "Codex".to_string(),
            color: "#10b981".to_string(),
            install_hint: "npm i -g @openai/codex  (di dalam distro)".to_string(),
        },
        AgentDef {
            id: "antigravity".to_string(),
            binary: "agy".to_string(),
            label: "Antigravity".to_string(),
            color: "#ec4899".to_string(),
            install_hint: "unduh CLI Antigravity dari situs resmi lalu taruh 'agy' di PATH distro"
                .to_string(),
        },
        AgentDef {
            // RTR-001 (spec 013): local AI gateway — https://9router.com/
            id: "9router".to_string(),
            binary: "9router".to_string(),
            label: "9Router".to_string(),
            color: "#38bdf8".to_string(),
            install_hint: "npm i -g 9router  (di dalam distro)".to_string(),
        },
    ]
}

type ProbeCache = HashMap<(String, String), (bool, Instant)>;
static CACHE: OnceLock<Mutex<ProbeCache>> = OnceLock::new();

fn cache() -> &'static Mutex<ProbeCache> {
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Probe if binary exists in context of env (host or proot distro). Cached 30s.
pub fn probe_agent(env_id: &str, agent_id: &str) -> bool {
    let def = match registry().into_iter().find(|a| a.id == agent_id) {
        Some(d) => d,
        None => return false,
    };
    let key = (env_id.to_string(), agent_id.to_string());
    {
        let map = cache().lock().unwrap();
        if let Some((found, ts)) = map.get(&key) {
            if ts.elapsed() < Duration::from_secs(30) {
                return *found;
            }
        }
    }
    let found = if env_id == "termux" {
        which(&def.binary).is_some()
    } else {
        // distro: probe via proot-distro login <env> -- sh -lc 'command -v <binary>'
        let out = std::process::Command::new("proot-distro")
            .args([
                "login",
                env_id,
                "--",
                "sh",
                "-lc",
                &format!("command -v {}", def.binary),
            ])
            .output();
        matches!(out, Ok(o) if o.status.success())
    };
    cache().lock().unwrap().insert(key, (found, Instant::now()));
    found
}

fn which(bin: &str) -> Option<std::path::PathBuf> {
    if let Ok(paths) = std::env::var("PATH") {
        for p in std::env::split_paths(&paths) {
            let cand = p.join(bin);
            if cand.is_file() {
                return Some(cand);
            }
        }
    }
    None
}

/// Build quick-launch argv for agent in env
pub fn build_agent_argv(
    shell: &str,
    env_id: Option<&str>,
    agent_id: &str,
    cwd: Option<&std::path::Path>,
) -> Result<Vec<String>, String> {
    let def = registry()
        .into_iter()
        .find(|a| a.id == agent_id)
        .ok_or_else(|| format!("unknown agent: {agent_id}"))?;
    let cwd_str = cwd.and_then(|p| p.to_str()).unwrap_or("");
    // Use wrapper if env is distro
    let base: Vec<String> = match env_id {
        Some(e) if e != "termux" => crate::environments::build_argv(shell, Some(e))?,
        _ => vec![shell.to_string()],
    };
    // Append sh -lc 'cd <cwd> && exec <binary>' — but base already contains shell as last element
    // For simplicity, replace last shell with sh and append -lc
    // Actually base is either [shell] or [proot-distro, login, distro, --, shell]
    // We want to exec agent via shell -c
    let mut argv = base;
    // Remove the trailing shell (we will use sh -c)
    let shell_bin = argv.pop().unwrap_or_else(|| shell.to_string());
    let cd_part = if cwd_str.is_empty() {
        "".to_string()
    } else {
        format!("cd {} && ", shell_escape(cwd_str))
    };
    let cmd = format!("{}exec {}", cd_part, def.binary);
    argv.push(shell_bin);
    argv.push("-c".to_string());
    argv.push(cmd);
    Ok(argv)
}

fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_registry_has_five() {
        // spec 013 RTR-001: 9Router added to the static registry
        let ids: Vec<String> = registry().iter().map(|a| a.id.clone()).collect();
        assert_eq!(registry().len(), 5);
        assert!(ids.contains(&"9router".to_string()));
    }

    #[test]
    fn test_build_argv_host() {
        let argv = build_agent_argv("/bin/bash", None, "opencode", None).unwrap();
        assert!(argv.join(" ").contains("opencode"));
        assert!(argv[0].contains("bash"));
    }

    #[test]
    fn test_probe_cache() {
        // second probe within TTL should not fork again (just checks cache hit)
        let a = probe_agent("termux", "opencode");
        let b = probe_agent("termux", "opencode");
        assert_eq!(a, b);
    }
}
