#![allow(dead_code)]
mod archive;
mod assets;
mod auth;
mod config;
mod files;
mod git;
mod http;
mod packages;
mod paths;
mod protocol;
mod pty;
mod session;
mod share;

use clap::Parser;
use config::Config;
use http::{create_router, AppState};
use paths::AllowedRoots;
use session::SessionRegistry;
use std::net::{IpAddr, SocketAddr};
use std::path::PathBuf;

fn private_ips() -> Vec<IpAddr> {
    let mut ips = Vec::new();
    if let Ok(addrs) = nix::ifaddrs::getifaddrs() {
        for ifaddr in addrs {
            if let Some(addr) = ifaddr.address {
                let ip = addr
                    .as_sockaddr_in()
                    .map(|s| IpAddr::V4(s.ip()))
                    .or_else(|| addr.as_sockaddr_in6().map(|s| IpAddr::V6(s.ip())));
                if let Some(ip) = ip {
                    let private = match ip {
                        IpAddr::V4(v4) => {
                            (v4.is_private() || config::is_cgnat_v4(v4))
                                && !v4.is_loopback()
                                && !v4.is_link_local()
                        }
                        IpAddr::V6(v6) => v6.is_unique_local() && !v6.is_loopback(),
                    };
                    if private {
                        ips.push(ip);
                    }
                }
            }
        }
    }
    ips
}

/// Generate a self-signed certificate in the data directory (mode 0700/0600).
fn generate_self_signed_cert(
    data_dir: &std::path::Path,
) -> Result<(PathBuf, PathBuf), Box<dyn std::error::Error>> {
    use rcgen::{CertificateParams, KeyPair};

    std::fs::create_dir_all(data_dir)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(data_dir, std::fs::Permissions::from_mode(0o700))?;
    }

    let cert_path = data_dir.join("cert.pem");
    let key_path = data_dir.join("key.pem");

    let mut params = CertificateParams::new(vec![
        IpAddr::V4(std::net::Ipv4Addr::LOCALHOST).to_string(),
        "localhost".to_string(),
    ])?;
    params.not_after = rcgen::date_time_ymd(2030, 1, 1);
    let key_pair = KeyPair::generate()?;
    let cert = params.self_signed(&key_pair)?;

    std::fs::write(&cert_path, cert.pem())?;
    std::fs::write(&key_path, key_pair.serialize_pem())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&cert_path, std::fs::Permissions::from_mode(0o600))?;
        std::fs::set_permissions(&key_path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok((cert_path, key_path))
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    let mut config = Config::parse();

    // NET-006 (spec 009): fail fast on invalid allowlist/advertise input so a
    // typo can never silently widen (or break) the Host gate.
    if let Err(e) = config.effective_allowed_hosts() {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }
    if let Err(e) = config.effective_advertise_addrs() {
        eprintln!("Error: {e}");
        std::process::exit(1);
    }

    // rustls needs an explicit default CryptoProvider (axum-server ships
    // rustls without a provider feature).
    let _ = rustls::crypto::ring::default_provider().install_default();

    if config.generate_cert {
        let (cert, key) = generate_self_signed_cert(&config.data_dir())?;
        println!("Generated self-signed certificate (valid until 2030):");
        println!("  cert: {}", cert.display());
        println!("  key:  {}", key.display());
        println!("WARNING: This certificate is NOT trusted by browsers by default;");
        println!("you must accept the browser warning when connecting.");
        config.tls_cert = Some(cert);
        config.tls_key = Some(key);
    }

    if config.tls_enabled() && (config.tls_cert.is_none() || config.tls_key.is_none()) {
        eprintln!("Error: --tls-cert and --tls-key must be provided together");
        std::process::exit(1);
    }

    let home_dir = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::current_dir().unwrap_or_else(|_| PathBuf::from(".")));

    let current_dir = std::env::current_dir().unwrap_or_else(|_| PathBuf::from("."));

    let allowed_roots = AllowedRoots::new(vec![
        ("home".to_string(), home_dir.clone()),
        ("cwd".to_string(), current_dir),
    ])?;

    let sessions = SessionRegistry::new_with(session::SessionConfig {
        grace_period: std::time::Duration::from_secs(config.session_idle_timeout),
        output_buffer: config.session_output_buffer,
        ws_token_ttl: std::time::Duration::from_secs(config.ws_token_ttl),
        max_sessions: config.effective_max_sessions(),
    });
    let auth = auth::AuthState::new(auth::AuthConfig::from_parts(
        config.pairing_rate_window,
        config.pairing_rate_global,
        config.pairing_rate_ip,
        config.tls_enabled(),
    ));

    let share = share::ShareRegistry::new(share::ShareConfig {
        default_ttl: std::time::Duration::from_secs(config.default_share_ttl),
        max_ttl: std::time::Duration::from_secs(config.default_share_ttl * 24),
    });

    let state = AppState {
        config: config.clone(),
        allowed_roots,
        sessions: sessions.clone(),
        auth: auth.clone(),
        share: share.clone(),
    };

    let app = create_router(state);

    let addr = SocketAddr::new(config.effective_bind(), config.port);

    let tls = config.tls_enabled();
    let scheme = if tls { "https" } else { "http" };

    let bootstrap = auth.bootstrap_secret().expect("fresh auth state");

    if config.effective_bind().is_loopback() || config.effective_bind().is_unspecified() {
        println!(
            "Mux Web UI listening on {}://127.0.0.1:{}",
            scheme, config.port
        );
        if !tls && config.lan {
            println!("WARNING: Binding to all interfaces WITHOUT TLS. Your terminal session");
            println!("and authentication cookie are visible to anyone on the network.");
            println!("Use --tls-cert/--tls-key or --generate-cert to enable HTTPS.");
        }
        println!();
        println!("=== AUTHENTICATION REQUIRED ===");
        println!("Pairing URL (single-use, replaces with a session cookie):");
        println!("  {}://127.0.0.1:{}/{}", scheme, config.port, bootstrap);
        println!("Or run: curl -X POST {}://127.0.0.1:{}/api/v1/auth/pair -d '{{\"secret\":\"<token>\"}}'", scheme, config.port);
        println!("================================");
    }

    if config.lan {
        let ips = private_ips();
        // NET-004 (spec 009): one ordered, deduped list — loopback, advertised
        // (VPN/custom domain), then every private/CGNAT interface IP.
        let advertise = config.effective_advertise_addrs().unwrap_or_default();
        for url in config::collect_access_urls(scheme, config.port, &advertise, &ips) {
            println!("  Access: {url}/{}", bootstrap);
        }
        if ips.is_empty() {
            println!("  LAN mode: no private interface addresses detected");
        }
        if !tls {
            println!();
            println!("WARNING: LAN mode WITHOUT TLS. Anyone on the network can read");
            println!("your terminal output and steal the session cookie. Strongly");
            println!("recommended: --generate-cert (then accept the browser warning).");
        }
    } else {
        // Non-LAN: still surface advertised VPN/custom URLs if the user set them.
        let advertise = config.effective_advertise_addrs().unwrap_or_default();
        if !advertise.is_empty() {
            for a in &advertise {
                println!("  VPN/Custom: {scheme}://{a}/{}", bootstrap);
            }
        }
    }

    let shutdown_sessions = sessions.clone();

    if tls {
        use axum_server::tls_rustls::RustlsConfig;
        let cert = config.tls_cert.as_ref().unwrap();
        let key = config.tls_key.as_ref().unwrap();
        let tls_config = RustlsConfig::from_pem_file(cert, key)
            .await
            .map_err(|e| format!("Failed to load TLS cert/key: {e}"))?;
        let server = axum_server::bind_rustls(addr, tls_config);
        let handle = axum_server::Handle::new();
        let server = server.handle(handle.clone());
        tokio::spawn(async move {
            tokio::signal::ctrl_c()
                .await
                .expect("Failed to listen for Ctrl+C signal");
            println!("\nGracefully shutting down Mux Web UI...");
            shutdown_sessions.stop_all();
            handle.graceful_shutdown(None);
        });
        server.serve(app.into_make_service()).await?;
    } else {
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

        axum::serve(
            listener,
            app.into_make_service_with_connect_info::<SocketAddr>(),
        )
        .with_graceful_shutdown(async move {
            tokio::signal::ctrl_c()
                .await
                .expect("Failed to listen for Ctrl+C signal");
            println!("\nGracefully shutting down Mux Web UI...");
            shutdown_sessions.stop_all();
        })
        .await?;
    }

    Ok(())
}
