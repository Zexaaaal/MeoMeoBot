use super::CmdResult;
use crate::state::{err, AppState};
use serde_json::json;
use shared::{GiveawaySettings, GiveawayState};
use tauri::State;

#[tauri::command]
pub fn giveaway_state(state: State<'_, AppState>) -> GiveawayState {
    state.bot.giveaway_state()
}

#[tauri::command]
pub fn giveaway_save_settings(state: State<'_, AppState>, settings: GiveawaySettings) -> CmdResult<GiveawayState> {
    let command = settings.command.trim();
    let command = if command.is_empty() { "!giveaway".to_string() } else { shared::ChatCommand::normalized_name(command) };
    state.store.merge("config", json!({
        "giveawayCommand": command,
        "giveawayStartMessage": settings.start_message,
        "giveawayStopMessage": settings.stop_message,
        "giveawayWinMessage": settings.win_message,
    })).map_err(err)?;
    Ok(state.bot.giveaway_state())
}

#[tauri::command]
pub fn giveaway_start(state: State<'_, AppState>) -> CmdResult<GiveawayState> {
    state.bot.giveaway_start().map_err(err)?;
    Ok(state.bot.giveaway_state())
}

#[tauri::command]
pub fn giveaway_stop(state: State<'_, AppState>) -> CmdResult<GiveawayState> {
    state.bot.giveaway_stop().map_err(err)?;
    Ok(state.bot.giveaway_state())
}

#[tauri::command]
pub fn giveaway_draw(state: State<'_, AppState>) -> CmdResult<GiveawayState> {
    state.bot.giveaway_draw().ok_or("Aucun participant à tirer au sort.")?;
    Ok(state.bot.giveaway_state())
}

#[tauri::command]
pub fn giveaway_clear(state: State<'_, AppState>) -> CmdResult<GiveawayState> {
    state.bot.giveaway_clear().map_err(err)?;
    Ok(state.bot.giveaway_state())
}
