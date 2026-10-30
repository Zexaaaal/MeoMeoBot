use super::CmdResult;
use crate::alerts::test_payload;
use crate::state::{err, AppState};
use serde_json::json;
use shared::{AlertSettings, ALERT_TYPES};
use std::collections::BTreeMap;
use tauri::State;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn alerts_settings(state: State<'_, AppState>) -> BTreeMap<String, AlertSettings> {
    let config = state.store.widget("alerts");
    ALERT_TYPES.iter().map(|(kind, _, default_text)| {
        let mut settings: AlertSettings = serde_json::from_value(config[*kind].clone()).unwrap_or_default();
        if settings.text_template.is_empty() {
            settings.text_template = default_text.to_string();
        }
        (kind.to_string(), settings)
    }).collect()
}

#[tauri::command]
pub fn alerts_save(state: State<'_, AppState>, settings: BTreeMap<String, AlertSettings>) -> CmdResult<()> {
    for (kind, value) in settings {
        if ALERT_TYPES.iter().any(|(k, _, _)| *k == kind) {
            state.store.merge(&format!("widgets.alerts.{kind}"), serde_json::to_value(value).map_err(err)?).map_err(err)?;
        }
    }
    state.hub.broadcast(crate::widgets::ServerId::Alerts, &json!({ "type": "reload" }));
    Ok(())
}

#[tauri::command]
pub fn alert_test(state: State<'_, AppState>, kind: String) {
    state.bot.trigger_alert(&kind, test_payload(&kind));
}

#[tauri::command]
pub async fn pick_media_file(app: tauri::AppHandle, kind: String) -> CmdResult<Option<String>> {
    let (label, extensions): (&str, &[&str]) = match kind.as_str() {
        "image" => ("Images", &["png", "jpg", "jpeg", "gif", "webp", "svg", "webm", "mp4"]),
        _ => ("Sons", &["mp3", "wav", "ogg", "flac", "m4a", "aac"]),
    };
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().add_filter(label, extensions).pick_file(move |file| {
        let _ = tx.send(file);
    });
    let picked = rx.await.map_err(err)?;
    Ok(picked
        .and_then(|f| f.into_path().ok())
        .map(|p| format!("file://{}", p.to_string_lossy().replace('\\', "/"))))
}
