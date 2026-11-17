use crate::config::Store;
use crate::widgets::{Hub, ServerId};
use base64::Engine;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Duration;

const SCOPES: &str = "user-read-currently-playing user-read-playback-state";
const POLL_INTERVAL: Duration = Duration::from_secs(5);
const IDLE_TITLES: &[&str] = &["spotify", "spotify free", "spotify premium"];

static AUTH_STATE: Mutex<Option<String>> = Mutex::new(None);

#[derive(Clone, Default, PartialEq)]
pub struct Track {
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover: String,
    pub playing: bool,
}

impl Track {
    fn to_json(&self) -> Value {
        json!({ "trackTitle": self.title, "trackArtist": self.artist, "trackAlbum": self.album, "coverUrl": self.cover, "isPlaying": self.playing })
    }
}

pub fn redirect_uri(port: u16) -> String {
    format!("http://127.0.0.1:{port}/auth/spotify/callback")
}

fn credentials(store: &Store) -> Option<(String, String)> {
    let config = store.config();
    let id = config["spotifyClientId"].as_str().unwrap_or_default().to_string();
    let secret = config["spotifyClientSecret"].as_str().unwrap_or_default().to_string();
    (!id.is_empty() && !secret.is_empty()).then_some((id, secret))
}

pub fn authorize_url(store: &Store, port: u16) -> Result<String, String> {
    let (client_id, _) = credentials(store).ok_or("Renseigne le Client ID et le Client Secret Spotify.")?;
    let state = format!("{:x}", rand::random::<u128>());
    *AUTH_STATE.lock().unwrap() = Some(state.clone());
    Ok(format!(
        "https://accounts.spotify.com/authorize?response_type=code&client_id={}&scope={}&redirect_uri={}&state={state}",
        urlencoding::encode(&client_id), urlencoding::encode(SCOPES), urlencoding::encode(&redirect_uri(port))
    ))
}

async fn token_request(http: &reqwest::Client, store: &Store, params: &[(&str, &str)]) -> Result<Value, String> {
    let (id, secret) = credentials(store).ok_or("Identifiants Spotify manquants")?;
    let basic = base64::engine::general_purpose::STANDARD.encode(format!("{id}:{secret}"));
    let response = http.post("https://accounts.spotify.com/api/token")
        .header("Authorization", format!("Basic {basic}"))
        .form(params)
        .send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("{status} {}", body["error_description"].as_str().or(body["error"].as_str()).unwrap_or_default()));
    }
    Ok(body)
}

fn store_tokens(store: &Store, body: &Value) {
    let expires = body["expires_in"].as_i64().unwrap_or(3600);
    let mut patch = json!({
        "spotifyAccessToken": body["access_token"],
        "spotifyTokenExpiry": chrono::Utc::now().timestamp_millis() + expires * 1000 - 60_000
    });
    if let Some(refresh) = body["refresh_token"].as_str() {
        patch["spotifyRefreshToken"] = json!(refresh);
    }
    let _ = store.merge("config", patch);
}

pub async fn handle_callback(http: &reqwest::Client, store: &Store, port: u16, query: &HashMap<String, String>) -> Result<(), String> {
    let expected = AUTH_STATE.lock().unwrap().take();
    let (Some(code), Some(state)) = (query.get("code"), query.get("state")) else { return Err("Code d'autorisation manquant".into()) };
    if expected.as_deref() != Some(state.as_str()) {
        return Err("État d'autorisation invalide".into());
    }
    let body = token_request(http, store, &[("grant_type", "authorization_code"), ("code", code), ("redirect_uri", &redirect_uri(port))]).await?;
    store_tokens(store, &body);
    Ok(())
}

async fn access_token(http: &reqwest::Client, store: &Store) -> Result<Option<String>, String> {
    let config = store.config();
    let token = config["spotifyAccessToken"].as_str().unwrap_or_default();
    if !token.is_empty() && config["spotifyTokenExpiry"].as_i64().unwrap_or(0) > chrono::Utc::now().timestamp_millis() {
        return Ok(Some(token.to_string()));
    }
    let refresh = config["spotifyRefreshToken"].as_str().unwrap_or_default().to_string();
    if refresh.is_empty() || credentials(store).is_none() {
        return Ok(None);
    }
    match token_request(http, store, &[("grant_type", "refresh_token"), ("refresh_token", &refresh)]).await {
        Ok(body) => {
            store_tokens(store, &body);
            Ok(body["access_token"].as_str().map(str::to_string))
        }
        Err(e) => {
            if e.starts_with("400") || e.starts_with("401") {
                let _ = store.merge("config", json!({ "spotifyAccessToken": "", "spotifyRefreshToken": "" }));
            }
            Err(e)
        }
    }
}

async fn cover_for(http: &reqwest::Client, cache: &Mutex<HashMap<String, (String, String)>>, artist: &str, title: &str) -> (String, String) {
    let query = format!("{artist} {title}").trim().to_string();
    if query.is_empty() {
        return Default::default();
    }
    if let Some(hit) = cache.lock().unwrap().get(&query.to_lowercase()).cloned() {
        return hit;
    }
    let get = |url: String| async move { http.get(url).send().await.ok()?.json::<Value>().await.ok() };
    let encoded = urlencoding::encode(&query).into_owned();

    let mut result = (String::new(), String::new());
    if let Some(data) = get(format!("https://itunes.apple.com/search?term={encoded}&entity=song&limit=1")).await {
        let item = &data["results"][0];
        result = (item["artworkUrl100"].as_str().unwrap_or_default().replace("100x100bb.jpg", "600x600bb.jpg"), item["collectionName"].as_str().unwrap_or_default().to_string());
    }
    if result.0.is_empty() {
        if let Some(data) = get(format!("https://api.deezer.com/search?q={encoded}&limit=1")).await {
            let album = &data["data"][0]["album"];
            let cover = album["cover_xl"].as_str().or(album["cover_big"].as_str()).unwrap_or_default().to_string();
            if result.1.is_empty() {
                result.1 = album["title"].as_str().unwrap_or_default().to_string();
            }
            result.0 = cover;
        }
    }
    if !result.0.is_empty() {
        cache.lock().unwrap().insert(query.to_lowercase(), result.clone());
    }
    result
}

#[cfg(windows)]
fn spotify_window_title() -> String {
    use windows_sys::Win32::Foundation::{CloseHandle, BOOL, HWND, LPARAM};
    use windows_sys::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION};
    use windows_sys::Win32::UI::WindowsAndMessaging::{EnumWindows, GetWindowTextLengthW, GetWindowTextW, GetWindowThreadProcessId, IsWindowVisible};

    unsafe extern "system" fn collect(hwnd: HWND, lparam: LPARAM) -> BOOL {
        let windows = &mut *(lparam as *mut Vec<(u32, String)>);
        if IsWindowVisible(hwnd) == 0 {
            return 1;
        }
        let length = GetWindowTextLengthW(hwnd);
        if length <= 0 {
            return 1;
        }
        let mut buffer = vec![0u16; length as usize + 1];
        let read = GetWindowTextW(hwnd, buffer.as_mut_ptr(), buffer.len() as i32).max(0) as usize;
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, &mut pid);
        windows.push((pid, String::from_utf16_lossy(&buffer[..read])));
        1
    }

    fn is_spotify(pid: u32) -> bool {
        unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
            if handle.is_null() {
                return false;
            }
            let mut buffer = [0u16; 1024];
            let mut size = buffer.len() as u32;
            let ok = QueryFullProcessImageNameW(handle, 0, buffer.as_mut_ptr(), &mut size);
            CloseHandle(handle);
            ok != 0 && String::from_utf16_lossy(&buffer[..size as usize]).to_lowercase().ends_with("\\spotify.exe")
        }
    }

    let mut windows: Vec<(u32, String)> = Vec::new();
    unsafe {
        EnumWindows(Some(collect), &mut windows as *mut Vec<(u32, String)> as LPARAM);
    }
    windows.into_iter()
        .filter(|(_, title)| !IDLE_TITLES.contains(&title.to_lowercase().as_str()) && title.contains(" - "))
        .find(|(pid, _)| is_spotify(*pid))
        .map(|(_, title)| title.trim().to_string())
        .unwrap_or_default()
}

#[cfg(not(windows))]
fn spotify_window_title() -> String {
    String::new()
}

async fn window_track(http: &reqwest::Client, cache: &Mutex<HashMap<String, (String, String)>>) -> Track {
    let title = tokio::task::spawn_blocking(spotify_window_title).await.unwrap_or_default();
    let Some((artist, song)) = title.split_once(" - ") else { return Track::default() };
    let (cover, album) = cover_for(http, cache, artist.trim(), song.trim()).await;
    Track { title: song.trim().into(), artist: artist.trim().into(), album: if album.is_empty() { "Spotify".into() } else { album }, cover, playing: true }
}

async fn current_track(http: &reqwest::Client, store: &Store, cache: &Mutex<HashMap<String, (String, String)>>) -> Track {
    let Ok(Some(token)) = access_token(http, store).await else { return window_track(http, cache).await };
    let Ok(response) = http.get("https://api.spotify.com/v1/me/player/currently-playing").bearer_auth(token).send().await else {
        return window_track(http, cache).await;
    };
    match response.status().as_u16() {
        204 => Track::default(),
        200 => {
            let data: Value = response.json().await.unwrap_or_default();
            let item = &data["item"];
            if item.is_null() {
                return Track::default();
            }
            let artist = item["artists"].as_array().map(|a| a.iter().filter_map(|x| x["name"].as_str()).collect::<Vec<_>>().join(", ")).unwrap_or_default();
            let title = item["name"].as_str().unwrap_or_default().to_string();
            let mut cover = item["album"]["images"][0]["url"].as_str().unwrap_or_default().to_string();
            if cover.is_empty() {
                cover = cover_for(http, cache, &artist, &title).await.0;
            }
            Track { title, artist, album: item["album"]["name"].as_str().unwrap_or_default().to_string(), cover, playing: data["is_playing"] != json!(false) }
        }
        401 => {
            let _ = store.merge("config", json!({ "spotifyAccessToken": "" }));
            window_track(http, cache).await
        }
        _ => window_track(http, cache).await,
    }
}

pub async fn poll(store: Arc<Store>, hub: Arc<Hub>) {
    let http = reqwest::Client::new();
    let cache = Mutex::new(HashMap::new());
    let mut last: Option<Track> = None;
    loop {
        if hub.has_clients(ServerId::Spotify) {
            let track = current_track(&http, &store, &cache).await;
            if last.as_ref() != Some(&track) {
                let _ = store.merge("widgets.spotify", track.to_json());
                hub.broadcast_config("spotify", &store.widget("spotify"));
                last = Some(track);
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
    }
}
