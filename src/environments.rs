use std::path::{Path, PathBuf};

/// Environment descriptor returned by GET /api/v1/environments
#[derive(Debug, Clone, serde::Serialize)]
pub struct EnvInfo {
    pub id: String,
    pub name: String,
    pub available: bool,
}

/// Resolve proot-distro from filesystem: ~/.proot-distro/installed-distros/*
///
/// Each file name is a distro id (e.g. "ubuntu"). Fallback to CLI if dir missing.
pub fn list_distros(home: Option<&Path>) -> Vec<String> {
    let base = home
        .map(|h| h.join(".proot-distro/installed-distros"))
        .or_else(|| {
            std::env::var("HOME")
                .ok()
                .map(|h| PathBuf::from(h).join(".proot-distro/installed-distros"))
        });
    if let Some(dir) = base {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            let mut distros: Vec<String> = entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            if !distros.is_empty() {
                distros.sort();
                return distros;
            }
            // empty dir -> only termux
            return Vec::new();
        }
    }
    // fallback CLI
    if let Ok(out) = std::process::Command::new("proot-distro")
        .arg("list")
        .arg("--terse")
        .output()
    {
        if out.status.success() {
            let txt = String::from_utf8_lossy(&out.stdout);
            let mut v: Vec<String> = txt
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| !l.is_empty())
                .collect();
            v.sort();
            return v;
        }
    }
    Vec::new()
}

pub fn list_environments() -> Vec<EnvInfo> {
    let mut out = vec![EnvInfo {
        id: "termux".to_string(),
        name: "Termux".to_string(),
        available: true,
    }];
    for d in list_distros(None) {
        out.push(EnvInfo {
            id: d.clone(),
            name: capitalize(&d),
            available: true,
        });
    }
    out
}

fn capitalize(s: &str) -> String {
    let mut c = s.chars();
    match c.next() {
        None => String::new(),
        Some(f) => f.to_uppercase().collect::<String>() + c.as_str(),
    }
}

/// Build argv for PTY fork. Validates env_id against allowlist (filesystem list).
/// Returns Vec<String> to be turned into CStrings before fork.
pub fn build_argv(shell: &str, env_id: Option<&str>) -> Result<Vec<String>, String> {
    match env_id {
        None => Ok(vec![shell.to_string()]),
        Some(id) => {
            // validate against known list to prevent injection
            let known = list_environments();
            if !known.iter().any(|e| e.id == id) {
                return Err(format!("unknown environment: {id}"));
            }
            if id == "termux" {
                return Ok(vec![shell.to_string()]);
            }
            Ok(vec![
                "proot-distro".to_string(),
                "login".to_string(),
                id.to_string(),
                "--".to_string(),
                shell.to_string(),
            ])
        }
    }
}

pub fn shared_prefixes(home: &Path) -> Vec<PathBuf> {
    vec![
        home.to_path_buf(),
        PathBuf::from("/sdcard"),
        PathBuf::from("/storage/emulated/0"),
    ]
}

pub fn translate_cwd_for_env(
    host_cwd: Option<&Path>,
    env_id: Option<&str>,
    home: &Path,
) -> Option<PathBuf> {
    match (host_cwd, env_id) {
        (Some(p), Some(env)) if env != "termux" => {
            let prefixes = shared_prefixes(home);
            if prefixes.iter().any(|pr| p.starts_with(pr)) {
                Some(p.to_path_buf())
            } else {
                None // fallback to distro HOME
            }
        }
        (Some(p), _) => Some(p.to_path_buf()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn test_list_distros_fixture_two() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join(".proot-distro/installed-distros");
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("ubuntu"), "").unwrap();
        fs::write(base.join("debian"), "").unwrap();
        let list = list_distros(Some(dir.path()));
        assert_eq!(list, vec!["debian", "ubuntu"]);
    }

    #[test]
    fn test_list_distros_empty_dir() {
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join(".proot-distro/installed-distros");
        fs::create_dir_all(&base).unwrap();
        let list = list_distros(Some(dir.path()));
        assert!(list.is_empty());
    }

    #[test]
    fn test_build_argv_wrapper() {
        // without env -> simple shell
        assert_eq!(build_argv("/bin/bash", None).unwrap(), vec!["/bin/bash"]);
        // need a fake home with ubuntu installed for env validation
        let dir = tempfile::tempdir().unwrap();
        let base = dir.path().join(".proot-distro/installed-distros");
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("ubuntu"), "").unwrap();
        // Temporarily set HOME to fixture
        let old = std::env::var("HOME").ok();
        unsafe { std::env::set_var("HOME", dir.path()) };
        let argv = build_argv("/bin/bash", Some("ubuntu")).unwrap();
        assert_eq!(
            argv,
            vec!["proot-distro", "login", "ubuntu", "--", "/bin/bash"]
        );
        if let Some(v) = old {
            unsafe { std::env::set_var("HOME", v) };
        } else {
            unsafe { std::env::remove_var("HOME") };
        }
    }
}
