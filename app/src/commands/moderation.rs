use super::CmdResult;
use crate::state::{err, AppState};
use serde_json::json;
use shared::{AutoMessage, ModerationState};
use tauri::State;

#[tauri::command]
pub fn moderation_state(state: State<'_, AppState>) -> ModerationState {
    let config = state.store.config();
    ModerationState {
        banned_words: serde_json::from_value(config["bannedWords"].clone()).unwrap_or_default(),
        auto_messages: serde_json::from_value(config["autoMessages"].clone()).unwrap_or_default(),
        clip_cooldown: config["clipCooldown"].as_u64().unwrap_or(60) as u32,
    }
}

fn save_words(state: &State<'_, AppState>, words: Vec<String>) -> CmdResult<ModerationState> {
    state.store.set("config.bannedWords", json!(words)).map_err(err)?;
    state.bot.invalidate_banned_words();
    Ok(moderation_state(state.clone()))
}

#[tauri::command]
pub fn banned_word_add(state: State<'_, AppState>, word: String) -> CmdResult<ModerationState> {
    let word = word.trim().to_string();
    if word.is_empty() {
        return Err("Le mot est vide.".into());
    }
    let mut words = moderation_state(state.clone()).banned_words;
    if !words.iter().any(|w| w.eq_ignore_ascii_case(&word)) {
        words.push(word);
    }
    save_words(&state, words)
}

#[tauri::command]
pub fn banned_word_remove(state: State<'_, AppState>, word: String) -> CmdResult<ModerationState> {
    let words = moderation_state(state.clone()).banned_words.into_iter().filter(|w| *w != word).collect();
    save_words(&state, words)
}

#[tauri::command]
pub fn banned_words_clear(state: State<'_, AppState>) -> CmdResult<ModerationState> {
    save_words(&state, Vec::new())
}

#[tauri::command]
pub fn auto_messages_save(state: State<'_, AppState>, messages: Vec<AutoMessage>) -> CmdResult<ModerationState> {
    let cleaned: Vec<AutoMessage> = messages.into_iter().map(|m| AutoMessage { message: m.message.trim().to_string(), interval: m.interval.max(1) }).collect();
    state.store.set("config.autoMessages", json!(cleaned)).map_err(err)?;
    Ok(moderation_state(state))
}

#[tauri::command]
pub fn clip_cooldown_save(state: State<'_, AppState>, seconds: u32) -> CmdResult<ModerationState> {
    state.store.set("config.clipCooldown", json!(seconds.max(10))).map_err(err)?;
    Ok(moderation_state(state))
}
