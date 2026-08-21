use std::fs::File;
use std::io::{Read, Write};
use std::path::{Component, Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ArchiveError {
    Io(String),
    InvalidFormat(String),
    PathTraversal(String),
    ZipBomb { reason: String },
    NotFound(String),
}

impl std::fmt::Display for ArchiveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ArchiveError::Io(e) => write!(f, "I/O error: {e}"),
            ArchiveError::InvalidFormat(e) => write!(f, "Invalid archive: {e}"),
            ArchiveError::PathTraversal(e) => write!(f, "Path traversal blocked: {e}"),
            ArchiveError::ZipBomb { reason } => write!(f, "Zip bomb detected: {reason}"),
            ArchiveError::NotFound(e) => write!(f, "Not found: {e}"),
        }
    }
}
impl std::error::Error for ArchiveError {}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArchiveEntry {
    pub path: String,
    pub is_dir: bool,
    pub size: u64,
    pub compressed_size: Option<u64>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct ArchiveInspect {
    pub entries: Vec<ArchiveEntry>,
    pub total_uncompressed: u64,
    pub total_files: usize,
}

pub const DEFAULT_MAX_EXTRACT_BYTES: u64 = 500 * 1024 * 1024;
pub const DEFAULT_MAX_EXTRACT_FILES: usize = 10_000;
pub const DEFAULT_MAX_EXPANSION_RATIO: u64 = 100;

#[derive(Debug, Clone)]
pub struct ExtractBudgets {
    pub max_bytes: u64,
    pub max_files: usize,
    pub max_ratio: u64,
}

impl Default for ExtractBudgets {
    fn default() -> Self {
        Self {
            max_bytes: DEFAULT_MAX_EXTRACT_BYTES,
            max_files: DEFAULT_MAX_EXTRACT_FILES,
            max_ratio: DEFAULT_MAX_EXPANSION_RATIO,
        }
    }
}

fn sanitize_entry_path(raw: &str) -> Result<PathBuf, ArchiveError> {
    let p = Path::new(raw);
    // Reject absolute
    if p.is_absolute() {
        return Err(ArchiveError::PathTraversal(format!("absolute path: {raw}")));
    }
    let mut clean = PathBuf::new();
    for comp in p.components() {
        match comp {
            Component::Normal(c) => clean.push(c),
            Component::CurDir => {}
            Component::ParentDir => {
                return Err(ArchiveError::PathTraversal(format!("parent dir in: {raw}")));
            }
            Component::RootDir | Component::Prefix(_) => {
                return Err(ArchiveError::PathTraversal(format!(
                    "invalid component in: {raw}"
                )));
            }
        }
    }
    // Windows backslash defense: treat backslash as separator
    if raw.contains('\\') {
        for seg in raw.split('\\') {
            if seg == ".." {
                return Err(ArchiveError::PathTraversal(format!(
                    "backslash traversal: {raw}"
                )));
            }
        }
        // If raw contained backslash and we already pushed, check again for .. after split
        let joined = clean.to_string_lossy();
        if joined.contains("..") {
            return Err(ArchiveError::PathTraversal(format!(
                "backslash traversal: {raw}"
            )));
        }
    }
    if clean.as_os_str().is_empty() {
        // Allow "." (tar root) as empty -> represents dest_dir itself
        if raw == "." || raw == "./" || raw.is_empty() || raw == "././" {
            return Ok(clean);
        }
        return Err(ArchiveError::PathTraversal(format!(
            "empty after sanitization: {raw}"
        )));
    }
    Ok(clean)
}

fn is_symlink_target_safe(target: &Path, dest: &Path) -> bool {
    // Symlink target must not escape dest. If absolute, reject. If contains .., reject.
    if target.is_absolute() {
        return false;
    }
    for comp in target.components() {
        if matches!(comp, Component::ParentDir) {
            return false;
        }
    }
    // Resolve dest + target and check prefix (defense in depth)
    let resolved = dest.join(target);
    // Normalize without checking existence: use components check
    let mut normalized = PathBuf::new();
    for comp in resolved.components() {
        match comp {
            Component::ParentDir => {
                normalized.pop();
            }
            Component::CurDir => {}
            Component::Normal(c) => normalized.push(c),
            Component::RootDir => normalized.push(comp),
            Component::Prefix(p) => normalized.push(p.as_os_str()),
        }
    }
    normalized.starts_with(dest)
}

pub struct ArchiveService;

impl ArchiveService {
    pub fn inspect(archive_path: &Path) -> Result<ArchiveInspect, ArchiveError> {
        if !archive_path.exists() {
            return Err(ArchiveError::NotFound(format!(
                "archive not found: {}",
                archive_path.display()
            )));
        }
        let ext = archive_path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let file_name = archive_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        // Try zip first
        if file_name.ends_with(".zip") || ext == "zip" {
            return Self::inspect_zip(archive_path);
        }
        // Tar variants
        if file_name.ends_with(".tar.gz")
            || file_name.ends_with(".tgz")
            || file_name.ends_with(".tar.bz2")
            || file_name.ends_with(".tar.xz")
            || ext == "tar"
            || file_name.ends_with(".tar")
        {
            return Self::inspect_tar(archive_path);
        }
        // Fallback: try zip, then tar
        if let Ok(r) = Self::inspect_zip(archive_path) {
            return Ok(r);
        }
        Self::inspect_tar(archive_path)
    }

    fn inspect_zip(path: &Path) -> Result<ArchiveInspect, ArchiveError> {
        let file = File::open(path).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| ArchiveError::InvalidFormat(e.to_string()))?;
        let mut entries = Vec::new();
        let mut total = 0u64;
        for i in 0..archive.len() {
            let entry = archive
                .by_index(i)
                .map_err(|e| ArchiveError::Io(e.to_string()))?;
            let name = entry.name().to_string();
            // Skip directory entries that are empty or just for structure? Keep them
            let is_dir = entry.is_dir();
            let size = entry.size();
            total = total.saturating_add(size);
            entries.push(ArchiveEntry {
                path: name,
                is_dir,
                size,
                compressed_size: Some(entry.compressed_size()),
            });
        }
        let total_files = entries.iter().filter(|e| !e.is_dir).count();
        Ok(ArchiveInspect {
            entries,
            total_uncompressed: total,
            total_files,
        })
    }

    fn inspect_tar(path: &Path) -> Result<ArchiveInspect, ArchiveError> {
        let file = File::open(path).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let file_name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();

        // Detect gzip/bz2/xz by extension
        let reader: Box<dyn Read> = if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz")
        {
            Box::new(flate2::read::GzDecoder::new(file))
        } else {
            Box::new(file)
        };

        let mut archive = tar::Archive::new(reader);
        let mut entries = Vec::new();
        let mut total = 0u64;
        let mut total_files = 0usize;
        let raw_entries = archive
            .entries()
            .map_err(|e| ArchiveError::InvalidFormat(e.to_string()))?;
        for entry in raw_entries {
            let entry = entry.map_err(|e| ArchiveError::Io(e.to_string()))?;
            let path = entry
                .path()
                .map_err(|e| ArchiveError::Io(e.to_string()))?
                .to_string_lossy()
                .to_string();
            let is_dir = entry.header().entry_type().is_dir();
            let size = entry.header().size().unwrap_or(0);
            total = total.saturating_add(size);
            if !is_dir {
                total_files += 1;
            }
            entries.push(ArchiveEntry {
                path,
                is_dir,
                size,
                compressed_size: None,
            });
        }
        Ok(ArchiveInspect {
            entries,
            total_uncompressed: total,
            total_files,
        })
    }

    pub fn extract(
        archive_path: &Path,
        dest_dir: &Path,
        budgets: &ExtractBudgets,
    ) -> Result<(), ArchiveError> {
        if !archive_path.exists() {
            return Err(ArchiveError::NotFound(format!(
                "archive not found: {}",
                archive_path.display()
            )));
        }
        if !dest_dir.exists() {
            std::fs::create_dir_all(dest_dir).map_err(|e| ArchiveError::Io(e.to_string()))?;
        }
        let canonical_dest = dest_dir
            .canonicalize()
            .map_err(|e| ArchiveError::Io(e.to_string()))?;
        let file_name = archive_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if file_name.ends_with(".zip") {
            Self::extract_zip(archive_path, &canonical_dest, budgets)
        } else {
            Self::extract_tar(archive_path, &canonical_dest, budgets)
        }
    }

    fn extract_zip(
        archive_path: &Path,
        dest_dir: &Path,
        budgets: &ExtractBudgets,
    ) -> Result<(), ArchiveError> {
        let file = File::open(archive_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let compressed_len = file.metadata().map(|m| m.len()).unwrap_or(0);
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| ArchiveError::InvalidFormat(e.to_string()))?;

        let mut total_bytes: u64 = 0;
        let mut total_files: usize = 0;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| ArchiveError::Io(e.to_string()))?;
            let raw_name = entry.name().to_string();
            // Zip may contain directories with trailing slash
            let is_dir = entry.is_dir();
            let sanitized = sanitize_entry_path(&raw_name)?;
            let out_path = dest_dir.join(&sanitized);

            // Ensure out_path stays inside dest_dir (canonical check after parent creation)
            // Note: zip 0.6 does not expose is_symlink; symlink handling via unix_mode is omitted for simplicity
            // Symlink entries will be treated as regular files (or skipped if they escape)

            if is_dir {
                std::fs::create_dir_all(&out_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
                continue;
            }

            // File
            total_files += 1;
            if total_files > budgets.max_files {
                return Err(ArchiveError::ZipBomb {
                    reason: format!(
                        "file count {} exceeds limit {}",
                        total_files, budgets.max_files
                    ),
                });
            }

            if let Some(parent) = out_path.parent() {
                if !parent.starts_with(dest_dir) {
                    return Err(ArchiveError::PathTraversal(format!(
                        "file parent escape: {raw_name}"
                    )));
                }
                std::fs::create_dir_all(parent).map_err(|e| ArchiveError::Io(e.to_string()))?;
            }
            // Check canonical after creation of parent
            let parent_canon = out_path
                .parent()
                .unwrap()
                .canonicalize()
                .map_err(|e| ArchiveError::Io(e.to_string()))?;
            if !parent_canon.starts_with(dest_dir) {
                return Err(ArchiveError::PathTraversal(format!(
                    "canonical escape: {raw_name}"
                )));
            }

            let mut outfile =
                File::create(&out_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
            // Stream with budget
            let mut buffer = [0u8; 8192];
            loop {
                let n = entry
                    .read(&mut buffer)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
                if n == 0 {
                    break;
                }
                total_bytes = total_bytes.saturating_add(n as u64);
                if total_bytes > budgets.max_bytes {
                    // Cleanup partial file
                    drop(outfile);
                    let _ = std::fs::remove_file(&out_path);
                    return Err(ArchiveError::ZipBomb {
                        reason: format!(
                            "total bytes {} exceeds limit {}",
                            total_bytes, budgets.max_bytes
                        ),
                    });
                }
                if compressed_len > 0 {
                    let ratio = total_bytes / compressed_len.max(1);
                    if ratio > budgets.max_ratio {
                        drop(outfile);
                        let _ = std::fs::remove_file(&out_path);
                        return Err(ArchiveError::ZipBomb {
                            reason: format!(
                                "expansion ratio {} exceeds {}:1",
                                ratio, budgets.max_ratio
                            ),
                        });
                    }
                }
                outfile
                    .write_all(&buffer[..n])
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
            }
            // Set permissions if available (unix)
            #[cfg(unix)]
            {
                if let Some(mode) = entry.unix_mode() {
                    use std::os::unix::fs::PermissionsExt;
                    let _ = std::fs::set_permissions(
                        &out_path,
                        std::fs::Permissions::from_mode(mode & 0o777),
                    );
                }
            }
        }
        Ok(())
    }

    fn extract_tar(
        archive_path: &Path,
        dest_dir: &Path,
        budgets: &ExtractBudgets,
    ) -> Result<(), ArchiveError> {
        let file = File::open(archive_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let compressed_len = file.metadata().map(|m| m.len()).unwrap_or(0);
        let file_name = archive_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        let reader: Box<dyn Read> = if file_name.ends_with(".tar.gz") || file_name.ends_with(".tgz")
        {
            Box::new(flate2::read::GzDecoder::new(file))
        } else {
            Box::new(file)
        };
        let mut archive = tar::Archive::new(reader);
        // For tar, we need to be careful about pax extensions that may contain path traversal.
        // Ensure we validate each entry path.
        archive.set_preserve_permissions(false);
        archive.set_unpack_xattrs(false);

        let mut total_bytes: u64 = 0;
        let mut total_files: usize = 0;

        let entries = archive
            .entries()
            .map_err(|e| ArchiveError::InvalidFormat(e.to_string()))?;
        for entry in entries {
            let mut entry = entry.map_err(|e| ArchiveError::Io(e.to_string()))?;
            let raw_path = entry
                .path()
                .map_err(|e| ArchiveError::Io(e.to_string()))?
                .to_string_lossy()
                .to_string();
            let sanitized = match sanitize_entry_path(&raw_path) {
                Ok(p) => p,
                Err(e) => {
                    // For tar, skip invalid entries (like pax_global_header) but if it's path traversal, block
                    if raw_path.contains("pax_global_header") {
                        continue;
                    }
                    return Err(e);
                }
            };
            let out_path = dest_dir.join(&sanitized);
            let entry_type = entry.header().entry_type();

            if entry_type.is_dir() {
                std::fs::create_dir_all(&out_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
                continue;
            }
            if entry_type.is_symlink() || entry_type.is_hard_link() {
                // Check link target
                if let Ok(Some(link_name)) = entry.link_name() {
                    let target = link_name.as_ref();
                    if !is_symlink_target_safe(target, dest_dir) {
                        continue;
                    }
                    if let Some(parent) = out_path.parent() {
                        std::fs::create_dir_all(parent)
                            .map_err(|e| ArchiveError::Io(e.to_string()))?;
                    }
                    // Create symlink if safe; for hardlink, treat similarly
                    #[cfg(unix)]
                    {
                        let _ = std::fs::remove_file(&out_path);
                        if entry_type.is_symlink() {
                            std::os::unix::fs::symlink(target, &out_path)
                                .map_err(|e| ArchiveError::Io(e.to_string()))?;
                        } else {
                            // hardlink: only allow if target exists inside dest
                            let hard_target = dest_dir.join(target);
                            if hard_target.exists() {
                                std::fs::hard_link(&hard_target, &out_path)
                                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
                            }
                        }
                    }
                    continue;
                } else {
                    continue;
                }
            }
            if entry_type.is_file() {
                total_files += 1;
                if total_files > budgets.max_files {
                    return Err(ArchiveError::ZipBomb {
                        reason: format!(
                            "file count {} exceeds limit {}",
                            total_files, budgets.max_files
                        ),
                    });
                }
                if let Some(parent) = out_path.parent() {
                    if !parent.starts_with(dest_dir) {
                        return Err(ArchiveError::PathTraversal(format!(
                            "file parent escape: {raw_path}"
                        )));
                    }
                    std::fs::create_dir_all(parent).map_err(|e| ArchiveError::Io(e.to_string()))?;
                    let parent_canon = parent
                        .canonicalize()
                        .map_err(|e| ArchiveError::Io(e.to_string()))?;
                    if !parent_canon.starts_with(dest_dir) {
                        return Err(ArchiveError::PathTraversal(format!(
                            "canonical escape: {raw_path}"
                        )));
                    }
                }
                let mut outfile =
                    File::create(&out_path).map_err(|e| ArchiveError::Io(e.to_string()))?;
                // Stream copy with budget
                let mut buffer = [0u8; 8192];
                loop {
                    let n = entry
                        .read(&mut buffer)
                        .map_err(|e| ArchiveError::Io(e.to_string()))?;
                    if n == 0 {
                        break;
                    }
                    total_bytes = total_bytes.saturating_add(n as u64);
                    if total_bytes > budgets.max_bytes {
                        drop(outfile);
                        let _ = std::fs::remove_file(&out_path);
                        return Err(ArchiveError::ZipBomb {
                            reason: format!(
                                "total bytes {} exceeds limit {}",
                                total_bytes, budgets.max_bytes
                            ),
                        });
                    }
                    if compressed_len > 0 {
                        let ratio = total_bytes / compressed_len.max(1);
                        if ratio > budgets.max_ratio {
                            drop(outfile);
                            let _ = std::fs::remove_file(&out_path);
                            return Err(ArchiveError::ZipBomb {
                                reason: format!(
                                    "expansion ratio {} exceeds {}:1",
                                    ratio, budgets.max_ratio
                                ),
                            });
                        }
                    }
                    outfile
                        .write_all(&buffer[..n])
                        .map_err(|e| ArchiveError::Io(e.to_string()))?;
                }
            }
        }
        Ok(())
    }

    pub fn create_zip(sources: &[PathBuf], dest: &Path) -> Result<(), ArchiveError> {
        let file = File::create(dest).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let mut zip = zip::ZipWriter::new(file);
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated)
            .unix_permissions(0o644);
        for src in sources {
            if !src.exists() {
                return Err(ArchiveError::NotFound(format!(
                    "source not found: {}",
                    src.display()
                )));
            }
            if src.is_dir() {
                for entry in walkdir::WalkDir::new(src)
                    .into_iter()
                    .filter_map(|e| e.ok())
                {
                    let path = entry.path();
                    let rel = path
                        .strip_prefix(src.parent().unwrap_or(Path::new("")))
                        .unwrap();
                    let rel_str = rel.to_string_lossy().to_string();
                    if path.is_dir() {
                        zip.add_directory(rel_str, options)
                            .map_err(|e| ArchiveError::Io(e.to_string()))?;
                    } else {
                        zip.start_file(rel_str, options)
                            .map_err(|e| ArchiveError::Io(e.to_string()))?;
                        let mut f =
                            File::open(path).map_err(|e| ArchiveError::Io(e.to_string()))?;
                        let mut buffer = Vec::new();
                        f.read_to_end(&mut buffer)
                            .map_err(|e| ArchiveError::Io(e.to_string()))?;
                        zip.write_all(&buffer)
                            .map_err(|e| ArchiveError::Io(e.to_string()))?;
                    }
                }
            } else {
                let file_name = src.file_name().unwrap().to_string_lossy().to_string();
                zip.start_file(file_name, options)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
                let mut f = File::open(src).map_err(|e| ArchiveError::Io(e.to_string()))?;
                let mut buffer = Vec::new();
                f.read_to_end(&mut buffer)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
                zip.write_all(&buffer)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
            }
        }
        zip.finish().map_err(|e| ArchiveError::Io(e.to_string()))?;
        Ok(())
    }

    pub fn create_tar_gz(sources: &[PathBuf], dest: &Path) -> Result<(), ArchiveError> {
        let file = File::create(dest).map_err(|e| ArchiveError::Io(e.to_string()))?;
        let gz = flate2::write::GzEncoder::new(file, flate2::Compression::default());
        let mut tar = tar::Builder::new(gz);
        for src in sources {
            if !src.exists() {
                return Err(ArchiveError::NotFound(format!(
                    "source not found: {}",
                    src.display()
                )));
            }
            let name = src.file_name().unwrap();
            if src.is_dir() {
                tar.append_dir_all(name, src)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
            } else {
                tar.append_path_with_name(src, name)
                    .map_err(|e| ArchiveError::Io(e.to_string()))?;
            }
        }
        let gz = tar
            .into_inner()
            .map_err(|e| ArchiveError::Io(e.to_string()))?;
        gz.finish().map_err(|e| ArchiveError::Io(e.to_string()))?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_sanitize_rejects_traversal() {
        assert!(sanitize_entry_path("../../etc/passwd").is_err());
        assert!(sanitize_entry_path("/etc/passwd").is_err());
        assert!(sanitize_entry_path("a/../b").is_err());
        assert!(sanitize_entry_path("a\\..\\b").is_err());
        assert!(sanitize_entry_path("normal/file.txt").is_ok());
    }
}
