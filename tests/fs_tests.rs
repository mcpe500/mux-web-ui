mod common;

use common::start_server;
use tempfile::tempdir;

/// Each vector must be rejected by the endpoint (4xx) or resolved safely —
/// never return 200 with content from outside the root.
async fn expect_rejected(path: &str) {
    let temp = tempdir().unwrap();
    std::fs::write(temp.path().join("ok.txt"), "inside").unwrap();
    let server = start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;

    let resp = server
        .client
        .get(server.url("/api/v1/fs/entries"))
        .query(&[("root", "home"), ("path", path)])
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_client_error(),
        "path {path:?} must be rejected with 4xx, got {}",
        resp.status()
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_fs_002_traversal_dotdot_rejected() {
    expect_rejected("../outside").await;
    expect_rejected("a/../../outside").await;
    expect_rejected("/etc/passwd").await;
}

#[tokio::test]
async fn test_fs_017_encoded_slash_and_dots_rejected() {
    // Encoded slash after traversal: server decodes once -> ../ -> rejected.
    // Raw URL string: reqwest would re-encode %2F -> %252F and mask the vector.
    let temp = tempdir().unwrap();
    let server = start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;
    let resp = server
        .client
        .get(format!(
            "{}?root=home&path=..%2Foutside",
            server.url("/api/v1/fs/entries")
        ))
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_client_error(),
        "encoded slash traversal must be rejected, got {}",
        resp.status()
    );

    // Double encoding stays a literal filename -> treated as a missing file
    // (404) or empty listing (200) — never a traversal.
    let resp = server
        .client
        .get(server.url("/api/v1/fs/entries"))
        .query(&[("root", "home"), ("path", "%252e%252e%252f")])
        .send()
        .await
        .unwrap();
    assert!(
        resp.status() == 200 || resp.status() == 404,
        "double-encoded path must stay literal, got {}",
        resp.status()
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_fs_017_overlong_utf8_and_nul_rejected() {
    // Raw overlong UTF-8 (%c0%ae) is invalid UTF-8 -> query decoding must fail.
    let temp = tempdir().unwrap();
    let server = start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;
    let raw = format!(
        "{}?root=home&path=%c0%ae%c0%ae",
        server.url("/api/v1/fs/entries")
    );
    let resp = server.client.get(raw).send().await.unwrap();
    assert!(
        resp.status().is_client_error(),
        "overlong UTF-8 must be rejected, got {}",
        resp.status()
    );

    // NUL byte must be rejected before canonicalize.
    let resp = server
        .client
        .get(server.url("/api/v1/fs/entries"))
        .query(&[("root", "home"), ("path", "foo%00bar")])
        .send()
        .await
        .unwrap();
    assert!(resp.status().is_client_error());
    server.shutdown().await;
}

#[tokio::test]
async fn test_fs_003_symlink_escape_rejected() {
    let temp_root = tempdir().unwrap();
    let temp_outside = tempdir().unwrap();
    let outside_file = temp_outside.path().join("secret.txt");
    std::fs::write(&outside_file, "top secret").unwrap();
    #[cfg(unix)]
    std::os::unix::fs::symlink(&outside_file, temp_root.path().join("link")).unwrap();

    let server = start_server(vec![("home".to_string(), temp_root.path().to_path_buf())]).await;

    let resp = server
        .client
        .get(server.url("/api/v1/fs/file"))
        .query(&[("root", "home"), ("path", "link")])
        .send()
        .await
        .unwrap();
    assert!(
        resp.status().is_client_error(),
        "symlink escape must be rejected, got {}",
        resp.status()
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_fs_016_hardlink_escape_rejected() {
    let temp_root = tempdir().unwrap();
    let temp_outside = tempdir().unwrap();
    let outside_file = temp_outside.path().join("secret.txt");
    std::fs::write(&outside_file, "top secret").unwrap();
    #[cfg(unix)]
    std::fs::hard_link(&outside_file, temp_root.path().join("hard")).unwrap();

    let server = start_server(vec![("home".to_string(), temp_root.path().to_path_buf())]).await;

    let resp = server
        .client
        .get(server.url("/api/v1/fs/file"))
        .query(&[("root", "home"), ("path", "hard")])
        .send()
        .await
        .unwrap();
    #[cfg(unix)]
    assert!(
        resp.status().is_client_error(),
        "hardlink escape must be rejected, got {}",
        resp.status()
    );
    server.shutdown().await;
}

#[tokio::test]
async fn test_fs_002_normal_file_still_served() {
    let temp = tempdir().unwrap();
    std::fs::write(temp.path().join("ok.txt"), "hello world").unwrap();
    let sub = temp.path().join("subdir");
    std::fs::create_dir(&sub).unwrap();
    std::fs::write(sub.join("nested.log"), "nested content").unwrap();

    let server = start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;

    // Relative path without leading slash
    let resp = server
        .client
        .get(server.url("/api/v1/fs/file"))
        .query(&[("root", "home"), ("path", "ok.txt")])
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "hello world");

    // Root-relative path with leading slash (e.g. /ok.txt from explorer)
    let resp = server
        .client
        .get(server.url("/api/v1/fs/file"))
        .query(&[("root", "home"), ("path", "/ok.txt")])
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "hello world");

    // Nested path with leading slash (e.g. /subdir/nested.log)
    let resp = server
        .client
        .get(server.url("/api/v1/fs/file"))
        .query(&[("root", "home"), ("path", "/subdir/nested.log")])
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    assert_eq!(resp.text().await.unwrap(), "nested content");

    server.shutdown().await;
}
