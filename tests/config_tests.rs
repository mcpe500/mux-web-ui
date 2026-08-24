// NET-001/002/003/006 (spec 009): config parser & helpers for VPN/custom-host
// access. Red phase: fields/helpers do not exist yet → compile error = RED.

use clap::Parser as _;
use mux_web::config::{collect_access_urls, Config};
use std::net::{IpAddr, Ipv4Addr};

fn cfg(extra: &[&str]) -> Config {
    let mut args = vec!["mux-web"];
    args.extend(extra);
    Config::parse_from(args)
}

// ── NET-006: allowlist parser — valid cases ──

#[test]
fn net_006_parser_valid_single() {
    let c = cfg(&["--allowed-hosts", "a.test"]);
    let hosts = c.effective_allowed_hosts().expect("valid");
    assert_eq!(hosts, vec!["a.test".to_string()]);
}

#[test]
fn net_006_parser_trims_and_lowercases() {
    let c = cfg(&["--allowed-hosts", "  A.Test , Host.Tail-Scale.TS.NET  "]);
    let hosts = c.effective_allowed_hosts().expect("valid");
    assert_eq!(hosts, vec!["a.test", "host.tail-scale.ts.net"]);
}

#[test]
fn net_006_parser_accepts_ip_literal() {
    let c = cfg(&["--allowed-hosts", "100.64.1.2,mux.lab.internal"]);
    let hosts = c.effective_allowed_hosts().expect("valid");
    assert_eq!(hosts, vec!["100.64.1.2", "mux.lab.internal"]);
}

// ── NET-006: allowlist parser — invalid cases fail fast ──

#[test]
fn net_006_parser_rejects_wildcard() {
    let c = cfg(&["--allowed-hosts", "*.ts.net"]);
    let err = c.effective_allowed_hosts().unwrap_err();
    assert!(err.contains("entry #1"), "err: {err}");
}

#[test]
fn net_006_parser_rejects_bare_star_and_empty_entry() {
    let c = cfg(&["--allowed-hosts", "*,a.test"]);
    assert!(c
        .effective_allowed_hosts()
        .unwrap_err()
        .contains("entry #1"));

    let c = cfg(&["--allowed-hosts", "a.test,,b.test"]);
    assert!(c
        .effective_allowed_hosts()
        .unwrap_err()
        .contains("entry #2"));
}

#[test]
fn net_006_parser_rejects_scheme_path_space() {
    for bad in ["http://a.test", "a.test/x", "a b"] {
        let c = cfg(&["--allowed-hosts", bad]);
        let err = c.effective_allowed_hosts().unwrap_err();
        assert!(
            err.contains("invalid --allowed-hosts"),
            "bad={bad} err={err}"
        );
    }
}

#[test]
fn net_006_parser_rejects_dot_runs() {
    let c = cfg(&["--allowed-hosts", "a..test"]);
    assert!(c.effective_allowed_hosts().is_err());
}

// ── NET-002: CGNAT 100.64/10 helper ──

#[test]
fn net_002_cgnat_boundaries() {
    assert!(mux_web::config::is_cgnat_v4(Ipv4Addr::new(100, 64, 0, 0)));
    assert!(mux_web::config::is_cgnat_v4(Ipv4Addr::new(
        100, 127, 255, 255
    )));
    assert!(!mux_web::config::is_cgnat_v4(Ipv4Addr::new(100, 128, 0, 0)));
    assert!(!mux_web::config::is_cgnat_v4(Ipv4Addr::new(
        100, 63, 255, 255
    )));
    assert!(!mux_web::config::is_cgnat_v4(Ipv4Addr::new(99, 100, 1, 1)));
}

#[test]
fn net_002_gate_ok_ip_includes_cgnat_and_private() {
    let bind = IpAddr::V4(Ipv4Addr::LOCALHOST);
    assert!(mux_web::config::is_gate_ok_ip(
        IpAddr::V4(Ipv4Addr::new(100, 64, 1, 2)),
        bind
    ));
    assert!(mux_web::config::is_gate_ok_ip(
        IpAddr::V4(Ipv4Addr::new(192, 168, 1, 5)),
        bind
    ));
    assert!(mux_web::config::is_gate_ok_ip(
        IpAddr::V4(Ipv4Addr::LOCALHOST),
        bind
    ));
    assert!(!mux_web::config::is_gate_ok_ip(
        IpAddr::V4(Ipv4Addr::new(93, 184, 216, 34)),
        bind
    ));
}

// ── NET-003: advertise addrs ──

#[test]
fn net_003_advertise_parser_valid_with_and_without_port() {
    let c = cfg(&[
        "--advertise-addr",
        "pixel.tail-scale.ts.net:7681, mux.lab.internal",
    ]);
    let out = c.effective_advertise_addrs().expect("valid");
    assert_eq!(
        out,
        vec!["pixel.tail-scale.ts.net:7681", "mux.lab.internal"]
    );
}

#[test]
fn net_003_advertise_parser_rejects_junk() {
    for bad in ["http://a.test", "*.ts.net", "a b"] {
        let c = cfg(&["--advertise-addr", bad]);
        assert!(c.effective_advertise_addrs().is_err(), "bad={bad}");
    }
}

#[test]
fn net_003_advertise_implies_allowlist_host_part() {
    let c = cfg(&["--advertise-addr", "pixel.tail-scale.ts.net:7681"]);
    let hosts = c.effective_allowed_hosts().expect("valid");
    assert!(hosts.contains(&"pixel.tail-scale.ts.net".to_string()));
}

// ── NET-004: access URL collector (pure) ──

#[test]
fn net_004_collect_access_urls_order_and_dedupe() {
    let ips = vec![
        IpAddr::V4(Ipv4Addr::new(192, 168, 1, 10)),
        IpAddr::V4(Ipv4Addr::new(100, 64, 1, 2)), // CGNAT/VPN
    ];
    let urls = collect_access_urls(
        "http",
        7681,
        &["127.0.0.1:7681".to_string(), "pix.ts.net:7681".to_string()],
        &ips,
    );
    assert_eq!(urls[0], "http://127.0.0.1:7681");
    assert!(urls.contains(&"http://pix.ts.net:7681".to_string()));
    assert!(urls.contains(&"http://100.64.1.2:7681".to_string()));
    assert!(urls.contains(&"http://192.168.1.10:7681".to_string()));
    // dedupe: loopback advertised explicitly must not appear twice
    let count = urls
        .iter()
        .filter(|u| *u == "http://127.0.0.1:7681")
        .count();
    assert_eq!(count, 1, "dedupe loopback: {urls:?}");
}
