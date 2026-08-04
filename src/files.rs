use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::time::SystemTime;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_symlink: bool,
    pub size: u64,
    pub modified_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DirectoryListing {
    pub root_id: String,
    pub path: String,
    pub entries: Vec<FileEntry>,
    pub total: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "kebab-case")]
pub enum FsAction {
    CreateDir { root_id: String, path: String },
    CreateFile { root_id: String, path: String },
    Rename { root_id: String, path: String, new_name: String },
    Copy { src_root_id: String, src_path: String, dest_root_id: String, dest_path: String },
    Move { src_root_id: String, src_path: String, dest_root_id: String, dest_path: String },
    Trash { root_id: String, path: String },
    DeletePermanent { root_id: String, path: String, confirm: bool },
}

pub fn list_directory(dir_path: &Path, root_id: &str, relative_path: &str) -> Result<DirectoryListing, String> {
    let read_dir = fs::read_dir(dir_path).map_err(|e| format!("Failed to read directory: {}", e))?;

    let mut entries = Vec::new();

    for entry in read_dir {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue,
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(_) => continue,
        };

        let file_name = entry.file_name().to_string_lossy().to_string();
        let is_symlink = metadata.file_type().is_symlink();
        let is_dir = metadata.is_dir();
        let size = metadata.len();

        let modified_ms = metadata
            .modified()
            .unwrap_or(SystemTime::UNIX_EPOCH)
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);

        let entry_rel_path = if relative_path.is_empty() {
            file_name.clone()
        } else {
            format!("{}/{}", relative_path.trim_end_matches('/'), file_name)
        };

        entries.push(FileEntry {
            name: file_name,
            path: entry_rel_path,
            is_dir,
            is_symlink,
            size,
            modified_ms,
        });
    }

    // Sort entries: directories first, then alphabetical case-insensitive
    entries.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.to_lowercase().cmp(&b.name.to_lowercase())
        }
    });

    let total = entries.len();

    Ok(DirectoryListing {
        root_id: root_id.to_string(),
        path: relative_path.to_string(),
        entries,
        total,
    })
}
