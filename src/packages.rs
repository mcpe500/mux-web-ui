use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum PackageBackendKind {
    Pkg,
    Apt,
    Pacman,
    Apk,
    Unknown,
}

impl std::fmt::Display for PackageBackendKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Pkg => write!(f, "pkg"),
            Self::Apt => write!(f, "apt"),
            Self::Pacman => write!(f, "pacman"),
            Self::Apk => write!(f, "apk"),
            Self::Unknown => write!(f, "unknown"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageBackend {
    pub kind: PackageBackendKind,
    pub available: bool,
    pub root_required: bool,
}

pub struct PackageService;

impl PackageService {
    pub fn detect_backend() -> PackageBackend {
        // Simple detection: check for binaries in PATH or Termux specific
        if std::path::Path::new("/data/data/com.termux/files/usr/bin/pkg").exists() {
            return PackageBackend {
                kind: PackageBackendKind::Pkg,
                available: true,
                root_required: false,
            };
        }
        // Check common package managers via PATH lookup via `command -v` equivalent: try to run `which` via shell is not allowed.
        // Fallback: check existence in common bin paths
        let candidates = [
            (PackageBackendKind::Apt, "/usr/bin/apt"),
            (PackageBackendKind::Apt, "/bin/apt"),
            (PackageBackendKind::Pacman, "/usr/bin/pacman"),
            (PackageBackendKind::Apk, "/sbin/apk"),
        ];
        for (kind, path) in candidates {
            if std::path::Path::new(path).exists() {
                return PackageBackend {
                    kind,
                    available: true,
                    root_required: true,
                };
            }
        }
        // Also try PATH env brute force
        if let Ok(path_env) = std::env::var("PATH") {
            for dir in path_env.split(':') {
                for (kind, bin) in [
                    (PackageBackendKind::Apt, "apt"),
                    (PackageBackendKind::Pacman, "pacman"),
                    (PackageBackendKind::Apk, "apk"),
                ] {
                    if std::path::Path::new(&format!("{dir}/{bin}")).exists() {
                        return PackageBackend {
                            kind,
                            available: true,
                            root_required: true,
                        };
                    }
                }
            }
        }
        PackageBackend {
            kind: PackageBackendKind::Unknown,
            available: false,
            root_required: false,
        }
    }

    pub fn is_valid_package_name(name: &str) -> bool {
        // PKG-005 regex: ^[a-zA-Z0-9][a-zA-Z0-9+._-]*$
        if name.is_empty() || name.len() > 100 {
            return false;
        }
        let mut chars = name.chars();
        match chars.next() {
            Some(c) if c.is_ascii_alphanumeric() => {}
            _ => return false,
        }
        for c in chars {
            if !(c.is_ascii_alphanumeric() || c == '+' || c == '.' || c == '_' || c == '-') {
                return false;
            }
        }
        true
    }
}

// Stub for listing — not yet implemented, but needed for compilation
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PackageInfo {
    pub name: String,
    pub version: String,
    pub description: String,
}
