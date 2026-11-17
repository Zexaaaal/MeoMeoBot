use crate::bot::Bot;
use crate::cast::Cast;
use crate::config::Store;
use crate::obs::Obs;
use crate::streamlabs::Streamlabs;
use crate::themes::Themes;
use crate::widgets::Hub;
use shared::{Notice, NoticeKind};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub struct AppState {
    pub store: Arc<Store>,
    pub hub: Arc<Hub>,
    pub bot: Arc<Bot>,
    pub obs: Arc<Obs>,
    pub streamlabs: Arc<Streamlabs>,
    pub themes: Themes,
    pub cast: Cast,
}

pub fn notify(app: &AppHandle, kind: NoticeKind, message: impl Into<String>) {
    let _ = app.emit(shared::events::NOTIFICATION, Notice { kind, message: message.into() });
}

pub fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
