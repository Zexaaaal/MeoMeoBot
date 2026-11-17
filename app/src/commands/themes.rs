use super::CmdResult;
use crate::state::{err, AppState};
use crate::widgets::ServerId;
use serde_json::{json, Value};
use shared::ThemeEditorState;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub const THEMABLE: &[&str] = &["chat", "spotify", "subgoals", "subgoals-list", "goals", "roulette", "alerts", "emote-wall"];

fn check(widget: &str) -> CmdResult<()> {
    THEMABLE.contains(&widget).then_some(()).ok_or_else(|| format!("Widget inconnu : {widget}"))
}

fn preview_url(state: &AppState, widget: &str) -> String {
    let base = state.hub.url("127.0.0.1", widget);
    let goal = (widget == "goals").then(|| state.store.widget("goals")["goals"][0]["id"].as_str().map(|id| format!("&id={id}"))).flatten().unwrap_or_default();
    format!("{base}?mode=preview{goal}")
}

#[tauri::command]
pub fn theme_editor(state: State<'_, AppState>, widget: String) -> CmdResult<ThemeEditorState> {
    check(&widget)?;
    let config = state.store.widget(&widget);
    Ok(ThemeEditorState {
        themes: state.themes.list(&widget),
        current_theme: config["currentTheme"].as_str().unwrap_or_default().to_string(),
        css: config["customCSS"].as_str().unwrap_or_default().to_string(),
        preview_url: preview_url(&state, &widget),
    })
}

#[tauri::command]
pub fn theme_content(state: State<'_, AppState>, file: String) -> String {
    state.themes.content(&file)
}

#[tauri::command]
pub fn theme_apply(state: State<'_, AppState>, widget: String, theme: String, css: String) -> CmdResult<ThemeEditorState> {
    check(&widget)?;
    if !theme.is_empty() {
        state.themes.save(&theme, &css).map_err(err)?;
    }
    state.themes.apply(&state.store, &state.hub, &widget, &theme, &css);
    theme_editor(state, widget)
}

#[tauri::command]
pub fn theme_create(state: State<'_, AppState>, widget: String, name: String, css: String) -> CmdResult<ThemeEditorState> {
    check(&widget)?;
    let file = state.themes.create(&widget, &name, &css).map_err(err)?;
    state.themes.apply(&state.store, &state.hub, &widget, &file, &css);
    theme_editor(state, widget)
}

#[tauri::command]
pub fn theme_reset(state: State<'_, AppState>, widget: String, file: String) -> CmdResult<ThemeEditorState> {
    check(&widget)?;
    state.themes.reset(&file).map_err(err)?;
    if state.store.widget(&widget)["currentTheme"].as_str() == Some(file.as_str()) {
        let css = state.themes.content(&file);
        state.themes.apply(&state.store, &state.hub, &widget, &file, &css);
    }
    theme_editor(state, widget)
}

#[tauri::command]
pub fn theme_rename(state: State<'_, AppState>, widget: String, file: String, name: String) -> CmdResult<ThemeEditorState> {
    state.themes.rename(&file, &name).map_err(err)?;
    theme_editor(state, widget)
}

#[tauri::command]
pub fn theme_delete(state: State<'_, AppState>, widget: String, file: String) -> CmdResult<ThemeEditorState> {
    state.themes.delete(&file).map_err(err)?;
    if state.store.widget(&widget)["currentTheme"].as_str() == Some(file.as_str()) {
        let _ = state.store.merge(&format!("widgets.{widget}"), json!({ "currentTheme": "" }));
    }
    theme_editor(state, widget)
}

#[tauri::command]
pub async fn theme_import(app: AppHandle, state: State<'_, AppState>, widget: String) -> CmdResult<Option<String>> {
    check(&widget)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().add_filter("Thème CSS", &["css"]).pick_file(move |file| {
        let _ = tx.send(file);
    });
    let Some(path) = rx.await.map_err(err)?.and_then(|f| f.into_path().ok()) else { return Ok(None) };
    state.themes.import(&widget, &path).map(Some).map_err(err)
}

#[tauri::command]
pub fn widget_config(state: State<'_, AppState>, widget: String) -> Value {
    state.store.widget(&widget)
}

#[tauri::command]
pub async fn widget_config_save(state: State<'_, AppState>, widget: String, patch: Value) -> CmdResult<Value> {
    check(&widget)?;
    if !patch.is_object() {
        return Err("Configuration invalide".into());
    }
    state.store.merge(&format!("widgets.{widget}"), patch).map_err(err)?;
    let config = state.store.widget(&widget);
    state.hub.broadcast_config(&widget, &config);
    if widget == "goals" {
        state.bot.broadcast_goal_counts().await;
    }
    if widget == "subgoals" {
        state.hub.broadcast(ServerId::Subgoals, &json!({ "type": "sub-update", "count": config["currentCount"] }));
    }
    Ok(config)
}

#[tauri::command]
pub async fn sub_count(state: State<'_, AppState>) -> CmdResult<i64> {
    state.bot.helix.sub_count().await.ok_or_else(|| "Nombre de subs indisponible : connecte le bot à Twitch.".into())
}

#[tauri::command]
pub fn goal_url(state: State<'_, AppState>, id: String) -> String {
    format!("{}?id={}", state.hub.url("127.0.0.1", "goals"), urlencoding::encode(&id))
}
