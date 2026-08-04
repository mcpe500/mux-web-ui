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

    /// Enable LAN access (binds to 0.0.0.0 and generates single-use pairing code)
    #[arg(long, default_value_t = false)]
    pub lan: bool,

    /// TLS certificate file path
    #[arg(long)]
    pub tls_cert: Option<PathBuf>,

    /// TLS key file path
    #[arg(long)]
    pub tls_key: Option<PathBuf>,

    /// Default working directory for PTY sessions
    #[arg(short, long)]
    pub work_dir: Option<PathBuf>,

    /// Default shell path
    #[arg(long)]
    pub shell: Option<String>,
}

impl Config {
    pub fn effective_bind(&self) -> IpAddr {
        if self.lan {
            IpAddr::V4(Ipv4Addr::UNSPECIFIED)
        } else {
            self.bind
        }
    }
}
