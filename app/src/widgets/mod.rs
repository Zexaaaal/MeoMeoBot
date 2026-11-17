use crate::config::Store;
use crate::media::{content_type, is_media, is_video};
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, Query, State};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU16, AtomicUsize, Ordering};
use std::sync::{Arc, RwLock};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::sync::{broadcast, mpsc};
use tokio_util::io::ReaderStream;

const CLIENT_SCRIPT: &str = include_str!("client.js");
const ALERTS_DEFAULT_CSS: &str = include_str!("alerts_default.css");
const CSS_MARKER: &str = "/* __CUSTOM_CSS__ */";
const PORT_RETRY_LIMIT: u32 = 10;
const EPHEMERAL_PORT_FLOOR: u16 = 32768;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum ServerId {
    Chat,
    Spotify,
    Subgoals,
    Roulette,
    Goals,
    Alerts,
}

impl ServerId {
    pub const ALL: [ServerId; 6] = [Self::Chat, Self::Spotify, Self::Subgoals, Self::Roulette, Self::Goals, Self::Alerts];

    pub fn name(self) -> &'static str {
        match self {
            Self::Chat => "chat",
            Self::Spotify => "spotify",
            Self::Subgoals => "subgoals",
            Self::Roulette => "roulette",
            Self::Goals => "goals",
            Self::Alerts => "alerts",
        }
    }

    pub fn default_port(self) -> u16 {
        match self {
            Self::Chat => 8087,
            Self::Spotify => 8090,
            Self::Subgoals => 8091,
            Self::Roulette => 8092,
            Self::Goals => 8093,
            Self::Alerts => 8097,
        }
    }

    fn config_key(self) -> String {
        format!("config.{}WidgetPort", self.name())
    }

    pub fn owner_of(widget: &str) -> Option<ServerId> {
        Some(match widget {
            "chat" | "dock" | "emote-wall" => Self::Chat,
            "spotify" => Self::Spotify,
            "subgoals" | "subgoals-list" | "daily-subs" | "last-sub" | "last-follow" | "last-donation" => Self::Subgoals,
            "roulette" => Self::Roulette,
            "goals" => Self::Goals,
            "alerts" => Self::Alerts,
            _ => return None,
        })
    }

    fn page(self, widget: &str) -> Option<(&'static str, Page)> {
        Some(match (self, widget) {
            (Self::Chat, "chat") => ("chat_widget.html", Page::Chat),
            (Self::Chat, "dock") => ("dock_widget.html", Page::Dock),
            (Self::Chat, "emote-wall") => ("emote_wall_widget.html", Page::EmoteWall),
            (Self::Spotify, "spotify") => ("spotify_widget.html", Page::Spotify),
            (Self::Subgoals, "subgoals") => ("subgoals_widget.html", Page::Styled("subgoals")),
            (Self::Subgoals, "subgoals-list") => ("subgoals_list_widget.html", Page::Inline("subgoals-list")),
            (Self::Subgoals, "daily-subs") => ("daily_subs_widget.html", Page::Styled("subgoals")),
            (Self::Subgoals, "last-sub") => ("last_sub_widget.html", Page::Styled("subgoals")),
            (Self::Subgoals, "last-follow") => ("last_follow_widget.html", Page::Styled("subgoals")),
            (Self::Subgoals, "last-donation") => ("last_donation_widget.html", Page::Styled("subgoals")),
            (Self::Roulette, "roulette") => ("roulette_widget.html", Page::Roulette),
            (Self::Goals, "goals") => ("goals_widget.html", Page::Goal),
            (Self::Alerts, "alerts") => ("alerts_widget.html", Page::Generic),
            _ => return None,
        })
    }
}

#[derive(Clone, Copy)]
enum Page {
    Generic,
    Styled(&'static str),
    Inline(&'static str),
    Chat,
    Dock,
    EmoteWall,
    Spotify,
    Roulette,
    Goal,
}

#[derive(Debug)]
pub enum Incoming {
    Message { server: ServerId, data: Value },
    TwitchToken(String),
    SpotifyAuthorized,
}

#[derive(Default, Clone)]
pub struct TwitchAuth {
    pub client_id: String,
    pub app_token: String,
}

struct WidgetServer {
    port: AtomicU16,
    tx: broadcast::Sender<Arc<str>>,
    clients: AtomicUsize,
    previews: AtomicUsize,
}

pub struct Hub {
    servers: HashMap<ServerId, WidgetServer>,
    store: Arc<Store>,
    widgets_dir: PathBuf,
    run_id: String,
    incoming: mpsc::UnboundedSender<Incoming>,
    http: reqwest::Client,
    twitch_auth: RwLock<TwitchAuth>,
    connect_extras: RwLock<HashMap<ServerId, Vec<Value>>>,
    cast_media: RwLock<Option<CastMedia>>,
}

#[derive(Clone)]
pub struct CastMedia {
    pub path: PathBuf,
    pub ffmpeg: PathBuf,
}

type Ctx = State<(Arc<Hub>, ServerId)>;

impl Hub {
    pub fn new(store: Arc<Store>, widgets_dir: PathBuf, incoming: mpsc::UnboundedSender<Incoming>) -> Arc<Self> {
        let servers = ServerId::ALL
            .iter()
            .map(|id| {
                let (tx, _) = broadcast::channel(256);
                (*id, WidgetServer { port: AtomicU16::new(0), tx, clients: AtomicUsize::new(0), previews: AtomicUsize::new(0) })
            })
            .collect();
        Arc::new(Hub {
            servers,
            store,
            widgets_dir,
            run_id: chrono::Utc::now().timestamp_millis().to_string(),
            incoming,
            http: reqwest::Client::new(),
            twitch_auth: RwLock::new(TwitchAuth::default()),
            connect_extras: RwLock::new(HashMap::new()),
            cast_media: RwLock::new(None),
        })
    }

    pub fn set_cast_media(&self, media: Option<CastMedia>) {
        *self.cast_media.write().unwrap() = media;
    }

    pub fn twitch_auth(&self) -> TwitchAuth {
        self.twitch_auth.read().unwrap().clone()
    }

    pub fn set_twitch_auth(&self, auth: TwitchAuth) {
        *self.twitch_auth.write().unwrap() = auth;
    }

    pub fn set_connect_extras(&self, id: ServerId, messages: Vec<Value>) {
        self.connect_extras.write().unwrap().insert(id, messages);
    }

    pub fn port(&self, id: ServerId) -> u16 {
        self.servers[&id].port.load(Ordering::Relaxed)
    }

    pub fn url(&self, host: &str, widget: &str) -> String {
        let id = ServerId::owner_of(widget).unwrap_or(ServerId::Chat);
        format!("http://{host}:{}/widget/{widget}", self.port(id))
    }

    pub fn has_clients(&self, id: ServerId) -> bool {
        self.servers[&id].clients.load(Ordering::Relaxed) > 0
    }

    pub fn has_widget_clients(&self, id: ServerId) -> bool {
        let server = &self.servers[&id];
        server.clients.load(Ordering::Relaxed) > server.previews.load(Ordering::Relaxed)
    }

    pub fn broadcast(&self, id: ServerId, message: &Value) {
        let _ = self.servers[&id].tx.send(Arc::from(message.to_string()));
    }

    pub fn broadcast_config(&self, widget: &str, config: &Value) {
        if let Some(id) = ServerId::owner_of(widget) {
            self.broadcast(id, &json!({ "type": "config-update", "widget": widget, "config": config }));
            if widget == "subgoals" {
                self.broadcast(id, &json!({ "type": "config-update", "widget": "daily-subs", "config": config }));
            }
        }
    }

    pub fn broadcast_all(&self, message: &Value, except: Option<ServerId>) {
        for id in ServerId::ALL {
            if Some(id) != except {
                self.broadcast(id, message);
            }
        }
    }

    pub fn refresh_all(&self) {
        self.broadcast_all(&json!({ "type": "reload" }), None);
    }

    pub async fn start(self: &Arc<Self>) {
        let tasks: Vec<_> = ServerId::ALL.iter().map(|id| tauri::async_runtime::spawn(Self::serve(self.clone(), *id))).collect();
        for task in tasks {
            let _ = task.await;
        }
    }

    fn resolve_port(&self, id: ServerId) -> u16 {
        match self.store.get(&id.config_key()).as_u64() {
            Some(saved) if saved > 0 && saved < EPHEMERAL_PORT_FLOOR as u64 => saved as u16,
            _ => id.default_port(),
        }
    }

    async fn serve(hub: Arc<Self>, id: ServerId) {
        let port = hub.resolve_port(id);
        let mut attempts = 0;
        let listener = loop {
            match tokio::net::TcpListener::bind(("0.0.0.0", port)).await {
                Ok(listener) => break listener,
                Err(e) if attempts < PORT_RETRY_LIMIT => {
                    attempts += 1;
                    log::warn!("Port {port} occupé ({e}), nouvelle tentative {attempts}/{PORT_RETRY_LIMIT}");
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }
                Err(e) => {
                    log::error!("Port {port} indisponible pour le widget {} : {e}", id.name());
                    return;
                }
            }
        };

        hub.servers[&id].port.store(port, Ordering::Relaxed);
        let _ = hub.store.set(&id.config_key(), json!(port));
        log::info!("Serveur {} lancé sur le port {port}", id.name());

        let app = Router::new()
            .route("/", get(websocket))
            .route("/widget/base.css", get(base_css))
            .route("/widget/assets/{*path}", get(asset))
            .route("/widget/themes/{*path}", get(theme))
            .route("/widget/{name}", get(page))
            .route("/go/{name}", get(go_redirect))
            .route("/local-file", get(local_file))
            .route("/tts", get(tts))
            .route("/cast/media", get(cast_media))
            .route("/twitch/callback", get(twitch_callback))
            .route("/twitch/token", post(twitch_token))
            .route("/auth/spotify/login", get(spotify_login))
            .route("/auth/spotify/callback", get(spotify_callback))
            .with_state((hub.clone(), id))
            .layer(axum::middleware::map_response(common_headers));

        tauri::async_runtime::spawn(async move {
            if let Err(e) = axum::serve(listener, app).await {
                log::error!("Serveur {} arrêté : {e}", id.name());
            }
        });
    }

    async fn read_widget_file(&self, relative: &str) -> Option<String> {
        tokio::fs::read_to_string(self.widgets_dir.join(relative)).await.ok()
    }

    fn inject_client(html: &str, base_css: bool) -> String {
        let link = if base_css { "<link rel=\"stylesheet\" href=\"/widget/base.css\">\n" } else { "" };
        html.replacen("</head>", &format!("{link}<script>\n{CLIENT_SCRIPT}</script>\n</head>"), 1)
    }

    fn inject_auth(&self, html: String) -> String {
        let auth = self.twitch_auth.read().unwrap().clone();
        let config = self.store.config();
        let client_id = if auth.client_id.is_empty() { config["twitchClientId"].as_str().unwrap_or_default().to_string() } else { auth.client_id };
        let app_token = if auth.app_token.is_empty() { config["twitchAppToken"].as_str().unwrap_or_default().to_string() } else { auth.app_token };
        html.replacen("__TWITCH_CLIENT_ID__", &client_id, 1).replacen("__TWITCH_APP_TOKEN__", &app_token, 1)
    }

    fn chat_values(&self, html: String) -> String {
        let chat = self.store.widget("chat");
        let max_messages = chat["maxMessages"].as_u64().unwrap_or(10);
        let badge_prefs = if chat["badgePrefs"].is_object() { chat["badgePrefs"].clone() } else { json!({}) };
        self.inject_auth(html)
            .replacen("const MAX_MESSAGES = 10;", &format!("const MAX_MESSAGES = {max_messages};"), 1)
            .replacen("const BADGE_PREFS = {};", &format!("const BADGE_PREFS = {badge_prefs};"), 1)
    }

    fn render(&self, id: ServerId, page: Page, html: &str, query: &HashMap<String, String>) -> String {
        let generic = |name: &str, fallback: &str| {
            let config = self.store.widget(name);
            let css = config["customCSS"].as_str().filter(|c| !c.is_empty()).unwrap_or(fallback).to_string();
            Self::inject_client(html, true).replacen(CSS_MARKER, &css, 1)
        };
        let styled = |config: &Value| {
            let css = config["customCSS"].as_str().unwrap_or_default();
            Self::inject_client(&html.replacen(CSS_MARKER, &format!("<style id=\"custom-css\">{css}</style>"), 1), false)
        };

        match page {
            Page::Generic => generic(id.name(), if id == ServerId::Alerts { ALERTS_DEFAULT_CSS } else { "" }),
            Page::Styled(name) => styled(&self.store.widget(name)),
            Page::Inline(name) => generic(name, ""),
            Page::Chat => self.chat_values(generic("chat", "")),
            Page::Dock => self.chat_values(Self::inject_client(html, false)),
            Page::EmoteWall => {
                let config = self.store.widget("emote-wall");
                let num = |key: &str, fallback: u64| config[key].as_u64().unwrap_or(fallback);
                self.inject_auth(html.to_string())
                    .replacen("const ANIMATION_DURATION = 5000;", &format!("const ANIMATION_DURATION = {};", num("animationDuration", 5000)), 1)
                    .replacen("const SPAWN_INTERVAL = 100;", &format!("const SPAWN_INTERVAL = {};", num("spawnInterval", 100)), 1)
                    .replacen("const MIN_SIZE = 32;", &format!("const MIN_SIZE = {};", num("minSize", 32)), 1)
                    .replacen("const MAX_SIZE = 96;", &format!("const MAX_SIZE = {};", num("maxSize", 96)), 1)
                    .replacen(CSS_MARKER, config["customCSS"].as_str().unwrap_or_default(), 1)
            }
            Page::Spotify => {
                let config = self.store.widget("spotify");
                let text = |key: &str, fallback: &str| config[key].as_str().filter(|s| !s.is_empty()).unwrap_or(fallback).to_string();
                let initial = json!({
                    "trackTitle": text("trackTitle", "Titre du morceau"),
                    "trackArtist": text("trackArtist", "Artiste"),
                    "trackAlbum": text("trackAlbum", "Album"),
                    "coverUrl": text("coverUrl", ""),
                    "isPlaying": config["isPlaying"].as_bool().unwrap_or(false)
                });
                generic("spotify", "").replacen("const INITIAL_CONFIG = {};", &format!("const INITIAL_CONFIG = {initial};"), 1)
            }
            Page::Roulette => {
                let choices = self.store.widget("roulette")["choices"].clone();
                let choices = if choices.is_array() { choices } else { json!([]) };
                generic("roulette", "").replacen("const INITIAL_CHOICES = [];", &format!("const INITIAL_CHOICES = {choices};"), 1)
            }
            Page::Goal => {
                let goal_id = query.get("id").cloned().unwrap_or_default();
                let goals = self.store.widget("goals")["goals"].as_array().cloned().unwrap_or_default();
                let goal = goals.iter().find(|g| g["id"].as_str() == Some(goal_id.as_str())).or(goals.first()).cloned().unwrap_or(json!({}));
                styled(&goal).replacen("__GOAL_ID__", &goal_id, 1)
            }
        }
    }

    fn connect_messages(&self, id: ServerId) -> Vec<Value> {
        let mut messages = vec![
            json!({ "type": "handshake", "runId": self.run_id }),
            json!({ "type": "config-update", "widget": id.name(), "config": self.store.widget(id.name()) }),
        ];
        if id == ServerId::Subgoals {
            messages.push(json!({ "type": "config-update", "widget": "subgoals-list", "config": self.store.widget("subgoals-list") }));
            messages.push(json!({ "type": "config-update", "widget": "daily-subs", "config": self.store.widget("subgoals") }));
        }
        if let Some(extra) = self.connect_extras.read().unwrap().get(&id) {
            messages.extend(extra.iter().cloned());
        }
        messages
    }
}

async fn common_headers(mut response: Response) -> Response {
    let headers = response.headers_mut();
    headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store, no-cache, must-revalidate"));
    response
}

fn not_found() -> Response {
    (StatusCode::NOT_FOUND, "Not Found").into_response()
}

fn safe_relative(path: &str) -> Option<String> {
    let clean: Vec<&str> = path.split(['/', '\\']).filter(|p| !p.is_empty() && *p != ".").collect();
    if clean.iter().any(|p| *p == "..") { None } else { Some(clean.join("/")) }
}

async fn serve_file(path: PathBuf) -> Response {
    match tokio::fs::read(&path).await {
        Ok(bytes) => ([(header::CONTENT_TYPE, content_type(&path))], bytes).into_response(),
        Err(_) => not_found(),
    }
}

async fn base_css(State((hub, _)): Ctx) -> Response {
    serve_file(hub.widgets_dir.join("base.css")).await
}

async fn asset(State((hub, _)): Ctx, Path(path): Path<String>) -> Response {
    match safe_relative(&path) {
        Some(rel) => serve_file(hub.widgets_dir.join("assets").join(rel)).await,
        None => not_found(),
    }
}

async fn theme(State((hub, _)): Ctx, Path(path): Path<String>) -> Response {
    let Some(rel) = safe_relative(&path) else { return not_found() };
    let user = hub.store.user_data().join("themes").join(&rel);
    if user.exists() {
        serve_file(user).await
    } else {
        serve_file(hub.widgets_dir.join("themes").join(rel)).await
    }
}

async fn page(State((hub, id)): Ctx, Path(name): Path<String>, Query(query): Query<HashMap<String, String>>) -> Response {
    let Some((file, page)) = id.page(&name) else { return not_found() };
    match hub.read_widget_file(file).await {
        Some(html) => ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], hub.render(id, page, &html, &query)).into_response(),
        None => (StatusCode::INTERNAL_SERVER_ERROR, "Widget introuvable").into_response(),
    }
}

async fn go_redirect(State((hub, _)): Ctx, Path(name): Path<String>, Query(query): Query<HashMap<String, String>>) -> Response {
    let name = name.trim_end_matches('/');
    let Some(owner) = ServerId::owner_of(name) else { return not_found() };
    let port = hub.port(owner);
    if port == 0 {
        return (StatusCode::SERVICE_UNAVAILABLE, "Widget server not ready").into_response();
    }
    let search = if query.is_empty() {
        String::new()
    } else {
        format!("?{}", query.iter().map(|(k, v)| format!("{k}={}", urlencoding::encode(v))).collect::<Vec<_>>().join("&"))
    };
    (StatusCode::FOUND, [(header::LOCATION, format!("http://127.0.0.1:{port}/widget/{name}{search}"))]).into_response()
}

fn parse_range(value: &str, size: u64) -> Option<(u64, u64)> {
    let spec = value.strip_prefix("bytes=")?;
    let (start, end) = spec.split_once('-')?;
    let start: u64 = start.parse().ok()?;
    let end: u64 = if end.is_empty() { size.saturating_sub(1) } else { end.parse().ok()? };
    (start <= end && end < size).then_some((start, end))
}

async fn local_file(Query(query): Query<HashMap<String, String>>, headers: HeaderMap) -> Response {
    let Some(raw) = query.get("path") else { return (StatusCode::BAD_REQUEST, "No path specified").into_response() };
    let path = PathBuf::from(raw);
    if !is_media(&path) {
        return (StatusCode::FORBIDDEN, "Forbidden File Type").into_response();
    }
    serve_media(path, headers).await
}

async fn cast_media(State((hub, _)): Ctx, headers: HeaderMap) -> Response {
    let Some(media) = hub.cast_media.read().unwrap().clone() else { return not_found() };
    let is_mp4 = media.path.extension().is_some_and(|e| e.eq_ignore_ascii_case("mp4"));
    if is_mp4 {
        return serve_media(media.path, headers).await;
    }
    let child = tokio::process::Command::new(&media.ffmpeg)
        .arg("-i")
        .arg(&media.path)
        .args(["-f", "mp4", "-c:v", "libx264", "-c:a", "aac", "-movflags", "frag_keyframe+empty_moov", "-preset", "ultrafast", "pipe:1"])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .kill_on_drop(true)
        .creation_flags(0x0800_0000)
        .spawn();
    let Ok(mut child) = child else { return not_found() };
    let Some(stdout) = child.stdout.take() else { return not_found() };
    let stream = ReaderStream::new(stdout).map(move |chunk| {
        let _ = &child;
        chunk
    });
    ([(header::CONTENT_TYPE, "video/mp4")], Body::from_stream(stream)).into_response()
}

async fn serve_media(path: PathBuf, headers: HeaderMap) -> Response {
    let Ok(mut file) = tokio::fs::File::open(&path).await else { return not_found() };
    let Ok(meta) = file.metadata().await else { return not_found() };
    let size = meta.len();
    let mime = content_type(&path);

    if is_video(&path) {
        if let Some((start, end)) = headers.get(header::RANGE).and_then(|v| v.to_str().ok()).and_then(|v| parse_range(v, size)) {
            if file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
                return not_found();
            }
            let length = end - start + 1;
            return (
                StatusCode::PARTIAL_CONTENT,
                [
                    (header::CONTENT_TYPE, mime.to_string()),
                    (header::CONTENT_RANGE, format!("bytes {start}-{end}/{size}")),
                    (header::ACCEPT_RANGES, "bytes".to_string()),
                    (header::CONTENT_LENGTH, length.to_string()),
                ],
                Body::from_stream(ReaderStream::new(file.take(length))),
            )
                .into_response();
        }
    }

    (
        [
            (header::CONTENT_TYPE, mime.to_string()),
            (header::CONTENT_LENGTH, size.to_string()),
            (header::ACCEPT_RANGES, "bytes".to_string()),
        ],
        Body::from_stream(ReaderStream::new(file)),
    )
        .into_response()
}

async fn tts(State((hub, _)): Ctx, Query(query): Query<HashMap<String, String>>) -> Response {
    let Some(text) = query.get("text").filter(|t| !t.is_empty()) else {
        return (StatusCode::BAD_REQUEST, "Missing text parameter").into_response();
    };
    let url = format!("https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fr&q={}", urlencoding::encode(text));
    match hub.http.get(url).send().await {
        Ok(resp) if resp.status().is_success() => ([(header::CONTENT_TYPE, "audio/mpeg")], Body::from_stream(resp.bytes_stream())).into_response(),
        _ => (StatusCode::BAD_GATEWAY, "TTS Upstream Error").into_response(),
    }
}

const TWITCH_CALLBACK_PAGE: &str = r#"<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MeoMeoBot</title></head>
<body style="background:#07070a;color:#f0f0f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
<h2 id="msg">Connexion en cours...</h2>
<p id="sub" style="color:#8b8b9e"></p>
<script>
(function () {
    var params = new URLSearchParams(location.hash.replace(/^#/, ''));
    var token = params.get('access_token');
    var msg = document.getElementById('msg');
    var sub = document.getElementById('sub');
    if (!token) {
        msg.textContent = 'Échec de la connexion';
        sub.textContent = params.get('error_description') || 'Aucun token reçu.';
        return;
    }
    fetch('/twitch/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ access_token: token }) })
        .then(function () {
            msg.textContent = 'Connexion Twitch réussie';
            sub.textContent = 'Cette fenêtre se fermera automatiquement.';
            history.replaceState(null, '', location.pathname);
            setTimeout(function () { window.close(); }, 2500);
        })
        .catch(function (e) { msg.textContent = 'Erreur'; sub.textContent = String(e); });
})();
</script>
</body></html>"#;

async fn twitch_callback(State((_, id)): Ctx) -> Response {
    if id != ServerId::Chat {
        return not_found();
    }
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], TWITCH_CALLBACK_PAGE).into_response()
}

async fn twitch_token(State((hub, id)): Ctx, body: String) -> Response {
    if id != ServerId::Chat {
        return not_found();
    }
    let token = serde_json::from_str::<Value>(&body).ok().and_then(|v| v["access_token"].as_str().map(str::to_string));
    match token {
        Some(token) if body.len() < 8192 => {
            let _ = hub.incoming.send(Incoming::TwitchToken(token));
            (StatusCode::OK, axum::Json(json!({ "ok": true }))).into_response()
        }
        _ => (StatusCode::BAD_REQUEST, axum::Json(json!({ "ok": false }))).into_response(),
    }
}

fn result_page(ok: bool, title: &str, detail: &str) -> Response {
    let color = if ok { "#34d399" } else { "#f87171" };
    let close = if ok { "<script>setTimeout(function () { window.close(); }, 2500);</script>" } else { "" };
    let html = format!("<!DOCTYPE html><html><head><meta charset=\"utf-8\"><title>MeoMeoBot</title></head><body style=\"background:#07070a;color:#f0f0f5;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column\"><h2 style=\"color:{color}\">{}</h2><p style=\"color:#8b8b9e\">{}</p>{close}</body></html>", crate::alerts::escape_html(title), crate::alerts::escape_html(detail));
    ([(header::CONTENT_TYPE, "text/html; charset=utf-8")], html).into_response()
}

async fn spotify_login(State((hub, id)): Ctx) -> Response {
    if id != ServerId::Spotify {
        return not_found();
    }
    match crate::spotify::authorize_url(&hub.store, hub.port(id)) {
        Ok(url) => (StatusCode::FOUND, [(header::LOCATION, url)]).into_response(),
        Err(e) => result_page(false, "Spotify non configuré", &e),
    }
}

async fn spotify_callback(State((hub, id)): Ctx, Query(query): Query<HashMap<String, String>>) -> Response {
    if id != ServerId::Spotify {
        return not_found();
    }
    match crate::spotify::handle_callback(&hub.http, &hub.store, hub.port(id), &query).await {
        Ok(()) => {
            let _ = hub.incoming.send(Incoming::SpotifyAuthorized);
            result_page(true, "Connexion Spotify réussie", "Cette fenêtre se fermera automatiquement.")
        }
        Err(e) => result_page(false, "Échec de la connexion Spotify", &e),
    }
}

fn preview_samples(id: ServerId) -> Vec<Value> {
    if id != ServerId::Chat {
        return Vec::new();
    }
    let message = |n: u32, user: &str, color: &str, text: &str| json!({
        "type": "chat", "platform": "twitch", "id": format!("preview-{n}"), "username": user.to_lowercase(),
        "displayName": user, "text": text, "color": color, "badgesRaw": "", "badgesObj": {}, "emotes": {}, "isWidgetHidden": false
    });
    vec![
        message(1, "Alice", "#ff7a00", "Hello tout le monde !"),
        message(2, "Bob", "#7c3aed", "Ceci est un aperçu du thème."),
        message(3, "Alice", "#ff7a00", "Les messages suivants s'empilent comme en live."),
    ]
}

async fn websocket(State((hub, id)): Ctx, upgrade: WebSocketUpgrade) -> Response {
    upgrade.on_upgrade(move |socket| handle_socket(hub, id, socket))
}

async fn handle_socket(hub: Arc<Hub>, id: ServerId, socket: WebSocket) {
    let server = &hub.servers[&id];
    server.clients.fetch_add(1, Ordering::Relaxed);
    let mut rx = server.tx.subscribe();
    let (mut sender, mut receiver) = socket.split();
    let mut is_preview = false;

    for message in hub.connect_messages(id) {
        if sender.send(Message::Text(message.to_string().into())).await.is_err() {
            break;
        }
    }
    let _ = hub.incoming.send(Incoming::Message { server: id, data: json!({ "type": "client-connected" }) });

    loop {
        tokio::select! {
            outgoing = rx.recv() => match outgoing {
                Ok(text) => {
                    if sender.send(Message::Text(text.to_string().into())).await.is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            },
            incoming = receiver.next() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    let Ok(data) = serde_json::from_str::<Value>(&text) else { continue };
                    match data["type"].as_str() {
                        Some("get-config") => {
                            let reply = json!({ "type": "config", "config": hub.store.widget(id.name()) });
                            if sender.send(Message::Text(reply.to_string().into())).await.is_err() {
                                break;
                            }
                        }
                        Some("register-preview") if !is_preview => {
                            is_preview = true;
                            server.previews.fetch_add(1, Ordering::Relaxed);
                            for sample in preview_samples(id) {
                                if sender.send(Message::Text(sample.to_string().into())).await.is_err() {
                                    break;
                                }
                            }
                        }
                        _ => {
                            let _ = hub.incoming.send(Incoming::Message { server: id, data });
                        }
                    }
                }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => {}
            }
        }
    }

    if is_preview {
        server.previews.fetch_sub(1, Ordering::Relaxed);
    }
    server.clients.fetch_sub(1, Ordering::Relaxed);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ranges_are_parsed_and_bounded() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=900-2000", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
    }

    #[test]
    fn traversal_is_rejected() {
        assert_eq!(safe_relative("pranax.webm"), Some("pranax.webm".to_string()));
        assert_eq!(safe_relative("../../secret.txt"), None);
        assert_eq!(safe_relative("a\\..\\b"), None);
    }

    #[test]
    fn every_widget_has_an_owner_and_a_page() {
        for widget in ["chat", "dock", "emote-wall", "spotify", "subgoals", "subgoals-list", "daily-subs", "last-sub", "last-follow", "last-donation", "roulette", "goals", "alerts"] {
            let owner = ServerId::owner_of(widget).expect(widget);
            assert!(owner.page(widget).is_some(), "{widget}");
        }
    }
}
