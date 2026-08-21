mod common;

use mux_web::archive::{ArchiveService, ExtractBudgets};
use std::fs;
use std::io::Write;
use std::path::Path;
use tempfile::tempdir;

fn create_sample_zip(dir: &Path, name: &str) -> std::path::PathBuf {
    let file_path = dir.join(name);
    let file = std::fs::File::create(&file_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("hello.txt", options).unwrap();
    zip.write_all(b"Hello World").unwrap();
    zip.start_file("subdir/nested.txt", options).unwrap();
    zip.write_all(b"Nested content").unwrap();
    zip.add_directory("emptydir/", options).unwrap();
    zip.finish().unwrap();
    file_path
}

fn create_sample_tar_gz(dir: &Path, name: &str) -> std::path::PathBuf {
    let file_path = dir.join(name);
    // Create source dir to tar
    let src_dir = dir.join("src_tar");
    fs::create_dir_all(&src_dir).unwrap();
    fs::write(src_dir.join("a.txt"), b"Tar hello").unwrap();
    fs::create_dir_all(src_dir.join("sub")).unwrap();
    fs::write(src_dir.join("sub/b.txt"), b"B content").unwrap();
    let tar_gz_file = std::fs::File::create(&file_path).unwrap();
    let enc = flate2::write::GzEncoder::new(tar_gz_file, flate2::Compression::default());
    let mut tar = tar::Builder::new(enc);
    tar.append_dir_all(".", &src_dir).unwrap();
    tar.finish().unwrap();
    file_path
}

fn create_traversal_zip(dir: &Path, name: &str) -> std::path::PathBuf {
    let file_path = dir.join(name);
    let file = std::fs::File::create(&file_path).unwrap();
    let mut zip = zip::ZipWriter::new(file);
    let options =
        zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
    // Malicious entry with traversal
    zip.start_file("../../evil.txt", options).unwrap();
    zip.write_all(b"evil content").unwrap();
    zip.start_file("/etc/passwd", options).unwrap();
    zip.write_all(b"evil2").unwrap();
    zip.finish().unwrap();
    file_path
}

#[tokio::test]
async fn test_arc_001_inspect_zip_and_tar() {
    let dir = tempdir().unwrap();
    let zip_path = create_sample_zip(dir.path(), "test.zip");
    let inspect = ArchiveService::inspect(&zip_path).unwrap();
    assert!(inspect.entries.iter().any(|e| e.path == "hello.txt"));
    assert!(inspect
        .entries
        .iter()
        .any(|e| e.path.contains("nested.txt")));
    assert!(inspect.total_files >= 2);
    assert!(inspect.total_uncompressed > 0);

    let tar_path = create_sample_tar_gz(dir.path(), "test.tar.gz");
    let inspect2 = ArchiveService::inspect(&tar_path).unwrap();
    // tar inspect should have entries
    assert!(
        inspect2.total_files >= 1,
        "tar must have files {:?}",
        inspect2.entries
    );
}

#[tokio::test]
async fn test_arc_002_extract_zip_clean() {
    let dir = tempdir().unwrap();
    let zip_path = create_sample_zip(dir.path(), "clean.zip");
    let dest = dir.path().join("dest");
    fs::create_dir_all(&dest).unwrap();
    ArchiveService::extract(&zip_path, &dest, &ExtractBudgets::default()).unwrap();
    assert!(dest.join("hello.txt").exists());
    assert_eq!(
        fs::read_to_string(dest.join("hello.txt")).unwrap(),
        "Hello World"
    );
    assert!(dest.join("subdir/nested.txt").exists());
}

#[tokio::test]
async fn test_arc_003_extract_tar_gz_clean() {
    let dir = tempdir().unwrap();
    let tar_path = create_sample_tar_gz(dir.path(), "clean.tar.gz");
    let dest = dir.path().join("dest_tar");
    fs::create_dir_all(&dest).unwrap();
    ArchiveService::extract(&tar_path, &dest, &ExtractBudgets::default()).unwrap();
    // Find extracted file (tar may have prefix .)
    let found = walkdir::WalkDir::new(&dest)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| e.file_name() == "a.txt");
    assert!(found, "extracted tar should contain a.txt");
}

#[tokio::test]
async fn test_arc_004_zip_slip_traversal_rejected() {
    let dir = tempdir().unwrap();
    let zip_path = create_traversal_zip(dir.path(), "evil.zip");
    let dest = dir.path().join("dest_evil");
    fs::create_dir_all(&dest).unwrap();
    let result = ArchiveService::extract(&zip_path, &dest, &ExtractBudgets::default());
    assert!(
        result.is_err(),
        "traversal must be rejected, got {:?}",
        result
    );
    // Ensure no evil file outside dest
    let outside = dir.path().join("evil.txt");
    assert!(!outside.exists(), "evil file must not escape");
    // Also check inside dest not contain evil traversal file at top level outside?
    assert!(!dest.join("../../evil.txt").exists());
    // The second entry /etc/passwd should also be blocked
    assert!(!Path::new("/tmp/evil_passwd").exists());
}

#[tokio::test]
async fn test_arc_005_zip_bomb_byte_budget_enforced() {
    let dir = tempdir().unwrap();
    // Create a zip that expands large but we set small budget
    let zip_path = dir.path().join("bomb.zip");
    {
        let file = std::fs::File::create(&zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Deflated);
        // Create a file with 1MB of zeros that compresses well but will be counted
        zip.start_file("big.txt", options).unwrap();
        let big = vec![b'a'; 1024 * 1024]; // 1MB
        zip.write_all(&big).unwrap();
        zip.finish().unwrap();
    }
    let dest = dir.path().join("dest_bomb");
    fs::create_dir_all(&dest).unwrap();
    let small_budget = ExtractBudgets {
        max_bytes: 100, // 100 bytes only
        max_files: 10000,
        max_ratio: 100,
    };
    let result = ArchiveService::extract(&zip_path, &dest, &small_budget);
    assert!(result.is_err(), "should be rejected due to byte budget");
    match result.unwrap_err() {
        mux_web::archive::ArchiveError::ZipBomb { .. } => {}
        e => panic!("expected ZipBomb, got {:?}", e),
    }
}

#[tokio::test]
async fn test_arc_006_archive_create_roundtrip() {
    let dir = tempdir().unwrap();
    let src_file = dir.path().join("orig.txt");
    fs::write(&src_file, b"roundtrip content").unwrap();
    let dest_zip = dir.path().join("created.zip");
    ArchiveService::create_zip(std::slice::from_ref(&src_file), &dest_zip).unwrap();
    assert!(dest_zip.exists());
    // Inspect created zip
    let inspect = ArchiveService::inspect(&dest_zip).unwrap();
    assert!(inspect.entries.iter().any(|e| e.path.contains("orig.txt")));
    // Extract and verify
    let dest_extract = dir.path().join("extracted");
    fs::create_dir_all(&dest_extract).unwrap();
    ArchiveService::extract(&dest_zip, &dest_extract, &ExtractBudgets::default()).unwrap();
    let found = walkdir::WalkDir::new(&dest_extract)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| {
            if e.file_name() == "orig.txt" {
                let content = fs::read(e.path()).unwrap();
                content == b"roundtrip content"
            } else {
                false
            }
        });
    assert!(found, "roundtrip file must exist with correct content");

    // Also test tar.gz create
    let dest_tar = dir.path().join("created.tar.gz");
    ArchiveService::create_tar_gz(std::slice::from_ref(&src_file), &dest_tar).unwrap();
    assert!(dest_tar.exists());
    let dest_extract2 = dir.path().join("extracted2");
    fs::create_dir_all(&dest_extract2).unwrap();
    ArchiveService::extract(&dest_tar, &dest_extract2, &ExtractBudgets::default()).unwrap();
    let found2 = walkdir::WalkDir::new(&dest_extract2)
        .into_iter()
        .filter_map(|e| e.ok())
        .any(|e| e.file_name() == "orig.txt");
    assert!(found2, "tar.gz roundtrip must contain file");
}

// HTTP integration tests
#[tokio::test]
async fn test_arc_http_inspect_and_extract() {
    let temp = tempdir().unwrap();
    let server = common::start_server(vec![("home".to_string(), temp.path().to_path_buf())]).await;
    // Create zip inside allowed root
    let zip_path = temp.path().join("http_test.zip");
    {
        let file = std::fs::File::create(&zip_path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("http.txt", options).unwrap();
        zip.write_all(b"http content").unwrap();
        zip.finish().unwrap();
    }
    // Inspect via HTTP
    let resp = server
        .client
        .get(server.url("/api/v1/archive/inspect?root=home&path=http_test.zip"))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200, "inspect should succeed");
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["total_files"], 1);

    // Extract via HTTP
    let dest_name = "dest_http";
    fs::create_dir_all(temp.path().join(dest_name)).unwrap();
    let resp = server
        .client
        .post(server.url("/api/v1/archive/extract"))
        .json(&serde_json::json!({
            "root": "home",
            "archive_path": "http_test.zip",
            "destination_dir": dest_name
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(
        resp.status(),
        200,
        "extract should succeed: {:?}",
        resp.text().await.unwrap()
    );
    assert!(temp.path().join(dest_name).join("http.txt").exists());

    // Traversal via HTTP should be blocked (archive with traversal)
    let evil_zip = temp.path().join("evil_http.zip");
    {
        let file = std::fs::File::create(&evil_zip).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        let options =
            zip::write::FileOptions::default().compression_method(zip::CompressionMethod::Stored);
        zip.start_file("../../evil2.txt", options).unwrap();
        zip.write_all(b"evil").unwrap();
        zip.finish().unwrap();
    }
    let resp = server
        .client
        .post(server.url("/api/v1/archive/extract"))
        .json(&serde_json::json!({
            "root": "home",
            "archive_path": "evil_http.zip",
            "destination_dir": dest_name
        }))
        .send()
        .await
        .unwrap();
    assert!(
        resp.status() == 400 || resp.status() == 413,
        "traversal should be blocked, got {}",
        resp.status()
    );

    server.shutdown().await;
}
