//! UPD (spec 015) — `mux-web update` implementation (opsi A).
//! Single-binary subcommand that delegates to `curl -fsSL $URL | bash` (update.sh).
//! Only allowlisted URLs may be fetched — prevents `evil.com` payload.

use std::process::Stdio;

pub const DEFAULT_UPDATE_URL: &str =
    "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh";

const ALLOWED_PREFIXES: &[&str] = &[
    "https://raw.githubusercontent.com/mcpe500/mux-web-ui/",
    "https://github.com/mcpe500/mux-web-ui/releases/download/",
    "https://api.github.com/repos/mcpe500/mux-web-ui/releases/",
];

/// Pure allowlist check — UPD-004.
/// Accepts only https URLs under the prefixes above plus `file://` for local smoke tests.
/// `file://` is allowed in all builds for testability; production users never need it
/// but it does not enlarge remote attack surface (local filesystem only).
pub fn is_update_url_allowed(url: &str) -> bool {
    if url.starts_with("file://") {
        return true;
    }
    ALLOWED_PREFIXES.iter().any(|p| url.starts_with(p))
}

pub fn effective_update_url(url_opt: Option<String>) -> String {
    if let Some(u) = url_opt {
        return u;
    }
    if let Ok(env) = std::env::var("MUX_WEB_UPDATE_URL") {
        if !env.trim().is_empty() {
            return env;
        }
    }
    DEFAULT_UPDATE_URL.to_string()
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn compare_versions(a: &str, b: &str) -> std::cmp::Ordering {
    let parse = |s: &str| {
        s.split('.')
            .map(|x| x.parse::<u64>().unwrap_or(0))
            .collect::<Vec<_>>()
    };
    parse(a).cmp(&parse(b))
}

async fn fetch_latest_tag() -> Result<String, String> {
    // Use curl to avoid adding reqwest dependency for this lightweight check.
    // Falls back to Cargo.toml raw if API fails.
    let api_url = "https://api.github.com/repos/mcpe500/mux-web-ui/releases/latest";
    let out = tokio::process::Command::new("curl")
        .args(["-fsSL", api_url])
        .output()
        .await
        .map_err(|e| format!("curl tidak ditemukan atau gagal: {e} (CURL_MISSING)"))?;
    if out.status.success() {
        let body = String::from_utf8_lossy(&out.stdout);
        if let Some(tag) = extract_tag(&body) {
            return Ok(tag);
        }
    }
    // Fallback: raw Cargo.toml
    let cargo_url = "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/Cargo.toml";
    let out2 = tokio::process::Command::new("curl")
        .args(["-fsSL", cargo_url])
        .output()
        .await
        .map_err(|e| format!("curl gagal fallback: {e}"))?;
    if out2.status.success() {
        let body = String::from_utf8_lossy(&out2.stdout);
        for line in body.lines() {
            let l = line.trim();
            if l.starts_with("version") {
                if let Some(v) = l.split('"').nth(1) {
                    return Ok(v.trim_start_matches('v').to_string());
                }
            }
        }
    }
    Err("gagal mengambil versi terbaru (curl API + Cargo.toml)".to_string())
}

fn extract_tag(body: &str) -> Option<String> {
    // crude JSON: "tag_name": "v0.6.4"
    let key = "\"tag_name\"";
    let idx = body.find(key)?;
    let after = &body[idx + key.len()..];
    let colon = after.find(':')?;
    let after_colon = &after[colon + 1..];
    let first_quote = after_colon.find('"')?;
    let rest = &after_colon[first_quote + 1..];
    let second_quote = rest.find('"')?;
    let tag = &rest[..second_quote];
    Some(tag.trim_start_matches('v').to_string())
}

/// Entrypoint called from main.rs before server bootstrap.
pub async fn handle_update(check: bool, url_opt: Option<String>) -> Result<(), String> {
    let url = effective_update_url(url_opt);
    if !is_update_url_allowed(&url) {
        return Err(format!(
            "INVALID_URL: URL tidak diizinkan: {url}\nHanya diperbolehkan:\n  {}\nGunakan --url dengan prefix resmi atau set MUX_WEB_UPDATE_URL yang allowlisted.",
            ALLOWED_PREFIXES.join("\n  ")
        ));
    }
    if check {
        let latest = fetch_latest_tag().await?;
        let current = current_version();
        match compare_versions(&latest, &current) {
            std::cmp::Ordering::Greater => {
                println!("Update tersedia: v{latest} (saat ini v{current}) — jalankan `mux-web update` untuk memperbarui.");
            }
            std::cmp::Ordering::Equal => {
                println!("Sudah versi terbaru v{current}.");
            }
            std::cmp::Ordering::Less => {
                println!("Versi lokal v{current} lebih baru dari rilis terbaru v{latest}.");
            }
        }
        return Ok(());
    }
    // Streaming update: curl -fsSL -- "$url" | bash
    // Use bash -c 'curl -fsSL -- "$1" | bash' bash "$url" to avoid shell quoting issues.
    println!("Menjalankan update dari: {url}");
    // Ensure curl exists early
    let curl_check = tokio::process::Command::new("curl")
        .arg("--version")
        .output()
        .await;
    if curl_check.is_err() || !curl_check.unwrap().status.success() {
        return Err(
            "CURL_MISSING: curl tidak ditemukan — install curl terlebih dahulu.".to_string(),
        );
    }
    let mut child = std::process::Command::new("bash");
    child
        .arg("-c")
        .arg("curl -fsSL -- \"$1\" | bash")
        .arg("bash")
        .arg(&url)
        .stdin(Stdio::null())
        .stdout(Stdio::inherit())
        .stderr(Stdio::inherit());
    // Preserve MUX_WEB_STRICT_VERIFY and other envs automatically via inherit
    let status = child
        .status()
        .map_err(|e| format!("gagal spawn bash/curl: {e}"))?;
    if status.success() {
        println!("\nUpdate selesai. Jika mux-web sedang berjalan, restart service untuk memakai binary baru.");
        Ok(())
    } else {
        let code = status.code().unwrap_or(1);
        Err(format!("update gagal dengan exit code {code}"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn upd_004_allowlist_table() {
        // Official raw install
        assert!(is_update_url_allowed(DEFAULT_UPDATE_URL));
        assert!(is_update_url_allowed(
            "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh"
        ));
        assert!(is_update_url_allowed(
            "https://raw.githubusercontent.com/mcpe500/mux-web-ui/v0.6.4/install.sh"
        ));
        assert!(is_update_url_allowed(
            "https://github.com/mcpe500/mux-web-ui/releases/download/v0.6.5/mux-web-0.6.5-aarch64"
        ));
        assert!(is_update_url_allowed(
            "https://api.github.com/repos/mcpe500/mux-web-ui/releases/latest"
        ));
        // file:// allowed for tests
        assert!(is_update_url_allowed("file:///tmp/fake-install.sh"));
        // evil rejected
        assert!(!is_update_url_allowed("https://evil.com/payload.sh"));
        assert!(!is_update_url_allowed(
            "https://raw.githubusercontent.com/evilguy/mux-web-ui/main/install.sh"
        ));
        assert!(!is_update_url_allowed(
            "http://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh"
        )); // http not https
        assert!(!is_update_url_allowed(
            "https://raw.githubusercontent.com/mcpe500/mux-web-ui.evil.com/payload"
        ));
        // injection attempts still have evil prefix → rejected
        assert!(!is_update_url_allowed("https://evil.com/mux-web-ui/../../raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh"));
    }

    #[test]
    fn upd_004_effective_url_default() {
        // when no opt and no env, returns default
        // Note: env may be set in CI, so we test with explicit opt
        assert_eq!(
            effective_update_url(Some("https://example.com/x".to_string())),
            "https://example.com/x"
        );
        assert_eq!(
            effective_update_url(Some(DEFAULT_UPDATE_URL.to_string())),
            DEFAULT_UPDATE_URL
        );
    }
}
