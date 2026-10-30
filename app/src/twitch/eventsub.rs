use crate::bot::Bot;
use anyhow::{anyhow, bail};
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_URL: &str = "wss://eventsub.wss.twitch.tv/ws";
const KEEPALIVE_GRACE: Duration = Duration::from_secs(5);
const MAX_BACKOFF_MS: u64 = 60_000;
pub const CHAT_SUBSCRIPTION: &str = "channel.chat.message";

#[derive(Clone, Copy)]
enum Condition {
    Broadcaster,
    ToBroadcaster,
    Moderator,
    Chat,
}

pub struct EventType {
    pub kind: &'static str,
    version: &'static str,
    pub scope: Option<&'static str>,
    condition: Condition,
}

const fn ev(kind: &'static str, version: &'static str, scope: Option<&'static str>, condition: Condition) -> EventType {
    EventType { kind, version, scope, condition }
}

pub const EVENT_TYPES: &[EventType] = &[
    ev("channel.channel_points_custom_reward_redemption.add", "1", Some("channel:read:redemptions"), Condition::Broadcaster),
    ev("channel.channel_points_automatic_reward_redemption.add", "2", Some("channel:read:redemptions"), Condition::Broadcaster),
    ev("channel.subscribe", "1", Some("channel:read:subscriptions"), Condition::Broadcaster),
    ev("channel.subscription.gift", "1", Some("channel:read:subscriptions"), Condition::Broadcaster),
    ev("channel.subscription.message", "1", Some("channel:read:subscriptions"), Condition::Broadcaster),
    ev("channel.cheer", "1", Some("bits:read"), Condition::Broadcaster),
    ev("channel.bits.use", "1", Some("bits:read"), Condition::Broadcaster),
    ev("channel.raid", "1", None, Condition::ToBroadcaster),
    ev("channel.hype_train.begin", "2", Some("channel:read:hype_train"), Condition::Broadcaster),
    ev("channel.hype_train.progress", "2", Some("channel:read:hype_train"), Condition::Broadcaster),
    ev("channel.hype_train.end", "2", Some("channel:read:hype_train"), Condition::Broadcaster),
    ev("channel.follow", "2", Some("moderator:read:followers"), Condition::Moderator),
    ev("stream.online", "1", None, Condition::Broadcaster),
    ev("stream.offline", "1", None, Condition::Broadcaster),
    ev("channel.chat.message", "1", Some("user:read:chat"), Condition::Chat),
    ev("channel.chat.clear", "1", Some("user:read:chat"), Condition::Chat),
    ev("channel.chat.clear_user_messages", "1", Some("user:read:chat"), Condition::Chat),
    ev("channel.chat.message_delete", "1", Some("user:read:chat"), Condition::Chat),
    ev("channel.chat.notification", "1", Some("user:read:chat"), Condition::Chat),
];

impl EventType {
    pub fn version(&self) -> &'static str {
        self.version
    }

    pub fn condition(&self, user_id: &str) -> Value {
        match self.condition {
            Condition::Broadcaster => json!({ "broadcaster_user_id": user_id }),
            Condition::ToBroadcaster => json!({ "to_broadcaster_user_id": user_id }),
            Condition::Moderator => json!({ "broadcaster_user_id": user_id, "moderator_user_id": user_id }),
            Condition::Chat => json!({ "broadcaster_user_id": user_id, "user_id": user_id }),
        }
    }
}

pub fn backoff_ms(attempt: u32) -> u64 {
    (1000u64.saturating_mul(1 << attempt.min(16))).min(MAX_BACKOFF_MS)
}

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn next_json(ws: &mut Socket, wait: Duration) -> anyhow::Result<Value> {
    loop {
        let message = timeout(wait, ws.next()).await.map_err(|_| anyhow!("aucun keepalive reçu"))?;
        match message {
            Some(Ok(Message::Text(text))) => return Ok(serde_json::from_str(&text)?),
            Some(Ok(Message::Close(_))) | None => bail!("connexion fermée"),
            Some(Err(e)) => return Err(e.into()),
            _ => continue,
        }
    }
}

fn welcome(message: &Value) -> Option<(String, Duration)> {
    if message["metadata"]["message_type"] != "session_welcome" {
        return None;
    }
    let session = &message["payload"]["session"];
    let keepalive = session["keepalive_timeout_seconds"].as_u64().unwrap_or(10);
    Some((session["id"].as_str()?.to_string(), Duration::from_secs(keepalive)))
}

async fn session(bot: &Arc<Bot>, attempts: &mut u32) -> anyhow::Result<()> {
    let (mut ws, _) = tokio_tungstenite::connect_async(DEFAULT_URL).await?;
    let mut keepalive = Duration::from_secs(10);

    loop {
        let message = next_json(&mut ws, keepalive + KEEPALIVE_GRACE).await?;
        let payload = &message["payload"];
        match message["metadata"]["message_type"].as_str().unwrap_or_default() {
            "session_welcome" => {
                if let Some((session_id, timeout)) = welcome(&message) {
                    keepalive = timeout;
                    *attempts = 0;
                    log::info!("EventSub : session {session_id}");
                    let bot = bot.clone();
                    tauri::async_runtime::spawn(async move { bot.subscribe_all(&session_id).await });
                }
            }
            "notification" => {
                let kind = payload["subscription"]["type"].as_str().unwrap_or_default().to_string();
                let event = payload["event"].clone();
                let bot = bot.clone();
                tauri::async_runtime::spawn(async move { bot.on_notification(&kind, event).await });
            }
            "session_reconnect" => {
                let url = payload["session"]["reconnect_url"].as_str().ok_or_else(|| anyhow!("reconnect_url manquante"))?;
                log::info!("EventSub : reconnexion demandée");
                let (mut replacement, _) = tokio_tungstenite::connect_async(url).await?;
                let first = next_json(&mut replacement, Duration::from_secs(10)).await?;
                if let Some((_, timeout)) = welcome(&first) {
                    keepalive = timeout;
                }
                ws = replacement;
            }
            "revocation" => {
                let subscription = &payload["subscription"];
                bot.mark_revoked(subscription["type"].as_str().unwrap_or_default(), subscription["status"].as_str().unwrap_or("revoked"));
            }
            _ => {}
        }
    }
}

pub async fn run(bot: Arc<Bot>) {
    let mut attempts = 0u32;
    loop {
        if let Err(e) = session(&bot, &mut attempts).await {
            log::warn!("EventSub déconnecté : {e}");
        }
        bot.set_connected(false);
        let delay = backoff_ms(attempts);
        attempts += 1;
        tokio::time::sleep(Duration::from_millis(delay)).await;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn backoff_doubles_and_caps() {
        assert_eq!(backoff_ms(0), 1000);
        assert_eq!(backoff_ms(1), 2000);
        assert_eq!(backoff_ms(10), MAX_BACKOFF_MS);
        assert_eq!(backoff_ms(40), MAX_BACKOFF_MS);
    }

    #[test]
    fn welcome_reads_session_and_keepalive() {
        let message = json!({ "metadata": { "message_type": "session_welcome" }, "payload": { "session": { "id": "s1", "keepalive_timeout_seconds": 30 } } });
        assert_eq!(welcome(&message), Some(("s1".to_string(), Duration::from_secs(30))));
        assert_eq!(welcome(&json!({ "metadata": { "message_type": "notification" } })), None);
    }

    #[test]
    fn conditions_match_the_event_kind() {
        let follow = EVENT_TYPES.iter().find(|e| e.kind == "channel.follow").unwrap();
        assert_eq!(follow.condition("42"), json!({ "broadcaster_user_id": "42", "moderator_user_id": "42" }));
        let raid = EVENT_TYPES.iter().find(|e| e.kind == "channel.raid").unwrap();
        assert_eq!(raid.condition("42"), json!({ "to_broadcaster_user_id": "42" }));
    }
}
