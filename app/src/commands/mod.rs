pub mod alerts;
pub mod cast;
pub mod giveaway;
pub mod integrations;
pub mod planning;
pub mod themes;
pub mod moderation;
pub mod points;
pub mod twitch;
pub mod update;
pub mod widgets;

use crate::state::{err, AppState};
use crate::widgets::ServerId;
use serde_json::{json, Map, Value};
use shared::{AppInfo, BotStatus, ChatCommand, WidgetUrl};
use tauri::{AppHandle, State, Window};

pub type CmdResult<T> = Result<T, String>;

#[tauri::command]
pub fn app_info(app: AppHandle) -> AppInfo {
    AppInfo { version: app.package_info().version.to_string() }
}

#[tauri::command]
pub fn window_control(window: Window, action: String) -> CmdResult<()> {
    match action.as_str() {
        "minimize" => window.minimize().map_err(err),
        "maximize" => {
            if window.is_maximized().map_err(err)? { window.unmaximize() } else { window.maximize() }.map_err(err)
        }
        "close" => window.close().map_err(err),
        _ => Err(format!("action inconnue : {action}")),
    }
}

#[tauri::command]
pub fn bot_status(state: State<'_, AppState>) -> BotStatus {
    state.bot.status()
}

#[tauri::command]
pub fn commands_list(state: State<'_, AppState>) -> Vec<ChatCommand> {
    let mut list: Vec<ChatCommand> = state
        .store
        .get("commands")
        .as_object()
        .map(|map| {
            map.iter()
                .map(|(name, response)| ChatCommand { name: name.clone(), response: response.as_str().unwrap_or_default().to_string() })
                .collect()
        })
        .unwrap_or_default();
    list.sort_by(|a, b| a.name.cmp(&b.name));
    list
}

#[tauri::command]
pub fn command_save(state: State<'_, AppState>, command: ChatCommand, previous: Option<String>) -> CmdResult<Vec<ChatCommand>> {
    let name = ChatCommand::normalized_name(&command.name);
    let response = command.response.trim().to_string();
    if name.len() < 2 || response.is_empty() {
        return Err("La commande et la réponse sont obligatoires.".into());
    }
    let mut commands = state.store.get("commands").as_object().cloned().unwrap_or_else(Map::new);
    if let Some(previous) = previous.filter(|p| *p != name) {
        commands.remove(&previous);
    }
    commands.insert(name, json!(response));
    state.store.set("commands", Value::Object(commands)).map_err(err)?;
    Ok(commands_list(state))
}

#[tauri::command]
pub fn command_remove(state: State<'_, AppState>, name: String) -> CmdResult<Vec<ChatCommand>> {
    let mut commands = state.store.get("commands").as_object().cloned().unwrap_or_else(Map::new);
    commands.remove(&name);
    state.store.set("commands", Value::Object(commands)).map_err(err)?;
    Ok(commands_list(state))
}

const URL_KEYS: &[(&str, &str)] = &[
    ("chat", "chat"),
    ("dock", "dock"),
    ("emoteWall", "emote-wall"),
    ("spotify", "spotify"),
    ("subgoals", "subgoals"),
    ("subgoalsList", "subgoals-list"),
    ("dailySubs", "daily-subs"),
    ("lastSub", "last-sub"),
    ("lastFollow", "last-follow"),
    ("lastDonation", "last-donation"),
    ("roulette", "roulette"),
    ("goals", "goals"),
    ("alerts", "alerts"),
];

#[tauri::command]
pub fn widget_urls(state: State<'_, AppState>) -> Vec<WidgetUrl> {
    URL_KEYS
        .iter()
        .filter(|(_, widget)| ServerId::owner_of(widget).map(|id| state.hub.port(id) > 0).unwrap_or(false))
        .map(|(key, widget)| WidgetUrl { key: key.to_string(), url: state.hub.url("127.0.0.1", widget) })
        .collect()
}
