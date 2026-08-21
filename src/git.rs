use std::path::Path;
use std::process::Command;

#[derive(Debug)]
pub enum GitError {
    NotRepo(String),
    CommandFailed(String),
    PathTraversal(String),
}

impl std::fmt::Display for GitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            GitError::NotRepo(e) => write!(f, "Not a git repo: {e}"),
            GitError::CommandFailed(e) => write!(f, "Git command failed: {e}"),
            GitError::PathTraversal(e) => write!(f, "Path traversal: {e}"),
        }
    }
}

pub struct GitService;

impl GitService {
    pub fn status(_repo_path: &Path) -> Result<serde_json::Value, GitError> {
        Err(GitError::CommandFailed("not implemented yet".to_string()))
    }
    pub fn is_safe_branch_name(name: &str) -> bool {
        // Basic check: no shell metachars, valid ref format
        if name.contains('\0')
            || name.contains('\n')
            || name.contains(';')
            || name.contains('$')
            || name.contains('`')
        {
            return false;
        }
        if name.is_empty() || name.starts_with('-') {
            return false;
        }
        true
    }
    pub fn run_git(args: &[&str], repo: &Path) -> Result<String, GitError> {
        let output = Command::new("git")
            .args(args)
            .current_dir(repo)
            .output()
            .map_err(|e| GitError::CommandFailed(e.to_string()))?;
        if !output.status.success() {
            return Err(GitError::CommandFailed(
                String::from_utf8_lossy(&output.stderr).to_string(),
            ));
        }
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }
}
