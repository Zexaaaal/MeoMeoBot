use super::CmdResult;
use crate::state::err;
use tauri_plugin_updater::UpdaterExt;

#[tauri::command]
pub async fn update_check(app: tauri::AppHandle) -> CmdResult<Option<String>> {
    let update = app.updater().map_err(err)?.check().await.map_err(err)?;
    Ok(update.map(|u| u.version))
}

#[tauri::command]
pub async fn update_install(app: tauri::AppHandle) -> CmdResult<()> {
    let Some(update) = app.updater().map_err(err)?.check().await.map_err(err)? else { return Ok(()) };
    update.download_and_install(|_, _| {}, || {}).await.map_err(err)?;
    app.restart()
}
