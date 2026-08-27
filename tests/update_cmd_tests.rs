use clap::Parser;
use mux_web::config::{Commands, Config};
use mux_web::update::{is_update_url_allowed, DEFAULT_UPDATE_URL};

#[test]
fn upd_001_help_contains_update() {
    // cargo test runs with --help checks via Clap's debug
    let cfg = Config::try_parse_from(["mux-web", "update", "--help"]);
    // --help triggers clap error with DisplayHelp, not Ok
    assert!(cfg.is_err());
    let err = cfg.unwrap_err();
    let msg = err.to_string();
    // help text should mention update
    assert!(
        msg.contains("update") || msg.contains("Update"),
        "help missing update: {msg}"
    );
}

#[test]
fn upd_001_parse_update_no_args() {
    let cfg = Config::try_parse_from(["mux-web", "update"]).expect("parse update");
    match cfg.command {
        Some(Commands::Update { check, url }) => {
            assert!(!check);
            assert!(url.is_none());
        }
        _ => panic!("expected Update command"),
    }
}

#[test]
fn upd_002_parse_update_check_and_url() {
    let cfg = Config::try_parse_from([
        "mux-web",
        "update",
        "--check",
        "--url",
        "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh",
    ])
    .expect("parse");
    match cfg.command {
        Some(Commands::Update { check, url }) => {
            assert!(check);
            assert_eq!(
                url.unwrap(),
                "https://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh"
            );
        }
        _ => panic!("expected"),
    }
}

#[test]
fn upd_004_allowlist_guard() {
    assert!(is_update_url_allowed(DEFAULT_UPDATE_URL));
    assert!(is_update_url_allowed(
        "https://github.com/mcpe500/mux-web-ui/releases/download/v0.6.5/mux-web-0.6.5-aarch64"
    ));
    assert!(!is_update_url_allowed("https://evil.com/payload.sh"));
    assert!(!is_update_url_allowed(
        "http://raw.githubusercontent.com/mcpe500/mux-web-ui/main/install.sh"
    ));
}

#[test]
fn upd_001_no_subcommand_still_serves() {
    let cfg = Config::try_parse_from(["mux-web"]).expect("parse no subcommand");
    assert!(cfg.command.is_none());
    // default bind still present
    assert_eq!(cfg.port, 7681);
}

#[test]
fn upd_001_version_flag_still_works() {
    let cfg = Config::try_parse_from(["mux-web", "--version"]);
    assert!(cfg.is_err());
    let err = cfg.unwrap_err();
    // Clap version displays version string containing crate version
    let msg = err.to_string();
    assert!(
        msg.contains("0.6.5") || msg.contains("mux-web"),
        "version msg: {msg}"
    );
}
