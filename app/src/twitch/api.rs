use reqwest::Method;
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::RwLock;

const HELIX: &str = "https://api.twitch.tv/helix";

#[derive(Debug, Clone, Default)]
pub struct Credentials {
    pub token: String,
    pub client_id: String,
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
pub struct Validation {
    pub client_id: String,
    pub user_id: String,
    #[serde(default)]
    pub scopes: Vec<String>,
    #[serde(default)]
    pub expires_in: i64,
}

#[derive(Debug)]
pub struct HelixError {
    pub status: u16,
    pub message: String,
}

impl std::fmt::Display for HelixError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if self.status == 0 { write!(f, "{}", self.message) } else { write!(f, "{} {}", self.status, self.message) }
    }
}

impl From<reqwest::Error> for HelixError {
    fn from(e: reqwest::Error) -> Self {
        HelixError { status: 0, message: e.to_string() }
    }
}

pub type HelixResult<T> = Result<T, HelixError>;

pub struct Helix {
    pub http: reqwest::Client,
    credentials: RwLock<Credentials>,
}

pub fn strip_oauth(token: &str) -> String {
    token.trim().trim_start_matches("oauth:").to_string()
}

impl Helix {
    pub fn new(http: reqwest::Client) -> Self {
        Helix { http, credentials: RwLock::new(Credentials::default()) }
    }

    pub fn credentials(&self) -> Credentials {
        self.credentials.read().unwrap().clone()
    }

    pub fn set_credentials(&self, credentials: Credentials) {
        *self.credentials.write().unwrap() = credentials;
    }

    pub fn is_ready(&self) -> bool {
        let c = self.credentials.read().unwrap();
        !c.token.is_empty() && !c.client_id.is_empty() && !c.user_id.is_empty()
    }

    pub async fn validate(&self, token: &str) -> Option<Validation> {
        let response = self.http.get("https://id.twitch.tv/oauth2/validate")
            .header("Authorization", format!("OAuth {}", strip_oauth(token)))
            .send().await.ok()?;
        if !response.status().is_success() {
            return None;
        }
        response.json().await.ok()
    }

    pub async fn request(&self, method: Method, path: &str, query: &[(&str, String)], body: Option<Value>) -> HelixResult<Value> {
        let creds = self.credentials();
        if creds.token.is_empty() || creds.client_id.is_empty() || creds.user_id.is_empty() {
            return Err(HelixError { status: 0, message: "Bot non connecté à Twitch".into() });
        }

        let mut request = self.http.request(method, format!("{HELIX}/{path}"))
            .query(query)
            .bearer_auth(&creds.token)
            .header("Client-Id", &creds.client_id);
        if let Some(body) = body {
            request = request.json(&body);
        }

        let response = request.send().await?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            let message = serde_json::from_str::<Value>(&text).ok()
                .and_then(|v| v["message"].as_str().map(str::to_string))
                .unwrap_or_else(|| if text.is_empty() { status.to_string() } else { text });
            return Err(HelixError { status: status.as_u16(), message });
        }
        Ok(if text.is_empty() { Value::Null } else { serde_json::from_str(&text).unwrap_or(Value::Null) })
    }

    fn me(&self) -> String {
        self.credentials.read().unwrap().user_id.clone()
    }

    pub async fn send_chat(&self, text: &str) -> HelixResult<Option<String>> {
        let me = self.me();
        let truncated: String = text.chars().take(500).collect();
        let data = self.request(Method::POST, "chat/messages", &[], Some(json!({
            "broadcaster_id": me, "sender_id": me, "message": truncated
        }))).await?;
        let sent = &data["data"][0];
        if sent["is_sent"] == json!(false) {
            let reason = sent["drop_reason"]["message"].as_str().unwrap_or("inconnu");
            return Err(HelixError { status: 0, message: format!("Message bloqué par Twitch : {reason}") });
        }
        Ok(sent["message_id"].as_str().map(str::to_string))
    }

    pub async fn delete_message(&self, message_id: &str) -> HelixResult<()> {
        let me = self.me();
        self.request(Method::DELETE, "moderation/chat", &[("broadcaster_id", me.clone()), ("moderator_id", me), ("message_id", message_id.to_string())], None).await?;
        Ok(())
    }

    pub async fn create_clip(&self) -> HelixResult<Option<String>> {
        let data = self.request(Method::POST, "clips", &[("broadcaster_id", self.me())], None).await?;
        Ok(data["data"][0]["id"].as_str().map(str::to_string))
    }

    pub async fn sub_count(&self) -> Option<i64> {
        self.request(Method::GET, "subscriptions", &[("broadcaster_id", self.me())], None).await.ok()?["total"].as_i64()
    }

    pub async fn follower_count(&self) -> i64 {
        self.request(Method::GET, "channels/followers", &[("broadcaster_id", self.me())], None).await
            .ok().and_then(|v| v["total"].as_i64()).unwrap_or(0)
    }

    pub async fn stream_started_at(&self) -> Option<String> {
        let data = self.request(Method::GET, "streams", &[("user_id", self.me())], None).await.ok()?;
        let stream = &data["data"][0];
        (stream["type"] == json!("live")).then(|| stream["started_at"].as_str().map(str::to_string)).flatten()
    }

    pub async fn subscribe_event(&self, kind: &str, version: &str, condition: Value, session_id: &str) -> HelixResult<()> {
        let body = json!({ "type": kind, "version": version, "condition": condition, "transport": { "method": "websocket", "session_id": session_id } });
        match self.request(Method::POST, "eventsub/subscriptions", &[], Some(body)).await {
            Err(e) if e.status == 409 => Ok(()),
            other => other.map(|_| ()),
        }
    }

    pub async fn channel_emotes(&self) -> Vec<String> {
        let url = |id: &str| format!("https://static-cdn.jtvnw.net/emoticons/v2/{id}/default/dark/3.0");
        let ids = |data: &Value| -> Vec<(String, bool)> {
            data["data"].as_array().map(|list| list.iter().filter_map(|e| {
                let id = e["id"].as_str()?.to_string();
                let animated = e["format"].as_array().map(|f| f.iter().any(|v| v == "animated")).unwrap_or(false);
                Some((id, animated))
            }).collect()).unwrap_or_default()
        };

        let channel = self.request(Method::GET, "chat/emotes", &[("broadcaster_id", self.me())], None).await.map(|d| ids(&d)).unwrap_or_default();
        if channel.is_empty() {
            let global = self.request(Method::GET, "chat/emotes/global", &[], None).await.map(|d| ids(&d)).unwrap_or_default();
            return global.into_iter().take(50).map(|(id, _)| url(&id)).collect();
        }
        let animated: Vec<String> = channel.iter().filter(|(_, a)| *a).map(|(id, _)| url(id)).collect();
        if animated.is_empty() { channel.iter().map(|(id, _)| url(id)).collect() } else { animated }
    }

    pub async fn rewards(&self, only_manageable: bool) -> HelixResult<Vec<Value>> {
        let mut query = vec![("broadcaster_id", self.me())];
        if only_manageable {
            query.push(("only_manageable_rewards", "true".into()));
        }
        let data = self.request(Method::GET, "channel_points/custom_rewards", &query, None).await?;
        Ok(data["data"].as_array().cloned().unwrap_or_default())
    }

    pub async fn create_reward(&self, body: Value) -> HelixResult<Value> {
        let data = self.request(Method::POST, "channel_points/custom_rewards", &[("broadcaster_id", self.me())], Some(body)).await?;
        Ok(data["data"][0].clone())
    }

    pub async fn update_reward(&self, id: &str, body: Value) -> HelixResult<Value> {
        let data = self.request(Method::PATCH, "channel_points/custom_rewards", &[("broadcaster_id", self.me()), ("id", id.to_string())], Some(body)).await?;
        Ok(data["data"][0].clone())
    }

    pub async fn delete_reward(&self, id: &str) -> HelixResult<()> {
        self.request(Method::DELETE, "channel_points/custom_rewards", &[("broadcaster_id", self.me()), ("id", id.to_string())], None).await?;
        Ok(())
    }

    pub async fn schedule(&self) -> HelixResult<Vec<Value>> {
        match self.request(Method::GET, "schedule", &[("broadcaster_id", self.me()), ("first", "25".into())], None).await {
            Ok(data) => Ok(data["data"]["segments"].as_array().cloned().unwrap_or_default()),
            Err(e) if e.status == 404 => Ok(Vec::new()),
            Err(e) => Err(e),
        }
    }

    pub async fn create_segment(&self, body: Value) -> HelixResult<()> {
        self.request(Method::POST, "schedule/segment", &[("broadcaster_id", self.me())], Some(body)).await.map(|_| ())
    }

    pub async fn update_segment(&self, id: &str, body: Value) -> HelixResult<()> {
        self.request(Method::PATCH, "schedule/segment", &[("broadcaster_id", self.me()), ("id", id.to_string())], Some(body)).await.map(|_| ())
    }

    pub async fn delete_segment(&self, id: &str) -> HelixResult<()> {
        self.request(Method::DELETE, "schedule/segment", &[("broadcaster_id", self.me()), ("id", id.to_string())], None).await.map(|_| ())
    }

    pub async fn search_categories(&self, query: &str) -> HelixResult<Vec<Value>> {
        let data = self.request(Method::GET, "search/categories", &[("query", query.to_string()), ("first", "10".into())], None).await?;
        Ok(data["data"].as_array().cloned().unwrap_or_default())
    }

    pub async fn steamgriddb_image(&self, api_key: &str, game: &str) -> Option<String> {
        let get = |url: String| async move {
            self.http.get(url).bearer_auth(api_key).send().await.ok()?.json::<Value>().await.ok()
        };
        let search = get(format!("https://www.steamgriddb.com/api/v2/search/autocomplete/{}", urlencoding::encode(game))).await?;
        let id = search["data"][0]["id"].as_i64()?;
        let grids = get(format!("https://www.steamgriddb.com/api/v2/grids/game/{id}?styles=alternate,material,white_logo,blur")).await?;
        grids["data"].as_array()?.iter()
            .max_by_key(|g| g["width"].as_i64().unwrap_or(0) * g["height"].as_i64().unwrap_or(0))
            .and_then(|g| g["url"].as_str().map(str::to_string))
    }

    pub async fn app_token(&self, client_id: &str, client_secret: &str) -> Option<(String, i64)> {
        let response = self.http.post("https://id.twitch.tv/oauth2/token")
            .query(&[("client_id", client_id), ("client_secret", client_secret), ("grant_type", "client_credentials")])
            .send().await.ok()?;
        let data: Value = response.json().await.ok()?;
        Some((data["access_token"].as_str()?.to_string(), data["expires_in"].as_i64().unwrap_or(3600)))
    }
}
