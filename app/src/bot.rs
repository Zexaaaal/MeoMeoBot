use crate::alerts::{self, AlertQueue};
use crate::config::Store;
use crate::state::notify;
use crate::twitch::api::{strip_oauth, Credentials, Helix};
use crate::twitch::chat_mapper;
use crate::twitch::eventsub::{self, CHAT_SUBSCRIPTION, EVENT_TYPES};
use crate::widgets::{Hub, ServerId, TwitchAuth};
use rand::seq::SliceRandom;
use regex::Regex;
use serde_json::{json, Value};
use shared::{BotStatus, GiveawaySettings, GiveawayState, NoticeKind, SubscriptionStatus};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tauri::async_runtime::JoinHandle;

pub const REQUIRED_SCOPES: &[&str] = &[
    "user:read:chat",
    "user:write:chat",
    "channel:read:redemptions",
    "channel:manage:redemptions",
    "channel:read:subscriptions",
    "channel:read:hype_train",
    "moderator:read:followers",
    "moderator:manage:chat_messages",
    "moderator:manage:banned_users",
    "bits:read",
    "clips:edit",
    "channel:manage:schedule",
];

const TOKEN_VALIDATE_INTERVAL: Duration = Duration::from_secs(45 * 60);
const TOKEN_EXPIRY_WARNING_S: i64 = 7 * 24 * 60 * 60;
const DEFAULT_START: &str = "Giveaway ouvert ! Utilise !giveaway pour participer !";
const DEFAULT_STOP: &str = "Giveaway fermé ! Merci à tous les participants !";
const DEFAULT_WIN: &str = "Félicitations @{winner}, tu as gagné le giveaway !";
const MOD_COMMANDS: &[&str] = &["!rfsh", "!oon", "!ooff", "!naporaoult"];

#[derive(Default)]
struct BotState {
    connected: bool,
    channel: String,
    sent_ids: HashSet<String>,
    message_count: u32,
    auto_index: usize,
    clip_ready_at: Option<Instant>,
    banned: Option<Vec<Regex>>,
    hype_level: i64,
    pending_subs: HashMap<String, JoinHandle<()>>,
    subscriptions: Vec<SubscriptionStatus>,
    winner: Option<String>,
}

#[derive(Default)]
struct Tasks {
    eventsub: Option<JoinHandle<()>>,
    token_watch: Option<JoinHandle<()>>,
}

pub struct Bot {
    app: AppHandle,
    pub store: Arc<Store>,
    pub hub: Arc<Hub>,
    pub helix: Helix,
    pub alerts: Arc<AlertQueue>,
    state: Mutex<BotState>,
    tasks: Mutex<Tasks>,
}

fn link_regex() -> &'static Regex {
    static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)(https?://\S+|www\.\S+|[a-z0-9-]+\.(com|org|net|fr|be|ch|ca|eu|tv|gg|me|io|co|info|biz)\b)").unwrap())
}

pub fn banned_word_regex(word: &str) -> Option<Regex> {
    Regex::new(&format!(r"(?iu)(^|[^\p{{L}}\p{{Nd}}]){}(?:s|x)?([^\p{{L}}\p{{Nd}}]|$)", regex::escape(word))).ok()
}

fn str_of(value: &Value) -> String {
    value.as_str().unwrap_or_default().to_string()
}

impl Bot {
    pub fn new(app: AppHandle, store: Arc<Store>, hub: Arc<Hub>) -> Arc<Self> {
        let alerts = AlertQueue::new(hub.clone());
        let bot = Arc::new(Bot {
            app,
            store,
            hub,
            helix: Helix::new(reqwest::Client::new()),
            alerts,
            state: Mutex::new(BotState::default()),
            tasks: Mutex::new(Tasks::default()),
        });
        bot.publish_last_events();
        bot
    }

    pub fn status(&self) -> BotStatus {
        let state = self.state.lock().unwrap();
        BotStatus { connected: state.connected, channel: state.channel.clone() }
    }

    pub fn set_connected(&self, connected: bool) {
        let status = {
            let mut state = self.state.lock().unwrap();
            if state.connected == connected {
                return;
            }
            state.connected = connected;
            BotStatus { connected, channel: state.channel.clone() }
        };
        let _ = self.app.emit(shared::events::BOT_STATUS, status);
    }

    pub fn subscriptions(&self) -> Vec<SubscriptionStatus> {
        self.state.lock().unwrap().subscriptions.clone()
    }

    pub fn disconnect(&self) {
        let mut tasks = self.tasks.lock().unwrap();
        for task in [tasks.eventsub.take(), tasks.token_watch.take()].into_iter().flatten() {
            task.abort();
        }
        drop(tasks);
        for (_, pending) in self.state.lock().unwrap().pending_subs.drain() {
            pending.abort();
        }
        self.set_connected(false);
    }

    pub async fn connect(self: &Arc<Self>) -> Result<(), String> {
        self.disconnect();
        let config = self.store.config();
        let channel = str_of(&config["channel"]);
        let token = strip_oauth(config["token"].as_str().unwrap_or_default());
        if channel.is_empty() || token.is_empty() {
            return Err("Renseigne la chaîne et autorise MeoMeoBot avec Twitch.".into());
        }
        self.state.lock().unwrap().channel = channel;

        let Some(validation) = self.helix.validate(&token).await else {
            notify(&self.app, NoticeKind::Error, "Token Twitch invalide ou expiré : clique sur « Autoriser avec Twitch ».");
            return Err("Token Twitch invalide".into());
        };
        self.helix.set_credentials(Credentials {
            token,
            client_id: validation.client_id.clone(),
            user_id: validation.user_id.clone(),
        });
        self.report_token(&validation.scopes, validation.expires_in);
        self.refresh_widget_auth().await;

        let mut tasks = self.tasks.lock().unwrap();
        tasks.eventsub = Some(tauri::async_runtime::spawn(eventsub::run(self.clone())));
        let bot = self.clone();
        tasks.token_watch = Some(tauri::async_runtime::spawn(async move {
            loop {
                tokio::time::sleep(TOKEN_VALIDATE_INTERVAL).await;
                bot.revalidate().await;
            }
        }));
        drop(tasks);

        let bot = self.clone();
        tauri::async_runtime::spawn(async move {
            bot.refresh_sub_count().await;
            bot.check_stream_status().await;
        });
        Ok(())
    }

    fn report_token(&self, scopes: &[String], expires_in: i64) {
        let missing: Vec<&str> = REQUIRED_SCOPES.iter().copied().filter(|s| !scopes.iter().any(|g| g == s)).collect();
        if !missing.is_empty() {
            notify(&self.app, NoticeKind::Error, format!("Permissions Twitch manquantes : {}", missing.join(", ")));
        }
        if expires_in > 0 && expires_in < TOKEN_EXPIRY_WARNING_S {
            let days = (expires_in as f64 / 86400.0).round().max(1.0);
            notify(&self.app, NoticeKind::Warning, format!("Le token Twitch expire dans {days} jour(s)."));
        }
    }

    async fn revalidate(&self) {
        let token = self.helix.credentials().token;
        match self.helix.validate(&token).await {
            Some(validation) => self.report_token(&validation.scopes, validation.expires_in),
            None => notify(&self.app, NoticeKind::Error, "Token Twitch expiré : reconnecte-toi dans Configuration."),
        }
    }

    async fn refresh_widget_auth(&self) {
        let config = self.store.config();
        let client_id = str_of(&config["twitchClientId"]);
        let app_token = str_of(&config["twitchAppToken"]);
        if !client_id.is_empty() && !app_token.is_empty() {
            self.hub.set_twitch_auth(TwitchAuth { client_id, app_token });
            return;
        }
        let env_id = std::env::var("TWITCH_CLIENT_ID").unwrap_or(client_id);
        if let Ok(secret) = std::env::var("TWITCH_CLIENT_SECRET") {
            if let Some((token, _)) = self.helix.app_token(&env_id, &secret).await {
                self.hub.set_twitch_auth(TwitchAuth { client_id: env_id, app_token: token });
            }
        }
    }

    fn widget_api_auth(&self) -> Value {
        let auth = self.hub.twitch_auth();
        json!({ "clientId": auth.client_id, "token": if auth.app_token.is_empty() { Value::Null } else { json!(auth.app_token) } })
    }

    pub async fn subscribe_all(self: &Arc<Self>, session_id: &str) {
        let user_id = self.helix.credentials().user_id;
        let mut results = Vec::new();
        for event in EVENT_TYPES {
            let outcome = self.helix.subscribe_event(event.kind, event.version(), event.condition(&user_id), session_id).await;
            results.push(SubscriptionStatus {
                kind: event.kind.to_string(),
                scope: event.scope.map(str::to_string),
                ok: outcome.is_ok(),
                error: outcome.err().map(|e| e.to_string()),
            });
        }
        let chat_ok = results.iter().any(|r| r.kind == CHAT_SUBSCRIPTION && r.ok);
        let failed: Vec<&SubscriptionStatus> = results.iter().filter(|r| !r.ok).collect();
        if !failed.is_empty() {
            let mut scopes: Vec<&str> = failed.iter().filter_map(|r| r.scope.as_deref()).collect();
            scopes.dedup();
            notify(&self.app, NoticeKind::Error, format!("{} événement(s) Twitch non souscrit(s). Permissions probables : {}", failed.len(), scopes.join(", ")));
        }
        self.state.lock().unwrap().subscriptions = results.clone();
        let _ = self.app.emit(shared::events::SUBSCRIPTIONS, results);
        self.set_connected(chat_ok);
    }

    pub fn mark_revoked(&self, kind: &str, status: &str) {
        let list = {
            let mut state = self.state.lock().unwrap();
            if let Some(entry) = state.subscriptions.iter_mut().find(|s| s.kind == kind) {
                entry.ok = false;
                entry.error = Some(status.to_string());
            }
            state.subscriptions.clone()
        };
        if kind == CHAT_SUBSCRIPTION {
            self.set_connected(false);
        }
        let _ = self.app.emit(shared::events::SUBSCRIPTIONS, list);
    }

    pub async fn say(self: &Arc<Self>, text: &str) {
        if text.trim().is_empty() {
            return;
        }
        match self.helix.send_chat(text).await {
            Ok(Some(id)) => {
                self.state.lock().unwrap().sent_ids.insert(id.clone());
                let bot = self.clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(30)).await;
                    bot.state.lock().unwrap().sent_ids.remove(&id);
                });
            }
            Ok(None) => {}
            Err(e) => log::warn!("Envoi du message échoué : {e}"),
        }
    }

    fn say_later(self: &Arc<Self>, text: String) {
        let bot = self.clone();
        tauri::async_runtime::spawn(async move { bot.say(&text).await });
    }

    pub fn invalidate_banned_words(&self) {
        self.state.lock().unwrap().banned = None;
    }

    fn contains_banned_word(&self, message: &str) -> bool {
        let mut state = self.state.lock().unwrap();
        if state.banned.is_none() {
            let words = self.store.get("config.bannedWords");
            state.banned = Some(words.as_array().into_iter().flatten().filter_map(|w| w.as_str()).filter_map(banned_word_regex).collect());
        }
        state.banned.as_ref().unwrap().iter().any(|re| re.is_match(message))
    }

    fn is_authorized(&self, event: &Value) -> bool {
        let channel = self.store.get_str("config.channel").to_lowercase();
        let login = event["chatter_user_login"].as_str().unwrap_or_default().to_lowercase();
        chat_mapper::has_badge(event, "broadcaster") || chat_mapper::has_badge(event, "moderator") || (!channel.is_empty() && login == channel)
    }

    pub async fn on_notification(self: &Arc<Self>, kind: &str, event: Value) {
        let user_name = str_of(&event["user_name"]);
        match kind {
            "channel.chat.message" => self.handle_chat(event).await,
            "channel.chat.notification" => {
                if chat_mapper::should_forward_notice(event["notice_type"].as_str().unwrap_or_default()) {
                    let mut message = chat_mapper::notice_to_widget_message(&event);
                    message["apiAuth"] = self.widget_api_auth();
                    self.hub.broadcast(ServerId::Chat, &message);
                }
            }
            "channel.chat.clear" => self.hub.broadcast(ServerId::Chat, &json!({ "type": "clear-chat" })),
            "channel.chat.clear_user_messages" => self.hub.broadcast(ServerId::Chat, &json!({ "type": "clear-user", "username": event["target_user_login"] })),
            "channel.chat.message_delete" => self.hub.broadcast(ServerId::Chat, &json!({ "type": "delete-message", "messageId": event["message_id"] })),
            "channel.channel_points_custom_reward_redemption.add" => {
                self.redeem(&str_of(&event["reward"]["id"]), &user_name);
            }
            "channel.channel_points_automatic_reward_redemption.add" => {
                self.redeem(&format!("auto:{}", str_of(&event["reward"]["type"])), &user_name);
            }
            "channel.subscribe" => {
                if event["is_gift"] != json!(true) {
                    let user_id = str_of(&event["user_id"]);
                    let bot = self.clone();
                    let handle = tauri::async_runtime::spawn(async move {
                        tokio::time::sleep(Duration::from_secs(2)).await;
                        bot.set_last_event("sub", json!({ "name": user_name }));
                        bot.count_sub(false, 1);
                        bot.trigger_alert("sub", json!({ "username": user_name }));
                        bot.state.lock().unwrap().pending_subs.remove(&user_id);
                    });
                    if let Some(previous) = self.state.lock().unwrap().pending_subs.insert(str_of(&event["user_id"]), handle) {
                        previous.abort();
                    }
                }
            }
            "channel.subscription.message" => {
                if let Some(pending) = self.state.lock().unwrap().pending_subs.remove(&str_of(&event["user_id"])) {
                    pending.abort();
                }
                self.count_sub(false, 1);
                self.set_last_event("sub", json!({ "name": user_name }));
                self.trigger_alert("resub", json!({ "username": user_name, "months": event["cumulative_months"], "message": event["message"]["text"] }));
            }
            "channel.subscription.gift" => {
                let amount = event["total"].as_i64().unwrap_or(1);
                self.count_sub(true, amount);
                let name = if event["is_anonymous"] == json!(true) { "Anonyme".to_string() } else { user_name };
                self.trigger_alert("subgift", json!({ "username": name, "amount": amount }));
            }
            "channel.cheer" => {
                let name = if event["is_anonymous"] == json!(true) { "Anonyme".to_string() } else { user_name };
                self.trigger_alert("cheer", json!({ "username": name, "amount": event["bits"], "message": event["message"] }));
            }
            "channel.bits.use" => {
                if event["type"].as_str().map(|t| t != "cheer").unwrap_or(false) {
                    self.trigger_alert("cheer", json!({ "username": user_name, "amount": event["bits"] }));
                }
            }
            "channel.raid" => self.trigger_alert("raid", json!({ "username": event["from_broadcaster_user_name"], "viewers": event["viewers"] })),
            "channel.hype_train.begin" | "channel.hype_train.progress" => {
                let level = event["level"].as_i64().unwrap_or(1);
                let fire = {
                    let mut state = self.state.lock().unwrap();
                    let fire = kind.ends_with("begin") || level > state.hype_level;
                    state.hype_level = level;
                    fire
                };
                if fire {
                    self.trigger_alert("hypetrain", json!({ "username": "Twitch", "amount": level }));
                }
            }
            "channel.hype_train.end" => self.state.lock().unwrap().hype_level = 0,
            "channel.follow" => {
                self.set_last_event("follow", json!({ "name": user_name }));
                self.trigger_alert("follow", json!({ "username": user_name }));
                self.broadcast_goal_counts().await;
            }
            "stream.online" => self.sync_daily_baseline(&str_of(&event["started_at"])).await,
            "stream.offline" => self.reset_daily(),
            _ => {}
        }
    }

    async fn handle_chat(self: &Arc<Self>, event: Value) {
        let message_id = str_of(&event["message_id"]);
        if self.state.lock().unwrap().sent_ids.remove(&message_id) {
            return;
        }
        let text = str_of(&event["message"]["text"]);

        if self.contains_banned_word(&text) {
            if let Err(e) = self.helix.delete_message(&message_id).await {
                log::warn!("Suppression du message banni échouée : {e}");
            }
            return;
        }

        let config = self.store.config();
        let auto_messages: Vec<(String, u32)> = config["autoMessages"].as_array().into_iter().flatten()
            .filter_map(|m| Some((m["message"].as_str()?.to_string(), m["interval"].as_u64().unwrap_or(40) as u32)))
            .filter(|(m, _)| !m.is_empty())
            .collect();
        let is_command = text.starts_with('!');
        let is_auto = auto_messages.iter().any(|(m, _)| *m == text);

        if !is_command && !is_auto && !link_regex().is_match(&text) {
            let mut message = chat_mapper::to_widget_message(&event);
            message["apiAuth"] = self.widget_api_auth();
            self.hub.broadcast(ServerId::Chat, &message);
        }

        if !auto_messages.is_empty() {
            let due = {
                let mut state = self.state.lock().unwrap();
                state.message_count += 1;
                if state.auto_index >= auto_messages.len() {
                    state.auto_index = 0;
                }
                let (message, interval) = &auto_messages[state.auto_index];
                (state.message_count >= *interval).then(|| {
                    state.message_count = 0;
                    state.auto_index = (state.auto_index + 1) % auto_messages.len();
                    message.clone()
                })
            };
            if let Some(message) = due {
                self.say_later(message);
            }
        }

        if is_command {
            self.handle_command(&event, &text).await;
        }
    }

    async fn handle_command(self: &Arc<Self>, event: &Value, text: &str) {
        let command = text.split_whitespace().next().unwrap_or_default().to_lowercase();

        if MOD_COMMANDS.contains(&command.as_str()) {
            if !self.is_authorized(event) {
                return;
            }
            let _ = self.helix.delete_message(&str_of(&event["message_id"])).await;
            match command.as_str() {
                "!rfsh" => self.hub.refresh_all(),
                "!naporaoult" => self.hub.broadcast(ServerId::Chat, &json!({ "type": "naporaoult" })),
                visibility => self.hub.broadcast_all(&json!({ "type": "visibility", "visible": visibility == "!oon" }), Some(ServerId::Alerts)),
            }
            return;
        }

        if command == "!clip" {
            let ready = {
                let mut state = self.state.lock().unwrap();
                let ready = state.connected && state.clip_ready_at.map(|t| Instant::now() >= t).unwrap_or(true);
                if ready {
                    let cooldown = self.store.get("config.clipCooldown").as_u64().unwrap_or(60);
                    state.clip_ready_at = Some(Instant::now() + Duration::from_secs(cooldown));
                }
                ready
            };
            if ready {
                let reply = match self.helix.create_clip().await {
                    Ok(Some(id)) => format!("Clip créé ! https://clips.twitch.tv/{id}"),
                    Ok(None) => "Erreur : impossible de créer le clip.".to_string(),
                    Err(e) => format!("Erreur lors de la création du clip : {e}"),
                };
                self.say(&reply).await;
            }
            return;
        }

        let settings = self.giveaway_settings();
        if self.store.get("giveaway.isActive") == json!(true) && command == settings.command.to_lowercase() {
            let username = str_of(&event["chatter_user_login"]);
            let mut participants: Vec<String> = serde_json::from_value(self.store.get("giveaway.participants")).unwrap_or_default();
            if !participants.contains(&username) {
                participants.push(username);
                let _ = self.store.set("giveaway.participants", json!(participants));
                let _ = self.app.emit(shared::events::GIVEAWAY, self.giveaway_state());
            }
            return;
        }

        if let Some(response) = self.store.get("commands")[command.as_str()].as_str() {
            self.say(response).await;
        }
    }

    pub fn giveaway_settings(&self) -> GiveawaySettings {
        let config = self.store.config();
        let text = |key: &str, fallback: &str| config[key].as_str().map(str::to_string).unwrap_or_else(|| fallback.to_string());
        GiveawaySettings {
            command: text("giveawayCommand", "!giveaway"),
            start_message: text("giveawayStartMessage", DEFAULT_START),
            stop_message: text("giveawayStopMessage", DEFAULT_STOP),
            win_message: text("giveawayWinMessage", DEFAULT_WIN),
        }
    }

    pub fn giveaway_state(&self) -> GiveawayState {
        GiveawayState {
            active: self.store.get("giveaway.isActive") == json!(true),
            participants: serde_json::from_value(self.store.get("giveaway.participants")).unwrap_or_default(),
            winner: self.state.lock().unwrap().winner.clone(),
            settings: self.giveaway_settings(),
        }
    }

    pub fn giveaway_start(self: &Arc<Self>) -> anyhow::Result<()> {
        self.store.set("giveaway.isActive", json!(true))?;
        self.store.set("giveaway.participants", json!([]))?;
        self.state.lock().unwrap().winner = None;
        let message = self.giveaway_settings().start_message;
        if self.status().connected {
            self.say_later(message);
        }
        Ok(())
    }

    pub fn giveaway_stop(self: &Arc<Self>) -> anyhow::Result<()> {
        self.store.set("giveaway.isActive", json!(false))?;
        let message = self.giveaway_settings().stop_message;
        if self.status().connected {
            self.say_later(message);
        }
        Ok(())
    }

    pub fn giveaway_draw(self: &Arc<Self>) -> Option<String> {
        let participants: Vec<String> = serde_json::from_value(self.store.get("giveaway.participants")).unwrap_or_default();
        let winner = participants.choose(&mut rand::thread_rng())?.clone();
        self.state.lock().unwrap().winner = Some(winner.clone());
        let template = self.giveaway_settings().win_message;
        if self.status().connected && !template.is_empty() {
            let bot = self.clone();
            let message = template.replace("{winner}", &winner);
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(Duration::from_secs(3)).await;
                bot.say(&message).await;
            });
        }
        Some(winner)
    }

    pub fn giveaway_clear(&self) -> anyhow::Result<()> {
        self.store.set("giveaway.participants", json!([]))?;
        self.state.lock().unwrap().winner = None;
        Ok(())
    }

    pub fn trigger_alert(&self, kind: &str, data: Value) {
        if let Some(alert) = alerts::build(&self.store, kind, &data) {
            self.alerts.push(alert);
        }
    }

    pub fn redeem(self: &Arc<Self>, reward_id: &str, user: &str) {
        log::info!("Récompense {reward_id} utilisée par {user}");
        let config = self.store.config();
        if let Some(sound) = config["rewardSounds"][reward_id].as_str().filter(|s| !s.is_empty()) {
            let global = config["pointsGlobalVolume"].as_f64().unwrap_or(0.5);
            let own = config["rewardVolumes"][reward_id].as_f64().unwrap_or(1.0);
            self.alerts.push(json!({
                "type": "reward-redemption",
                "username": user,
                "text": null,
                "image": null,
                "audio": sound,
                "volume": (global * own).clamp(0.0, 2.0),
                "isVod": config["rewardVodFlags"][reward_id] == json!(true)
            }));
        }
        match config["rewardFunctions"][reward_id].as_str() {
            Some("emote_rain") => {
                let bot = self.clone();
                tauri::async_runtime::spawn(async move {
                    let emotes = bot.helix.channel_emotes().await;
                    bot.hub.broadcast(ServerId::Chat, &json!({ "type": "emote-rain", "emotes": emotes }));
                });
            }
            Some("bat_rain") => self.hub.broadcast(ServerId::Chat, &json!({ "type": "bat-rain" })),
            _ => {}
        }
    }

    pub fn set_last_event(&self, kind: &str, data: Value) {
        let _ = self.store.set(&format!("lastEvents.{kind}"), data.clone());
        self.hub.broadcast(ServerId::Subgoals, &json!({ "type": format!("last-{kind}"), "data": data }));
        self.publish_last_events();
    }

    fn publish_last_events(&self) {
        let events = self.store.get("lastEvents");
        let messages = ["sub", "follow", "donation"].iter()
            .filter(|k| events[**k].is_object())
            .map(|k| json!({ "type": format!("last-{k}"), "data": events[*k] }))
            .collect();
        self.hub.set_connect_extras(ServerId::Subgoals, messages);
    }

    fn sub_count(&self) -> i64 {
        self.store.get("widgets.subgoals.currentCount").as_i64().unwrap_or(0)
    }

    fn publish_sub_count(&self, count: i64) {
        let _ = self.store.merge("widgets.subgoals", json!({ "currentCount": count }));
        let config = self.store.widget("subgoals");
        self.hub.broadcast_config("subgoals", &config);
        self.hub.broadcast(ServerId::Subgoals, &json!({ "type": "sub-update", "count": count }));
    }

    pub async fn refresh_sub_count(&self) {
        if let Some(count) = self.helix.sub_count().await {
            self.publish_sub_count(count);
        }
        self.broadcast_goal_counts().await;
    }

    pub fn count_sub(self: &Arc<Self>, gift: bool, amount: i64) {
        self.publish_sub_count(self.sub_count() + amount);
        let subgoals = self.store.widget("subgoals");
        let counts_daily = if gift { subgoals["countSubGifts"] == json!(true) } else { subgoals["countRegularSubs"] != json!(false) };
        if counts_daily {
            let current = subgoals["dailyCurrentCount"].as_i64().unwrap_or(0) + amount;
            let mut goal = subgoals["dailyGoalCount"].as_i64().unwrap_or(10).max(1);
            while current >= goal {
                goal += 5;
            }
            let base = subgoals["baseDailyGoalCount"].as_i64().unwrap_or(10).max(1);
            let _ = self.store.merge("widgets.subgoals", json!({ "dailyCurrentCount": current, "dailyGoalCount": goal, "baseDailyGoalCount": base }));
            self.hub.broadcast_config("subgoals", &self.store.widget("subgoals"));
        }
        let bot = self.clone();
        tauri::async_runtime::spawn(async move { bot.broadcast_goal_counts().await });
    }

    pub fn reset_daily(&self) {
        let base = self.store.get("widgets.subgoals.baseDailyGoalCount").as_i64().unwrap_or(10);
        let _ = self.store.merge("widgets.subgoals", json!({ "dailyCurrentCount": 0, "dailyGoalCount": base, "lastStreamStart": null, "streamStartSubTotal": null }));
        self.hub.broadcast_config("subgoals", &self.store.widget("subgoals"));
    }

    async fn sync_daily_baseline(&self, started_at: &str) {
        let Some(total) = self.helix.sub_count().await else { return };
        let subgoals = self.store.widget("subgoals");
        let baseline = subgoals["streamStartSubTotal"].as_i64();
        let patch = match baseline {
            Some(baseline) if subgoals["lastStreamStart"].as_str() == Some(started_at) => {
                json!({ "lastStreamStart": started_at, "dailyCurrentCount": (total - baseline).max(0) })
            }
            _ => {
                let goal = subgoals["baseDailyGoalCount"].as_i64().or(subgoals["dailyGoalCount"].as_i64()).unwrap_or(10);
                json!({ "lastStreamStart": started_at, "streamStartSubTotal": total, "dailyCurrentCount": 0, "dailyGoalCount": goal })
            }
        };
        let _ = self.store.merge("widgets.subgoals", patch);
        self.hub.broadcast_config("subgoals", &self.store.widget("subgoals"));
    }

    async fn check_stream_status(&self) {
        match self.helix.stream_started_at().await {
            Some(started_at) => self.sync_daily_baseline(&started_at).await,
            None => {
                if !self.store.get("widgets.subgoals.lastStreamStart").is_null() {
                    self.reset_daily();
                }
            }
        }
    }

    pub async fn broadcast_goal_counts(&self) {
        let followers = if self.helix.is_ready() { self.helix.follower_count().await } else { 0 };
        self.hub.broadcast(ServerId::Goals, &json!({ "type": "goals-count-update", "counts": { "subs": self.sub_count(), "followers": followers } }));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn banned_words_match_whole_words_and_plurals() {
        let re = banned_word_regex("chat").unwrap();
        assert!(re.is_match("un chat noir"));
        assert!(re.is_match("des CHATS"));
        assert!(re.is_match("chat!"));
        assert!(!re.is_match("chaton"));
        assert!(!re.is_match("achat"));
    }

    #[test]
    fn special_characters_are_escaped() {
        let re = banned_word_regex("c++").unwrap();
        assert!(re.is_match("j'aime le c++ !"));
        assert!(!re.is_match("ccc"));
    }

    #[test]
    fn links_are_detected() {
        assert!(link_regex().is_match("va sur https://example.com"));
        assert!(link_regex().is_match("site.fr est cool"));
        assert!(!link_regex().is_match("bonjour à tous"));
    }
}
