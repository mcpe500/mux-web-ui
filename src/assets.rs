use axum::{
    http::{header, HeaderMap, StatusCode, Uri},
    response::{IntoResponse, Response},
};
use rust_embed::RustEmbed;

#[derive(RustEmbed)]
#[folder = "web/dist/"]
pub struct Assets;

pub async fn static_handler(uri: Uri) -> Response {
    let mut path = uri.path().trim_start_matches('/').to_string();

    if path.is_empty() {
        path = "index.html".to_string();
    }

    match Assets::get(&path) {
        Some(content) => {
            let mime = mime_guess::from_path(&path).first_or_octet_stream();
            let mut headers = HeaderMap::new();
            headers.insert(header::CONTENT_TYPE, mime.as_ref().parse().unwrap());

            // Immutable caching for hashed assets, no-cache for index.html
            if path == "index.html" {
                headers.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
            } else {
                headers.insert(
                    header::CACHE_CONTROL,
                    "public, max-age=31536000, immutable".parse().unwrap(),
                );
            }

            (StatusCode::OK, headers, content.data).into_response()
        }
        None => {
            // SPA Fallback to index.html if not an API route
            if uri.path().starts_with("/api/") {
                return (StatusCode::NOT_FOUND, "API route not found").into_response();
            }

            if let Some(index) = Assets::get("index.html") {
                let mut headers = HeaderMap::new();
                headers.insert(
                    header::CONTENT_TYPE,
                    "text/html; charset=utf-8".parse().unwrap(),
                );
                headers.insert(header::CACHE_CONTROL, "no-cache".parse().unwrap());
                (StatusCode::OK, headers, index.data).into_response()
            } else {
                (StatusCode::NOT_FOUND, "404 Not Found").into_response()
            }
        }
    }
}
