use serde::{Deserialize, Serialize};

pub mod events {
    pub const BOT_STATUS: &str = "bot-status";
    pub const NOTIFICATION: &str = "notification";
    pub const WIDGET_URLS: &str = "widget-urls";
    pub const SUBSCRIPTIONS: &str = "eventsub-status";
    pub const GIVEAWAY: &str = "giveaway";
    pub const TWITCH_SETTINGS: &str = "twitch-settings";
    pub const INTEGRATIONS: &str = "integrations";
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NoticeKind {
    Success,
    Error,
    Info,
    Warning,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notice {
    pub kind: NoticeKind,
    pub message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct BotStatus {
    pub connected: bool,
    pub channel: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ChatCommand {
    pub name: String,
    pub response: String,
}

impl ChatCommand {
    pub fn normalized_name(raw: &str) -> String {
        let trimmed = raw.trim().to_lowercase();
        if trimmed.starts_with('!') {
            trimmed
        } else {
            format!("!{trimmed}")
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct WidgetUrl {
    pub key: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub version: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct TwitchSettings {
    pub channel: String,
    pub client_id: String,
    pub token: String,
    pub app_token: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SubscriptionStatus {
    pub kind: String,
    pub scope: Option<String>,
    pub ok: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GiveawaySettings {
    pub command: String,
    pub start_message: String,
    pub stop_message: String,
    pub win_message: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct GiveawayState {
    pub active: bool,
    pub participants: Vec<String>,
    pub winner: Option<String>,
    pub settings: GiveawaySettings,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct AutoMessage {
    pub message: String,
    pub interval: u32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ModerationState {
    pub banned_words: Vec<String>,
    pub auto_messages: Vec<AutoMessage>,
    pub clip_cooldown: u32,
}

pub const ALERT_TYPES: &[(&str, &str, &str)] = &[
    ("follow", "Follow", "{username} suit la chaîne !"),
    ("sub", "Sub", "{username} s'est abonné !"),
    ("subgift", "Sub offert", "{username} a offert {amount} sub{s} !"),
    ("resub", "Réabonnement", "{username} s'est réabonné pour {months} mois !"),
    ("donation", "Don", "{username} a donné {amount}"),
    ("cheer", "Bits", "{username} a envoyé {amount} bits !"),
    ("raid", "Raid", "Raid de {username} !"),
    ("hypetrain", "Hype Train", "Hype Train niveau {amount} !"),
];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AlertSettings {
    pub enabled: bool,
    pub text_template: String,
    pub image: String,
    pub audio: String,
    pub volume: f64,
    pub duration: u32,
    pub is_vod: bool,
}

impl Default for AlertSettings {
    fn default() -> Self {
        AlertSettings { enabled: true, text_template: String::new(), image: String::new(), audio: String::new(), volume: 0.5, duration: 5000, is_vod: false }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct CooldownSetting {
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default)]
    pub global_cooldown_seconds: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Reward {
    pub id: String,
    pub title: String,
    pub cost: u64,
    #[serde(default)]
    pub prompt: String,
    #[serde(default)]
    pub background_color: String,
    #[serde(default)]
    pub is_enabled: bool,
    #[serde(default)]
    pub is_user_input_required: bool,
    #[serde(default)]
    pub global_cooldown_setting: CooldownSetting,
    #[serde(default = "default_true")]
    pub is_manageable: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RewardDraft {
    pub title: String,
    pub cost: u64,
    pub prompt: String,
    pub background_color: String,
    pub is_user_input_required: bool,
    pub cooldown: u64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RewardFolder {
    pub id: String,
    pub name: String,
    #[serde(rename = "rewardIds", default)]
    pub reward_ids: Vec<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct RewardBinding {
    pub sound: String,
    pub volume: f64,
    pub vod: bool,
    pub function: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct PointsState {
    pub rewards: Vec<Reward>,
    pub bindings: std::collections::BTreeMap<String, RewardBinding>,
    pub folders: Vec<RewardFolder>,
    pub global_volume: f64,
    pub notice: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct WidgetSettings {
    pub chat_max_messages: u32,
    pub badge_prefs: std::collections::BTreeMap<String, bool>,
    pub daily_goal: u32,
    pub count_regular_subs: bool,
    pub count_gift_subs: bool,
    pub emote_min_size: u32,
    pub emote_max_size: u32,
    pub emote_spawn_interval: u32,
    pub emote_duration: u32,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn command_names_are_prefixed_and_lowercased() {
        assert_eq!(ChatCommand::normalized_name("Discord"), "!discord");
        assert_eq!(ChatCommand::normalized_name(" !Clip "), "!clip");
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct IntegrationSettings {
    pub spotify_client_id: String,
    pub spotify_client_secret: String,
    pub spotify_linked: bool,
    pub streamlabs_token: String,
    pub steamgriddb_key: String,
    pub discord_webhook: String,
    pub obs_enabled: bool,
    pub obs_url: String,
    pub obs_password: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ObsStatus {
    pub enabled: bool,
    pub connected: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ThemeInfo {
    pub id: String,
    pub name: String,
    pub builtin: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct ThemeEditorState {
    pub themes: Vec<ThemeInfo>,
    pub current_theme: String,
    pub css: String,
    pub preview_url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Category {
    pub id: String,
    pub name: String,
    pub box_art_url: String,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanningEvent {
    pub id: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub category: Category,
    pub title: String,
    pub image_url: String,
    pub use_miniature: bool,
    pub show_game_title: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PlanningState {
    pub title: String,
    pub role_id: String,
    pub webhook_message: String,
    pub compact: bool,
    pub start_sunday: bool,
    pub background: String,
    pub events: std::collections::BTreeMap<String, Vec<PlanningEvent>>,
    pub discord_messages: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CastDevice {
    pub name: String,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct CastVideo {
    pub name: String,
    pub path: String,
    pub thumbnail: Option<String>,
}
