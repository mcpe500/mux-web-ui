// RTR-002..005 (spec 013): 9Router local gateway detection & model listing.
// Security posture: host is LOCKED to 127.0.0.1 — only the port is configurable
// (MUX_WEB_ROUTER9_PORT, default 20128). No client-supplied URLs.
use std::net::{IpAddr, SocketAddr};
use std::time::Duration;

pub const DEFAULT_PORT: u16 = 20128;
const CONNECT_TIMEOUT: Duration = Duration::from_millis(400);

pub fn configured_port() -> u16 {
    std::env::var("MUX_WEB_ROUTER9_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(DEFAULT_PORT)
}

fn addr(port: u16) -> SocketAddr {
    SocketAddr::new(IpAddr::from([127, 0, 0, 1]), port)
}

/// RTR-002: is something listening on 127.0.0.1:<port>?
pub fn router_running(port: u16) -> bool {
    std::net::TcpStream::connect_timeout(&addr(port), CONNECT_TIMEOUT).is_ok()
}

/// RTR-002: GET http://127.0.0.1:<port>/v1/models and extract model ids.
/// Returns Err("CONNECT_FAILED") when the router is down.
pub async fn fetch_models(port: u16) -> Result<Vec<String>, String> {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let mut stream = tokio::net::TcpStream::connect(addr(port))
        .await
        .map_err(|_| String::from("CONNECT_FAILED"))?;
    let req = format!(
        "GET /v1/models HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\nAccept: application/json\r\n\r\n"
    );
    stream
        .write_all(req.as_bytes())
        .await
        .map_err(|e| format!("WRITE_FAILED:{e}"))?;
    let mut buf = Vec::new();
    stream
        .read_to_end(&mut buf)
        .await
        .map_err(|e| format!("READ_FAILED:{e}"))?;
    parse_models_response(&String::from_utf8_lossy(&buf))
}

/// Split HTTP response into body then extract `data[].id`. Tolerates both
/// `{"data":[{"id":"x"}]}` and bare `[{"id":"x"}]`.
pub fn parse_models_response(raw: &str) -> Result<Vec<String>, String> {
    let body = raw.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or(raw);
    let v: serde_json::Value =
        serde_json::from_str(body.trim()).map_err(|e| format!("BAD_JSON:{e}"))?;
    let arr = match &v {
        serde_json::Value::Array(a) => a.clone(),
        other => other
            .get("data")
            .and_then(|d| d.as_array())
            .cloned()
            .ok_or_else(|| String::from("BAD_JSON:no data array"))?,
    };
    Ok(arr
        .iter()
        .filter_map(|m| m.get("id").and_then(|i| i.as_str()).map(String::from))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rtr_005_parse_models_data_shape() {
        let raw = "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{\"data\":[{\"id\":\"gpt-4o\"},{\"id\":\"claude-sonnet\"}]}";
        let ids = parse_models_response(raw).unwrap();
        assert_eq!(ids, vec!["gpt-4o", "claude-sonnet"]);
    }

    #[test]
    fn rtr_005_parse_models_bare_array() {
        let ids = parse_models_response("\r\n\r\n[{\"id\":\"glm\"}]").unwrap();
        assert_eq!(ids, vec!["glm"]);
    }

    #[test]
    fn rtr_005_parse_garbage_is_error() {
        assert!(parse_models_response("\r\n\r\nnot json").is_err());
    }

    /// RTR-005: router_running true against a live fixture listener, false on
    /// an unused port; fetch_models round-trips through a mini HTTP responder.
    #[tokio::test]
    async fn rtr_005_status_and_models_fixture() {
        let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        std::thread::spawn(move || {
            // serve every probe/connection (router_running + fetch_models)
            use std::io::{Read, Write};
            for stream in listener.incoming().flatten() {
                let mut s = stream;
                let mut buf = [0u8; 1024];
                let _ = s.read(&mut buf);
                let body = "{\"data\":[{\"id\":\"model-a\"},{\"id\":\"model-b\"}]}";
                let resp = format!(
                    "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    body.len(),
                    body
                );
                let _ = s.write_all(resp.as_bytes());
            }
        });
        // small delay so the acceptor thread is listening before we connect
        tokio::time::sleep(Duration::from_millis(150)).await;

        assert!(router_running(port), "fixture listener should be up");
        let models = fetch_models(port).await.unwrap();
        assert_eq!(models, vec!["model-a", "model-b"]);
    }

    #[tokio::test]
    async fn rtr_005_router_down_connect_failed() {
        // bind then drop to grab a port that is (almost certainly) free
        let l = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
        let port = l.local_addr().unwrap().port();
        drop(l);
        assert!(!router_running(port));
        assert_eq!(fetch_models(port).await.unwrap_err(), "CONNECT_FAILED");
    }
}
