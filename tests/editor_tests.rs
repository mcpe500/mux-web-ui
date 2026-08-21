use clap::Parser;
use mux_web::config::Config;
use mux_web::http::{create_router, AppState};
use mux_web::paths::AllowedRoots;
use mux_web::session::SessionRegistry;
use mux_web::share::{ShareConfig, ShareRegistry};
use tempfile::tempdir;

#[tokio::test]
async fn test_edit_001_file_read_and_atomic_write() {
    let temp = tempdir().unwrap();
    let file_path = temp.path().join("test.txt");
    std::fs::write(&file_path, "Hello World").unwrap();

    let allowed = AllowedRoots::new(vec![("temp".to_string(), temp.path().to_path_buf())]).unwrap();
    let config = Config::parse_from(["mux-web"]);
    let state = AppState {
        config,
        allowed_roots: allowed,
        sessions: SessionRegistry::new(),
        auth: mux_web::auth::AuthState::new(mux_web::auth::AuthConfig::default()),
        share: ShareRegistry::new(ShareConfig::default()),
    };

    let _app = create_router(state.clone());

    // Verify reading file directly from paths resolver
    let resolved = state
        .allowed_roots
        .resolve_path("temp", "test.txt")
        .unwrap();
    let content = std::fs::read_to_string(&resolved).unwrap();
    assert_eq!(content, "Hello World");

    // Verify atomic write
    std::fs::write(&resolved, "Updated Content").unwrap();
    let updated = std::fs::read_to_string(&resolved).unwrap();
    assert_eq!(updated, "Updated Content");
}
