use super::CmdResult;
use crate::bot::REQUIRED_SCOPES;
use crate::state::{err, AppState};
use crate::widgets::ServerId;
use serde_json::json;
use shared::{SubscriptionStatus, TwitchSettings};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

fn redirect_uri(state: &AppState) -> String {
    let port = match state.hub.port(ServerId::Chat) {
        0 => ServerId::Chat.default_port(),
        port => port,
    };
    format!("http://localhost:{port}/twitch/callback")
}

#[tauri::command]
pub fn twitch_settings(state: State<'_, AppState>) -> TwitchSettings {
    let config = state.store.config();
    let text = |key: &str| config[key].as_str().unwrap_or_default().to_string();
    TwitchSettings { channel: text("channel"), client_id: text("twitchClientId"), token: text("token"), app_token: text("twitchAppToken") }
}

#[tauri::command]
pub async fn twitch_settings_save(state: State<'_, AppState>, settings: TwitchSettings) -> CmdResult<()> {
    let previous = twitch_settings(state.clone());
    let channel = settings.channel.trim().trim_start_matches('#').to_lowercase();
    state.store.merge("config", json!({
        "channel": channel,
        "twitchClientId": settings.client_id.trim(),
        "token": settings.token.trim(),
        "twitchAppToken": settings.app_token.trim(),
    })).map_err(err)?;

    let reconnect = previous.channel != channel || previous.token != settings.token.trim() || previous.app_token != settings.app_token.trim();
    if reconnect && !channel.is_empty() && !settings.token.trim().is_empty() {
        state.bot.connect().await?;
    }
    Ok(())
}

#[tauri::command]
pub fn twitch_redirect_uri(state: State<'_, AppState>) -> String {
    redirect_uri(&state)
}

#[tauri::command]
pub fn twitch_authorize(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    let client_id = state.store.get_str("config.twitchClientId");
    let client_id = if client_id.is_empty() { std::env::var("TWITCH_CLIENT_ID").unwrap_or_default() } else { client_id };
    if client_id.is_empty() {
        return Err("Renseigne le Client ID Twitch avant d'autoriser.".into());
    }
    let url = format!(
        "https://id.twitch.tv/oauth2/authorize?response_type=token&client_id={}&redirect_uri={}&scope={}&force_verify=true",
        urlencoding::encode(&client_id),
        urlencoding::encode(&redirect_uri(&state)),
        urlencoding::encode(&REQUIRED_SCOPES.join(" "))
    );
    app.opener().open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
pub async fn bot_connect(state: State<'_, AppState>) -> CmdResult<()> {
    state.bot.connect().await
}

#[tauri::command]
pub fn bot_disconnect(state: State<'_, AppState>) {
    state.bot.disconnect();
}

#[tauri::command]
pub fn bot_subscriptions(state: State<'_, AppState>) -> Vec<SubscriptionStatus> {
    state.bot.subscriptions()
}
