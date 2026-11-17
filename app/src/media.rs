use std::path::Path;

const IMAGES: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp"];
const AUDIO: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac"];
const VIDEO: &[&str] = &["webm", "mp4", "avi", "mov", "mkv", "m4v"];

fn extension(path: &Path) -> String {
    path.extension().and_then(|e| e.to_str()).unwrap_or_default().to_lowercase()
}

pub fn is_video(path: &Path) -> bool {
    VIDEO.contains(&extension(path).as_str())
}

pub fn is_media(path: &Path) -> bool {
    let ext = extension(path);
    IMAGES.contains(&ext.as_str()) || AUDIO.contains(&ext.as_str()) || VIDEO.contains(&ext.as_str())
}

pub fn content_type(path: &Path) -> &'static str {
    match extension(path).as_str() {
        "html" => "text/html; charset=utf-8",
        "css" => "text/css",
        "js" => "application/javascript",
        "json" => "application/json",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "svg" => "image/svg+xml",
        "webp" => "image/webp",
        "otf" => "font/otf",
        "ttf" => "font/ttf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "webm" => "video/webm",
        "mp4" | "m4v" => "video/mp4",
        "avi" => "video/x-msvideo",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        _ => "application/octet-stream",
    }
}
