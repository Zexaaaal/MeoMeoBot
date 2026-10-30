mod alerts;
mod bot;
mod cast;
mod commands;
mod config;
mod discord;
mod media;
mod obs;
mod spotify;
mod state;
mod streamlabs;
mod themes;
mod twitch;
mod widgets;

use bot::Bot;
use serde_json::json;
use shared::NoticeKind;
use state::{notify, AppState};
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::mpsc;
use widgets::{Hub, Incoming, ServerId};

fn ffmpeg_path(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("bin").join("ffmpeg.exe")
    } else {
        app.path().resource_dir().map(|dir| dir.join("ffmpeg.exe")).unwrap_or_else(|_| PathBuf::from("ffmpeg.exe"))
    }
}

fn widgets_dir(app: &AppHandle) -> PathBuf {
    if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("widgets")
    } else {
        app.path().resource_dir().map(|dir| dir.join("widgets")).unwrap_or_else(|_| PathBuf::from("widgets"))
    }
}

async fn handle_incoming(app: AppHandle, mut rx: mpsc::UnboundedReceiver<Incoming>) {
    while let Some(event) = rx.recv().await {
        let state = app.state::<AppState>();
        let bot = state.bot.clone();
        match event {
            Incoming::TwitchToken(token) => {
                if state.store.set("config.token", json!(format!("oauth:{token}"))).is_ok() {
                    notify(&app, NoticeKind::Success, "Autorisation Twitch reçue.");
                    let _ = app.emit(shared::events::TWITCH_SETTINGS, ());
                    tauri::async_runtime::spawn(async move {
                        let _ = bot.connect().await;
                    });
                }
            }
            Incoming::SpotifyAuthorized => {
                notify(&app, NoticeKind::Success, "Spotify est lié.");
                let _ = app.emit(shared::events::INTEGRATIONS, ());
            }
            Incoming::Message { server, data } => match (server, data["type"].as_str().unwrap_or_default()) {
                (ServerId::Alerts, "alert-finished") => bot.alerts.finished(),
                (ServerId::Alerts, "client-connected") => bot.alerts.process(),
                (ServerId::Goals, "client-connected") => {
                    tauri::async_runtime::spawn(async move { bot.broadcast_goal_counts().await });
                }
                (ServerId::Chat, "send-chat") => {
                    if let Some(text) = data["text"].as_str().map(str::to_string) {
                        tauri::async_runtime::spawn(async move { bot.say(&text).await });
                    }
                }
                _ => {}
            },
        }
    }
}

async fn poll_goal_counts(hub: Arc<Hub>, bot: Arc<Bot>) {
    loop {
        tokio::time::sleep(Duration::from_secs(60)).await;
        if hub.has_clients(ServerId::Goals) {
            bot.broadcast_goal_counts().await;
        }
    }
}

pub fn run() {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let _ = dotenvy::dotenv();
    env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let store = Arc::new(config::Store::open(&config::locate())?);
            let widgets = widgets_dir(app.handle());
            let themes = themes::Themes::new(&store, &widgets);
            themes.reload_contents(&store);
            let (tx, rx) = mpsc::unbounded_channel();
            let hub = Hub::new(store.clone(), widgets, tx);
            let bot = Bot::new(app.handle().clone(), store.clone(), hub.clone());
            let obs = obs::Obs::new(store.clone(), hub.clone());
            let streamlabs = streamlabs::Streamlabs::new(bot.clone());
            let cast = cast::Cast::new(ffmpeg_path(app.handle()), store.user_data().join("thumbnail_cache"));

            app.manage(AppState { store: store.clone(), hub: hub.clone(), bot: bot.clone(), obs: obs.clone(), streamlabs: streamlabs.clone(), themes, cast });
            tauri::async_runtime::spawn(spotify::poll(store, hub.clone()));
            tauri::async_runtime::spawn(async move { streamlabs.restart().await });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(handle_incoming(handle.clone(), rx));
            tauri::async_runtime::spawn(poll_goal_counts(hub.clone(), bot.clone()));
            tauri::async_runtime::spawn(async move {
                hub.start().await;
                obs.restart();
                let _ = handle.emit(shared::events::WIDGET_URLS, ());
                if let Err(e) = bot.connect().await {
                    log::info!("Connexion Twitch différée : {e}");
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_info,
            commands::window_control,
            commands::bot_status,
            commands::commands_list,
            commands::command_save,
            commands::command_remove,
            commands::widget_urls,
            commands::twitch::twitch_settings,
            commands::twitch::twitch_settings_save,
            commands::twitch::twitch_redirect_uri,
            commands::twitch::twitch_authorize,
            commands::twitch::bot_connect,
            commands::twitch::bot_disconnect,
            commands::twitch::bot_subscriptions,
            commands::giveaway::giveaway_state,
            commands::giveaway::giveaway_save_settings,
            commands::giveaway::giveaway_start,
            commands::giveaway::giveaway_stop,
            commands::giveaway::giveaway_draw,
            commands::giveaway::giveaway_clear,
            commands::moderation::moderation_state,
            commands::moderation::banned_word_add,
            commands::moderation::banned_word_remove,
            commands::moderation::banned_words_clear,
            commands::moderation::auto_messages_save,
            commands::moderation::clip_cooldown_save,
            commands::alerts::alerts_settings,
            commands::alerts::alerts_save,
            commands::alerts::alert_test,
            commands::alerts::pick_media_file,
            commands::cast::cast_folder,
            commands::cast::cast_pick_folder,
            commands::cast::cast_videos,
            commands::cast::cast_discover,
            commands::cast::cast_play,
            commands::cast::cast_stop,
            commands::update::update_check,
            commands::update::update_install,
            commands::points::points_state,
            commands::points::reward_save,
            commands::points::reward_set_enabled,
            commands::points::reward_delete,
            commands::points::reward_binding_save,
            commands::points::reward_folders_save,
            commands::points::points_volume_save,
            commands::points::reward_test,
            commands::widgets::widget_settings,
            commands::widgets::widget_settings_save,
            commands::widgets::badge_labels,
            commands::widgets::roulette_spin,
            commands::widgets::system_fonts,
            commands::widgets::widgets_refresh,
            commands::integrations::integration_settings,
            commands::integrations::integration_settings_save,
            commands::integrations::obs_status,
            commands::integrations::obs_refresh,
            commands::integrations::spotify_redirect_uri,
            commands::integrations::spotify_authorize,
            commands::themes::theme_editor,
            commands::themes::theme_content,
            commands::themes::theme_apply,
            commands::themes::theme_create,
            commands::themes::theme_rename,
            commands::themes::theme_delete,
            commands::themes::theme_import,
            commands::themes::widget_config,
            commands::themes::widget_config_save,
            commands::themes::sub_count,
            commands::themes::goal_url,
            commands::planning::planning_state,
            commands::planning::planning_save,
            commands::planning::planning_load_twitch,
            commands::planning::planning_sync_twitch,
            commands::planning::category_search,
            commands::planning::steamgriddb_image,
            commands::planning::image_data_url,
            commands::planning::planning_export,
            commands::planning::planning_publish,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MeoMeoBot");
}
