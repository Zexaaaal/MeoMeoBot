use super::CmdResult;
use crate::state::{err, AppState};
use crate::widgets::ServerId;
use serde_json::json;
use shared::{IntegrationSettings, ObsStatus};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub fn integration_settings(state: State<'_, AppState>) -> IntegrationSettings {
    let config = state.store.config();
    let text = |key: &str| config[key].as_str().unwrap_or_default().to_string();
    IntegrationSettings {
        spotify_client_id: text("spotifyClientId"),
        spotify_client_secret: text("spotifyClientSecret"),
        spotify_linked: !text("spotifyRefreshToken").is_empty(),
        streamlabs_token: text("streamlabsSocketToken"),
        steamgriddb_key: text("steamGridDbApiKey"),
        discord_webhook: text("discordWebhookUrl"),
        obs_enabled: config["obsWebsocketEnabled"] != json!(false),
        obs_url: config["obsWebsocketUrl"].as_str().filter(|u| !u.is_empty()).unwrap_or("ws://127.0.0.1:4455").to_string(),
        obs_password: text("obsWebsocketPassword"),
    }
}

#[tauri::command]
pub async fn integration_settings_save(state: State<'_, AppState>, settings: IntegrationSettings) -> CmdResult<()> {
    let previous = integration_settings(state.clone());
    state.store.merge("config", json!({
        "spotifyClientId": settings.spotify_client_id.trim(),
        "spotifyClientSecret": settings.spotify_client_secret.trim(),
        "streamlabsSocketToken": settings.streamlabs_token.trim(),
        "steamGridDbApiKey": settings.steamgriddb_key.trim(),
        "discordWebhookUrl": settings.discord_webhook.trim(),
        "obsWebsocketEnabled": settings.obs_enabled,
        "obsWebsocketUrl": settings.obs_url.trim(),
        "obsWebsocketPassword": settings.obs_password,
    })).map_err(err)?;

    if previous.obs_enabled != settings.obs_enabled || previous.obs_url != settings.obs_url.trim() || previous.obs_password != settings.obs_password {
        state.obs.restart();
    }
    if previous.streamlabs_token != settings.streamlabs_token.trim() {
        state.streamlabs.restart().await;
    }
    Ok(())
}

#[tauri::command]
pub fn obs_status(state: State<'_, AppState>) -> ObsStatus {
    ObsStatus { enabled: state.obs.enabled(), connected: state.obs.is_connected() }
}

#[tauri::command]
pub async fn obs_refresh(state: State<'_, AppState>) -> CmdResult<String> {
    let (refreshed, repaired) = state.obs.refresh_sources().await.map_err(err)?;
    Ok(if repaired > 0 {
        format!("{refreshed} source(s) OBS rafraîchie(s), {repaired} URL corrigée(s)")
    } else {
        format!("{refreshed} source(s) OBS rafraîchie(s)")
    })
}

fn spotify_port(state: &AppState) -> u16 {
    match state.hub.port(ServerId::Spotify) {
        0 => ServerId::Spotify.default_port(),
        port => port,
    }
}

#[tauri::command]
pub fn spotify_redirect_uri(state: State<'_, AppState>) -> String {
    crate::spotify::redirect_uri(spotify_port(&state))
}

#[tauri::command]
pub fn spotify_authorize(app: AppHandle, state: State<'_, AppState>) -> CmdResult<()> {
    crate::spotify::authorize_url(&state.store, spotify_port(&state))?;
    app.opener().open_url(format!("http://127.0.0.1:{}/auth/spotify/login", spotify_port(&state)), None::<&str>).map_err(err)
}
