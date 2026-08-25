use clap::Parser;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::path::PathBuf;

#[derive(Parser, Debug, Clone)]
#[command(author, version, about = "Mux Web UI - Lightweight web desktop & control center", long_about = None,
    after_help = "NETWORK EXAMPLES (spec 009):\n  Tailscale mesh : mux-web --lan --advertise-addr yourname.tail-scale.ts.net:7681\n  WireGuard only : mux-web --bind 10.8.0.2\n  Internal DNS   : mux-web --allowed-hosts mux.lab.internal\n  Custom domain  : mux-web --allowed-hosts mux.example.com --advertise-addr mux.example.com:7681")]
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

    /// TAB-001 (spec 008): maximum concurrent PTY sessions (clamped 1..=16)
    #[arg(long, env = "MUX_WEB_MAX_SESSIONS", default_value_t = 4)]
    pub max_sessions: usize,

    /// Grace period (seconds) before an unattached session is terminated
    /// 0 = idle reap disabled (SESS-010)
    #[arg(long, default_value_t = 60)]
    pub session_idle_timeout: u64,

    /// Busy-grace window (seconds) that auto-extends detached deadline while output flows (SESS-009)
    #[arg(long, env = "MUX_WEB_SESSION_BUSY_GRACE", default_value_t = 30)]
    pub session_busy_grace: u64,

    /// Ring buffer size (bytes) replayed on reattach
    #[arg(long, default_value_t = 256 * 1024)]
    pub session_output_buffer: usize,

    /// WS attach token TTL (seconds)
    #[arg(long, default_value_t = 10)]
    pub ws_token_ttl: u64,

    /// Max archive extract total bytes (ARC-005)
    #[arg(long, env = "MUX_WEB_MAX_EXTRACT_SIZE", default_value_t = 500 * 1024 * 1024)]
    pub max_extract_size: u64,

    /// Max archive extract file count (ARC-005)
    #[arg(long, env = "MUX_WEB_MAX_EXTRACT_FILES", default_value_t = 10000)]
    pub max_extract_files: usize,

    /// Enable read-only share links (SHR)
    #[arg(long, env = "MUX_WEB_ENABLE_SHARE", default_value_t = true)]
    pub enable_share_links: bool,

    /// Default share link TTL seconds (SHR-002)
    #[arg(long, env = "MUX_WEB_DEFAULT_SHARE_TTL", default_value_t = 3600)]
    pub default_share_ttl: u64,

    /// NET-001 (spec 009): extra Host headers to accept (CSV, exact match,
    /// case-insensitive) — e.g. MagicDNS name or internal DNS entry
    #[arg(long, env = "MUX_WEB_ALLOWED_HOSTS")]
    pub allowed_hosts: Option<String>,

    /// NET-003 (spec 009): extra access URLs printed at startup (CSV
    /// `host[:port]`); each entry is implicitly allowlisted
    #[arg(long = "advertise-addr", env = "MUX_WEB_ADVERTISE_ADDRS")]
    pub advertise_addrs: Option<String>,

    /// NET-007 (spec 011): trusted reverse-proxy peers (CSV of IP or CIDR).
    /// Only requests FROM these peers may carry X-Forwarded-For; the client
    /// IP resolved from it is used for rate limiting and logging. Empty =
    /// legacy behavior (forwarded headers ignored entirely).
    #[arg(long, env = "MUX_WEB_TRUSTED_PROXIES")]
    pub trusted_proxies: Option<String>,
}

/// NET-007 (spec 011): one trusted-proxy entry — a bare IP or a CIDR range.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrustedProxy {
    Single(IpAddr),
    V4Cidr(Ipv4Addr, u8),
    V6Cidr(Ipv6Addr, u8),
}

impl TrustedProxy {
    pub fn matches(&self, ip: &IpAddr) -> bool {
        match self {
            TrustedProxy::Single(p) => p == ip,
            TrustedProxy::V4Cidr(base, prefix) => match ip {
                IpAddr::V4(v) => v4_in_cidr(v, base, *prefix),
                _ => false,
            },
            TrustedProxy::V6Cidr(base, prefix) => match ip {
                IpAddr::V6(v) => v6_in_cidr(v, base, *prefix),
                _ => false,
            },
        }
    }
}

fn v4_in_cidr(ip: &Ipv4Addr, base: &Ipv4Addr, prefix: u8) -> bool {
    let o = u32::from(*ip);
    let b = u32::from(*base);
    let bits = if prefix == 0 {
        0
    } else {
        32u32 - (prefix as u32).min(32)
    };
    (o >> bits) == (b >> bits)
}

fn v6_in_cidr(ip: &Ipv6Addr, base: &Ipv6Addr, prefix: u8) -> bool {
    let o = u128::from(*ip);
    let b = u128::from(*base);
    let bits = if prefix == 0 {
        0
    } else {
        128u128 - (prefix as u128).min(128)
    };
    (o >> bits) == (b >> bits)
}

/// NET-002 (spec 009): CGNAT range 100.64.0.0/10 — Tailscale/CGNAT VPN meshes.
pub fn is_cgnat_v4(v4: Ipv4Addr) -> bool {
    let o = v4.octets();
    o[0] == 100 && (o[1] & 0xC0) == 64
}

/// NET-002 (spec 009): unified "acceptable Host IP" rule shared by the gate
/// and the startup banner: loopback, private, link-local, CGNAT, unspecified,
/// or exactly the configured bind address.
pub fn is_gate_ok_ip(ip: IpAddr, bind: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4 == Ipv4Addr::UNSPECIFIED
                || is_cgnat_v4(v4)
                || IpAddr::V4(v4) == bind
        }
        IpAddr::V6(v6) => v6.is_loopback() || v6.is_unique_local() || IpAddr::V6(v6) == bind,
    }
}

/// NET-006 (spec 009): strict host token — alnum/dot/dash only, no dot runs,
/// no leading/trailing dot. Wildcards, schemes, paths, spaces all fail.
fn valid_host_token(s: &str) -> bool {
    !s.is_empty()
        && s.chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-')
        && !s.starts_with('.')
        && !s.ends_with('.')
        && !s.contains("..")
}

/// NET-008 (spec 011): allowlist entry — either a strict host token or a
/// wildcard `*.suffix` (dot-boundary). Bare `*` and `*.` are rejected.
pub fn valid_allowed_host_token(s: &str) -> bool {
    if let Some(rest) = s.strip_prefix("*.") {
        !rest.is_empty() && valid_host_token(rest)
    } else {
        valid_host_token(s)
    }
}

/// NET-008 (spec 011): match a Host header value against one allowlist entry.
/// Exact (case-insensitive) or dot-boundary wildcard: `*.ts.net` matches
/// `ts.net` itself AND any-depth subdomains (`a.b.ts.net`).
pub fn host_matches(entry: &str, host: &str) -> bool {
    let e = entry.to_ascii_lowercase();
    let h = host.to_ascii_lowercase();
    if let Some(suffix) = e.strip_prefix("*.") {
        h == suffix || h.ends_with(&format!(".{suffix}"))
    } else {
        e == h
    }
}

/// NET-004 (spec 009): pure collector for the startup banner — loopback
/// first, then advertised addresses, then interface IPs; deduped, order kept.
pub fn collect_access_urls(
    scheme: &str,
    port: u16,
    advertise: &[String],
    ips: &[IpAddr],
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut push = |u: String| {
        if !out.contains(&u) {
            out.push(u);
        }
    };
    push(format!("{scheme}://127.0.0.1:{port}"));
    for a in advertise {
        push(format!("{scheme}://{a}"));
    }
    for ip in ips {
        push(format!("{scheme}://{ip}:{port}"));
    }
    out
}

impl Config {
    /// TAB-001 (spec 008): clamp the configured limit to a safe range so a
    /// typo cannot exhaust low-end devices nor disable the guard entirely.
    pub fn effective_max_sessions(&self) -> usize {
        self.max_sessions.clamp(1, 16)
    }

    /// NET-001/006 (spec 009): parse + validate the allowlist (exact match,
    /// lowercased). Advertised hosts are implicitly allowlisted (host-part).
    /// Fails fast with an entry-numbered message so typos never silently
    /// widen the gate.
    pub fn effective_allowed_hosts(&self) -> Result<Vec<String>, String> {
        let mut out: Vec<String> = Vec::new();
        if let Some(raw) = &self.allowed_hosts {
            for (i, entry) in raw.split(',').enumerate() {
                let e = entry.trim().to_ascii_lowercase();
                // NET-008 (spec 011): wildcards allowed here, advertised
                // implicit entries stay exact-match only.
                if !valid_allowed_host_token(&e) {
                    return Err(format!("invalid --allowed-hosts entry #{}: '{e}'", i + 1));
                }
                if !out.contains(&e) {
                    out.push(e);
                }
            }
        }
        for a in self.effective_advertise_addrs()? {
            let host = match a.rsplit_once(':') {
                Some((h, p)) if p.chars().all(|c| c.is_ascii_digit()) && !p.is_empty() => h,
                _ => a.as_str(),
            };
            let host = host.to_ascii_lowercase();
            if !out.contains(&host) {
                out.push(host);
            }
        }
        Ok(out)
    }

    /// NET-003 (spec 009): parse + validate advertised addresses (`host[:port]`).
    /// Empty CSV segments are skipped (noise-tolerant); malformed entries fail.
    pub fn effective_advertise_addrs(&self) -> Result<Vec<String>, String> {
        let mut out: Vec<String> = Vec::new();
        if let Some(raw) = &self.advertise_addrs {
            for (i, entry) in raw.split(',').enumerate() {
                let e = entry.trim();
                if e.is_empty() {
                    continue;
                }
                let (host, port) = match e.rsplit_once(':') {
                    Some((h, p)) if !p.is_empty() && p.chars().all(|c| c.is_ascii_digit()) => {
                        (h, Some(p))
                    }
                    _ => (e, None),
                };
                if !valid_host_token(host) || host.contains(':') {
                    return Err(format!("invalid --advertise-addr entry #{}: '{e}'", i + 1));
                }
                let item = format!(
                    "{host}{}",
                    port.map(|p| format!(":{p}")).unwrap_or_default()
                );
                if !out.contains(&item) {
                    out.push(item);
                }
            }
        }
        Ok(out)
    }

    /// NET-007 (spec 011): parse + validate trusted proxies (IP or CIDR).
    /// Fails fast with an entry-numbered message.
    pub fn effective_trusted_proxies(&self) -> Result<Vec<TrustedProxy>, String> {
        let mut out: Vec<TrustedProxy> = Vec::new();
        if let Some(raw) = &self.trusted_proxies {
            for (i, entry) in raw.split(',').enumerate() {
                let e = entry.trim();
                if e.is_empty() {
                    continue;
                }
                if let Some((base, prefix)) = e.split_once('/') {
                    let ip: IpAddr = base.parse().map_err(|_| {
                        format!("invalid --trusted-proxies entry #{}: '{e}' (bad IP)", i + 1)
                    })?;
                    let plen: u8 = prefix.parse().map_err(|_| {
                        format!(
                            "invalid --trusted-proxies entry #{}: '{e}' (bad prefix)",
                            i + 1
                        )
                    })?;
                    let tp = match ip {
                        IpAddr::V4(v4) => {
                            if plen > 32 {
                                return Err(format!(
                                    "invalid --trusted-proxies entry #{}: '{e}' (v4 prefix > 32)",
                                    i + 1
                                ));
                            }
                            TrustedProxy::V4Cidr(v4, plen)
                        }
                        IpAddr::V6(v6) => {
                            if plen > 128 {
                                return Err(format!(
                                    "invalid --trusted-proxies entry #{}: '{e}' (v6 prefix > 128)",
                                    i + 1
                                ));
                            }
                            TrustedProxy::V6Cidr(v6, plen)
                        }
                    };
                    if !out.contains(&tp) {
                        out.push(tp);
                    }
                } else {
                    let ip: IpAddr = e.parse().map_err(|_| {
                        format!("invalid --trusted-proxies entry #{}: '{e}'", i + 1)
                    })?;
                    let tp = TrustedProxy::Single(ip);
                    if !out.contains(&tp) {
                        out.push(tp);
                    }
                }
            }
        }
        Ok(out)
    }

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
