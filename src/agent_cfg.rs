// ACFG-001..006 (spec 013): coding-agent config read/write + one-click
// "route via 9Router" patching. Security posture: config paths are derived
// SERVER-SIDE from a static map (never from the client), writes are size-
// capped and always backed up to `<file>.bak` first.
use std::path::Path;

pub const MAX_CONFIG_BYTES: usize = 256 * 1024;

/// ACFG-001: static agent → config path (relative to $HOME). Agents absent
/// here have no editable config → endpoints answer 404 CONFIG_UNSUPPORTED.
pub fn config_rel_path(agent_id: &str) -> Option<&'static str> {
    match agent_id {
        "codex" => Some(".codex/config.toml"),
        "claude-code" => Some(".claude/settings.json"),
        "opencode" => Some(".config/opencode/opencode.json"),
        _ => None,
    }
}

/// ACFG-002: read current config; Ok(None) when the file does not exist yet.
pub fn read_config(home: &Path, agent_id: &str) -> Result<Option<String>, String> {
    let rel = config_rel_path(agent_id).ok_or_else(|| String::from("CONFIG_UNSUPPORTED"))?;
    let p = home.join(rel);
    if !p.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&p)
        .map(Some)
        .map_err(|e| format!("READ_FAILED:{e}"))
}

/// ACFG-003: write config with automatic `.bak` backup of any previous content.
/// Returns whether a backup was written. Rejects oversized payloads.
pub fn write_config_with_backup(
    home: &Path,
    agent_id: &str,
    content: &str,
) -> Result<bool, String> {
    if content.len() > MAX_CONFIG_BYTES {
        return Err(String::from("TOO_LARGE"));
    }
    let rel = config_rel_path(agent_id).ok_or_else(|| String::from("CONFIG_UNSUPPORTED"))?;
    let p = home.join(rel);
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("MKDIR_FAILED:{e}"))?;
    }
    let mut backup_written = false;
    if p.exists() {
        std::fs::copy(&p, home.join(format!("{rel}.bak")))
            .map_err(|e| format!("BACKUP_FAILED:{e}"))?;
        backup_written = true;
    }
    std::fs::write(&p, content).map_err(|e| format!("WRITE_FAILED:{e}"))?;
    Ok(backup_written)
}

// ── ACFG-004: "route via 9Router" patches ───────────────────────────────────

const TOML_BLOCK_START: &str = "[model_providers.9router]";

/// Codex `~/.codex/config.toml`: idempotent upsert. Removes any previous
/// marked provider block and stale top-level `model_provider` assignment,
/// then prepends the assignment (top-level keys must precede sections in
/// TOML) and appends the canonical provider block. Applying twice yields the
/// exact same output as applying once.
pub fn upsert_router9_toml(content: &str, port: u16) -> String {
    let mut cleaned: Vec<&str> = Vec::new();
    let mut in_block = false;
    for line in content.lines() {
        let t = line.trim();
        if t == TOML_BLOCK_START {
            in_block = true;
            continue;
        }
        if in_block {
            // block ends at the next section header or EOF
            if t.starts_with('[') && t.ends_with(']') {
                in_block = false;
                cleaned.push(line);
            }
            continue;
        }
        // drop stale assignment lines pointing at the router
        if (t.starts_with("model_provider") && t.contains("\"9router\""))
            || (t.starts_with("base_url") && t.contains("127.0.0.1") && t.contains("20128"))
            || t == "wire_api = \"openai\""
                && cleaned
                    .iter()
                    .rev()
                    .take(2)
                    .any(|l| l.trim().starts_with("name = \"9Router\""))
        {
            continue;
        }
        cleaned.push(line);
    }
    let body = cleaned.join("\n");
    let trimmed = body.trim_start_matches('\n').trim_end();
    let assign = "model_provider = \"9router\"";
    // avoid duplicating the assignment if it already exists verbatim at top level
    let has_assign = trimmed.lines().any(|l| l.trim() == assign);
    let mut out = String::new();
    if !has_assign {
        out.push_str(assign);
        out.push('\n');
    }
    out.push_str(trimmed);
    out.push_str(&format!(
        "\n\n{TOML_BLOCK_START}\nname = \"9Router\"\nbase_url = \"http://127.0.0.1:{port}/v1\"\nwire_api = \"openai\"\n"
    ));
    out
}

/// Claude Code `~/.claude/settings.json`: set env.ANTHROPIC_BASE_URL while
/// keeping every other field intact. Missing/invalid JSON starts fresh `{}`.
pub fn patch_claude_settings(content: Option<&str>, port: u16) -> Result<String, String> {
    let mut v: serde_json::Value = match content {
        Some(c) if !c.trim().is_empty() => {
            serde_json::from_str(c).map_err(|e| format!("BAD_JSON:{e}"))?
        }
        _ => serde_json::json!({}),
    };
    v["env"]["ANTHROPIC_BASE_URL"] = serde_json::json!(format!("http://127.0.0.1:{port}"));
    serde_json::to_string_pretty(&v).map_err(|e| format!("SERIALIZE_FAILED:{e}"))
}

/// OpenCode `opencode.json`: define an OpenAI-compatible provider pointing at
/// the local router, preserving other fields.
pub fn patch_opencode_config(content: Option<&str>, port: u16) -> Result<String, String> {
    let mut v: serde_json::Value = match content {
        Some(c) if !c.trim().is_empty() => {
            serde_json::from_str(c).map_err(|e| format!("BAD_JSON:{e}"))?
        }
        _ => serde_json::json!({}),
    };
    v["provider"]["9router"] = serde_json::json!({
        "npm": "@ai-sdk/openai-compatible",
        "options": { "baseURL": format!("http://127.0.0.1:{port}/v1") }
    });
    serde_json::to_string_pretty(&v).map_err(|e| format!("SERIALIZE_FAILED:{e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn acfg_001_paths_are_static_and_unknown_is_none() {
        assert_eq!(config_rel_path("codex"), Some(".codex/config.toml"));
        assert_eq!(
            config_rel_path("claude-code"),
            Some(".claude/settings.json")
        );
        assert_eq!(
            config_rel_path("opencode"),
            Some(".config/opencode/opencode.json")
        );
        // no path ever comes from the client: unknown ids have none
        assert_eq!(config_rel_path("../../etc/passwd"), None);
        assert_eq!(config_rel_path("antigravity"), None);
    }

    #[test]
    fn acfg_006_write_backup_roundtrip_and_limit() {
        let dir = tempfile::tempdir().unwrap();
        let home = dir.path();
        // first write: no backup yet
        let b1 = write_config_with_backup(home, "claude-code", "{\"a\":1}").unwrap();
        assert!(!b1);
        // second write: backup created and holds previous content
        let b2 = write_config_with_backup(home, "claude-code", "{\"a\":2}").unwrap();
        assert!(b2);
        let bak = std::fs::read_to_string(home.join(".claude/settings.json.bak")).unwrap();
        assert_eq!(bak, "{\"a\":1}");
        // oversized payload rejected before touching disk
        let big = "x".repeat(MAX_CONFIG_BYTES + 1);
        assert_eq!(
            write_config_with_backup(home, "codex", &big).unwrap_err(),
            "TOO_LARGE"
        );
        // unsupported agent rejected
        assert_eq!(
            write_config_with_backup(home, "antigravity", "{}").unwrap_err(),
            "CONFIG_UNSUPPORTED"
        );
    }

    #[test]
    fn acfg_006_toml_upsert_idempotent() {
        let once = upsert_router9_toml("# my config\nmodel = \"gpt-5\"\n", 20128);
        let twice = upsert_router9_toml(&once, 20128);
        assert_eq!(once, twice, "upsert must be idempotent");
        assert!(once.starts_with("model_provider = \"9router\"\n"));
        assert!(once.contains("[model_providers.9router]"));
        assert!(once.contains("base_url = \"http://127.0.0.1:20128/v1\""));
        assert!(once.contains("# my config"), "user comments preserved");
        assert!(once.contains("model = \"gpt-5\""));
        // exactly one provider block even after two passes
        assert_eq!(twice.matches("[model_providers.9router]").count(), 1);
    }

    #[test]
    fn acfg_006_toml_upsert_replaces_old_block() {
        let old = "model_provider = \"9router\"\n\n[model_providers.9router]\nname = \"9Router\"\nbase_url = \"http://127.0.0.1:20128/v1\"\nwire_api = \"openai\"\n\n[other]\nkey = 1\n";
        let out = upsert_router9_toml(old, 20128);
        assert_eq!(out.matches("[model_providers.9router]").count(), 1);
        assert_eq!(out.matches("model_provider = \"9router\"").count(), 1);
        assert!(out.contains("[other]"), "other sections preserved");
        assert!(out.contains("key = 1"));
    }

    #[test]
    fn acfg_004_claude_patch_keeps_fields() {
        let cur = r#"{"theme":"dark","env":{"FOO":"bar"}}"#;
        let patched = patch_claude_settings(Some(cur), 20128).unwrap();
        let v: serde_json::Value = serde_json::from_str(&patched).unwrap();
        assert_eq!(v["theme"], "dark");
        assert_eq!(v["env"]["FOO"], "bar");
        assert_eq!(v["env"]["ANTHROPIC_BASE_URL"], "http://127.0.0.1:20128");
    }

    #[test]
    fn acfg_004_claude_patch_empty_start() {
        let v: serde_json::Value =
            serde_json::from_str(&patch_claude_settings(None, 20128).unwrap()).unwrap();
        assert_eq!(v["env"]["ANTHROPIC_BASE_URL"], "http://127.0.0.1:20128");
    }

    #[test]
    fn acfg_004_opencode_patch_keeps_fields() {
        let cur = r#"{"theme":"zen"}"#;
        let patched = patch_opencode_config(Some(cur), 20128).unwrap();
        let v: serde_json::Value = serde_json::from_str(&patched).unwrap();
        assert_eq!(v["theme"], "zen");
        assert_eq!(
            v["provider"]["9router"]["options"]["baseURL"],
            "http://127.0.0.1:20128/v1"
        );
    }

    #[test]
    fn acfg_004_bad_json_is_error_not_silent_overwrite() {
        assert!(patch_claude_settings(Some("{not json"), 20128).is_err());
        assert!(patch_opencode_config(Some("[[[["), 20128).is_err());
    }
}
