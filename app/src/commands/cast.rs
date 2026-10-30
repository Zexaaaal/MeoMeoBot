use super::CmdResult;
use crate::cast::Cast;
use crate::state::{err, AppState};
use serde_json::json;
use shared::{CastDevice, CastVideo};
use std::path::PathBuf;
use std::time::Duration;
use tauri::{Manager, State};
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub fn cast_folder(state: State<'_, AppState>) -> Option<String> {
    Some(state.store.get_str("castFolder")).filter(|f| !f.is_empty())
}

#[tauri::command]
pub async fn cast_pick_folder(app: tauri::AppHandle, state: State<'_, AppState>) -> CmdResult<Option<String>> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder| {
        let _ = tx.send(folder);
    });
    let Some(folder) = rx.await.map_err(err)?.and_then(|f| f.into_path().ok()) else { return Ok(None) };
    let folder = folder.to_string_lossy().into_owned();
    state.store.set("castFolder", json!(folder)).map_err(err)?;
    Ok(Some(folder))
}

#[tauri::command]
pub async fn cast_videos(state: State<'_, AppState>, folder: String) -> CmdResult<Vec<CastVideo>> {
    Ok(state.cast.videos(&PathBuf::from(folder)).await)
}

#[tauri::command]
pub async fn cast_discover() -> CmdResult<Vec<CastDevice>> {
    tauri::async_runtime::spawn_blocking(|| Cast::discover(Duration::from_secs(5))).await.map_err(err)?.map_err(err)
}

#[tauri::command]
pub async fn cast_play(app: tauri::AppHandle, device: CastDevice, path: String) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state.cast.play(&state.hub, device, PathBuf::from(path))
    })
    .await
    .map_err(err)?
    .map_err(err)
}

#[tauri::command]
pub async fn cast_stop(app: tauri::AppHandle) -> CmdResult<()> {
    tauri::async_runtime::spawn_blocking(move || {
        let state = app.state::<AppState>();
        state.cast.stop(&state.hub)
    })
    .await
    .map_err(err)?
    .map_err(err)
}
