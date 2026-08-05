use std::collections::HashMap;
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathError {
    InvalidRootId(String),
    PathTraversalAttempt,
    InvalidUtf8,
    NulByteDetected,
    SymlinkOutsideRoot,
    NotFound,
    IoError(String),
}

impl std::fmt::Display for PathError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PathError::InvalidRootId(id) => write!(f, "Invalid root ID: {}", id),
            PathError::PathTraversalAttempt => write!(f, "Path traversal attempt detected"),
            PathError::InvalidUtf8 => write!(f, "Invalid UTF-8 path component"),
            PathError::NulByteDetected => write!(f, "NUL byte detected in path"),
            PathError::SymlinkOutsideRoot => write!(f, "Symlink points outside allowed root"),
            PathError::NotFound => write!(f, "File or directory not found"),
            PathError::IoError(e) => write!(f, "I/O error: {}", e),
        }
    }
}

impl std::error::Error for PathError {}

#[derive(Debug, Clone)]
pub struct AllowedRoots {
    roots: HashMap<String, PathBuf>,
}

impl AllowedRoots {
    pub fn new(initial_roots: Vec<(String, PathBuf)>) -> Result<Self, PathError> {
        let mut map = HashMap::new();
        for (id, path) in initial_roots {
            let canonical = path
                .canonicalize()
                .map_err(|e| PathError::IoError(e.to_string()))?;
            map.insert(id, canonical);
        }
        Ok(Self { roots: map })
    }

    pub fn get_root(&self, root_id: &str) -> Result<&PathBuf, PathError> {
        self.roots
            .get(root_id)
            .ok_or_else(|| PathError::InvalidRootId(root_id.to_string()))
    }

    pub fn list_roots(&self) -> Vec<(String, PathBuf)> {
        self.roots
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect()
    }

    /// Resolve a relative or absolute path against an opaque root ID safely
    pub fn resolve_path(&self, root_id: &str, raw_path: &str) -> Result<PathBuf, PathError> {
        let root = self.get_root(root_id)?;

        if raw_path.contains('\0') {
            return Err(PathError::NulByteDetected);
        }

        let mut path_str = raw_path.trim();

        let root_str = root.to_string_lossy();
        if path_str.starts_with('/') {
            if path_str.starts_with(root_str.as_ref()) {
                // Absolute path starting with root path (e.g. /data/data/com.termux/files/home/light)
                path_str = &path_str[root_str.len()..];
            } else if Path::new(path_str).is_absolute() && !root_str.starts_with(path_str) {
                // Absolute path pointing outside root (e.g. /etc/passwd)
                return Err(PathError::PathTraversalAttempt);
            }
        }

        // Strip leading slashes so subpaths like '/light' are treated as relative to root
        let clean_path = path_str.trim_start_matches('/');

        let path_obj = Path::new(clean_path);

        // Sanitize components: disallow ParentDir (..) or Prefix
        for comp in path_obj.components() {
            match comp {
                Component::ParentDir => return Err(PathError::PathTraversalAttempt),
                Component::Prefix(_) => return Err(PathError::PathTraversalAttempt),
                Component::Normal(_) | Component::CurDir | Component::RootDir => {}
            }
        }

        let full_path = if clean_path.is_empty() {
            root.clone()
        } else {
            root.join(path_obj)
        };

        // If the path exists, canonicalize and verify it stays inside root
        if full_path.exists() {
            let canonical_target = full_path
                .canonicalize()
                .map_err(|e| PathError::IoError(e.to_string()))?;
            if !canonical_target.starts_with(root) {
                return Err(PathError::SymlinkOutsideRoot);
            }
            Ok(canonical_target)
        } else {
            // For non-existent paths (e.g. creating new file/folder), ensure parent exists and stays inside root
            let parent = full_path.parent().ok_or(PathError::PathTraversalAttempt)?;
            if parent.exists() {
                let canonical_parent = parent
                    .canonicalize()
                    .map_err(|e| PathError::IoError(e.to_string()))?;
                if !canonical_parent.starts_with(root) {
                    return Err(PathError::SymlinkOutsideRoot);
                }
            } else {
                return Err(PathError::NotFound);
            }
            Ok(full_path)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn test_fs_001_allowed_roots_resolution() {
        let temp = tempdir().unwrap();
        let root_path = temp.path().canonicalize().unwrap();
        let allowed = AllowedRoots::new(vec![("home".to_string(), root_path.clone())]).unwrap();

        assert_eq!(allowed.get_root("home").unwrap(), &root_path);
        assert!(matches!(
            allowed.get_root("invalid_root"),
            Err(PathError::InvalidRootId(_))
        ));
    }

    #[test]
    fn test_fs_002_path_traversal_defense() {
        let temp = tempdir().unwrap();
        let root_path = temp.path().canonicalize().unwrap();
        let allowed = AllowedRoots::new(vec![("home".to_string(), root_path.clone())]).unwrap();

        // Traversal attempts
        assert_eq!(
            allowed.resolve_path("home", "../foo"),
            Err(PathError::PathTraversalAttempt)
        );
        assert_eq!(
            allowed.resolve_path("home", "a/../../b"),
            Err(PathError::PathTraversalAttempt)
        );
        assert_eq!(
            allowed.resolve_path("home", "/etc/passwd"),
            Err(PathError::PathTraversalAttempt)
        );
        assert_eq!(
            allowed.resolve_path("home", "foo\0bar"),
            Err(PathError::NulByteDetected)
        );
    }

    #[test]
    fn test_fs_003_symlink_containment() {
        let temp_root = tempdir().unwrap();
        let temp_outside = tempdir().unwrap();

        let root_path = temp_root.path().canonicalize().unwrap();
        let outside_path = temp_outside.path().canonicalize().unwrap();

        let outside_file = outside_path.join("outside.txt");
        std::fs::write(&outside_file, "secret").unwrap();

        // Create symlink inside root pointing outside
        let symlink_path = root_path.join("link_outside");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&outside_file, &symlink_path).unwrap();

        let allowed = AllowedRoots::new(vec![("home".to_string(), root_path)]).unwrap();

        #[cfg(unix)]
        assert_eq!(
            allowed.resolve_path("home", "link_outside"),
            Err(PathError::SymlinkOutsideRoot)
        );
    }

    #[test]
    fn test_fs_014_independent_root_validation() {
        let temp1 = tempdir().unwrap();
        let temp2 = tempdir().unwrap();

        let allowed = AllowedRoots::new(vec![
            ("root1".to_string(), temp1.path().to_path_buf()),
            ("root2".to_string(), temp2.path().to_path_buf()),
        ])
        .unwrap();

        assert!(allowed.resolve_path("root1", "file.txt").is_ok());
        assert!(allowed.resolve_path("root2", "file.txt").is_ok());
        assert!(allowed.resolve_path("root3", "file.txt").is_err());
    }
}
