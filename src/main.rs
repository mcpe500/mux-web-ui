mod assets;
mod config;
mod files;
mod http;
mod paths;
mod protocol;
mod pty;
mod session;

use clap::Parser;
use config::Config;
use http::{create_router, AppState};
use paths::AllowedRoots;
use session::SessionRegistry;
use std::net::SocketAddr;
use std::path::PathBuf;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let config = Config::parse();

    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let allowed_roots = AllowedRoots::new(vec![
        ("home".to_string(), home_dir.clone()),
        ("cwd".to_string(), current_dir),
    ])?;

    let sessions = SessionRegistry::new();

    let state = AppState {
        config: config.clone(),
        allowed_roots,
        sessions: sessions.clone(),
    };

    let app = create_router(state);

    let addr = SocketAddr::new(config.effective_bind(), config.port);

    let listener = match tokio::net::TcpListener::bind(addr).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!(
                "Error: Failed to bind to address {}:{}: {}. Please check if the port is already in use.",
                config.effective_bind(),
                config.port,
                e
            );
            std::process::exit(1);
        }
    };

    println!("Mux Web UI listening on http://{}", addr);

    let shutdown_sessions = sessions.clone();

    axum::serve(listener, app)
        .with_graceful_shutdown(async move {
            tokio::signal::ctrl_c()
                .await
                .expect("Failed to listen for Ctrl+C signal");
            println!("\nGracefully shutting down Mux Web UI...");
            shutdown_sessions.stop_all();
        })
        .await?;

    Ok(())
}
