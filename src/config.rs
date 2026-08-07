use clap::Parser;
use std::net::{IpAddr, Ipv4Addr};
use std::path::PathBuf;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about = "Mux Web UI - Lightweight web desktop & control center", long_about = None)]
pub struct Config {
    /// Address to bind server
    #[arg(short, long, default_value = "127.0.0.1")]
    pub bind: IpAddr,

    /// Port to listen on
    #[arg(short, long, default_value_t = 7681)]
    pub port: u16,

    /// Enable LAN access (binds to 0.0.0.0)
    #[arg(long, default_value_t = false)]
    pub lan: bool,

    /// TLS certificate file path (activates HTTPS/WSS)
    #[arg(long)]
    pub tls_cert: Option<PathBuf>,

    /// TLS key file path (activates HTTPS/WSS)
    #[arg(long)]
    pub tls_key: Option<PathBuf>,

    /// Generate a self-signed certificate in the data directory (90 days)
    #[arg(long, default_value_t = false)]
    pub generate_cert: bool,

    /// Data directory for certificates and state (default ~/.mux-web)
    #[arg(long)]
    pub data_dir: Option<PathBuf>,

    /// Pairing rate-limit window in seconds
    #[arg(long, default_value_t = 60)]
    pub pairing_rate_window: u64,

    /// Global pairing attempts allowed per window
    #[arg(long, default_value_t = 10)]
    pub pairing_rate_global: u32,

    /// Per-IP pairing attempts allowed per window
    #[arg(long, default_value_t = 30)]
    pub pairing_rate_ip: u32,

    /// Default working directory for PTY sessions
    #[arg(short, long)]
    pub work_dir: Option<PathBuf>,

    /// Default shell path
    #[arg(long)]
    pub shell: Option<String>,

    /// Grace period (seconds) before an unattached session is terminated
    #[arg(long, default_value_t = 60)]
    pub session_idle_timeout: u64,

    /// Ring buffer size (bytes) replayed on reattach
    #[arg(long, default_value_t = 256 * 1024)]
    pub session_output_buffer: usize,

    /// WS attach token TTL (seconds)
    #[arg(long, default_value_t = 10)]
    pub ws_token_ttl: u64,
}

impl Config {
    pub fn effective_bind(&self) -> IpAddr {
        if self.lan {
            IpAddr::V4(Ipv4Addr::UNSPECIFIED)
        } else {
            self.bind
        }
    }

    pub fn tls_enabled(&self) -> bool {
        self.tls_cert.is_some() && self.tls_key.is_some()
    }

    pub fn data_dir(&self) -> PathBuf {
        self.data_dir.clone().unwrap_or_else(|| {
            std::env::var("HOME")
                .map(|h| PathBuf::from(h).join(".mux-web"))
                .unwrap_or_else(|_| PathBuf::from(".mux-web"))
        })
    }
}
