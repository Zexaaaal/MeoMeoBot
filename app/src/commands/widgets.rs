use super::CmdResult;
use crate::state::{err, AppState};
use crate::widgets::ServerId;
use serde_json::json;
use shared::WidgetSettings;
use std::collections::BTreeMap;
use tauri::State;

pub const BADGES: &[(&str, &str)] = &[
    ("moderator", "Modérateur"),
    ("vip", "VIP"),
    ("subscriber", "Abonné"),
    ("founder", "Fondateur"),
    ("partner", "Partenaire"),
    ("staff", "Staff"),
    ("premium", "Prime Gaming"),
];

#[tauri::command]
pub fn widget_settings(state: State<'_, AppState>) -> WidgetSettings {
    let chat = state.store.widget("chat");
    let subgoals = state.store.widget("subgoals");
    let wall = state.store.widget("emote-wall");
    let num = |v: &serde_json::Value, fallback: u64| v.as_u64().unwrap_or(fallback) as u32;
    WidgetSettings {
        chat_max_messages: num(&chat["maxMessages"], 10),
        badge_prefs: BADGES.iter().map(|(id, _)| (id.to_string(), chat["badgePrefs"][*id] != json!(false))).collect::<BTreeMap<_, _>>(),
        daily_goal: num(&subgoals["baseDailyGoalCount"], subgoals["dailyGoalCount"].as_u64().unwrap_or(10)),
        count_regular_subs: subgoals["countRegularSubs"] != json!(false),
        count_gift_subs: subgoals["countSubGifts"] == json!(true),
        emote_min_size: num(&wall["minSize"], 32),
        emote_max_size: num(&wall["maxSize"], 96),
        emote_spawn_interval: num(&wall["spawnInterval"], 100),
        emote_duration: num(&wall["animationDuration"], 5000),
    }
}

#[tauri::command]
pub fn widget_settings_save(state: State<'_, AppState>, settings: WidgetSettings) -> CmdResult<()> {
    let goal = settings.daily_goal.max(1);
    let store = &state.store;
    store.merge("widgets.chat", json!({ "badgePrefs": settings.badge_prefs, "maxMessages": settings.chat_max_messages.clamp(1, 100) })).map_err(err)?;
    store.merge("widgets.subgoals", json!({
        "dailyGoalCount": goal,
        "baseDailyGoalCount": goal,
        "countRegularSubs": settings.count_regular_subs,
        "countSubGifts": settings.count_gift_subs,
    })).map_err(err)?;
    store.merge("widgets.emote-wall", json!({
        "minSize": settings.emote_min_size,
        "maxSize": settings.emote_max_size.max(settings.emote_min_size),
        "spawnInterval": settings.emote_spawn_interval.max(10),
        "animationDuration": settings.emote_duration.max(500),
    })).map_err(err)?;

    for widget in ["chat", "subgoals", "emote-wall"] {
        state.hub.broadcast_config(widget, &store.widget(widget));
    }
    Ok(())
}

#[tauri::command]
pub fn badge_labels() -> Vec<(String, String)> {
    BADGES.iter().map(|(id, label)| (id.to_string(), label.to_string())).collect()
}

#[tauri::command]
pub fn system_fonts() -> Vec<String> {
    let mut fonts: Vec<String> = Vec::new();
    #[cfg(windows)]
    {
        use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};
        for hive in [HKEY_LOCAL_MACHINE, HKEY_CURRENT_USER] {
            let Ok(key) = winreg::RegKey::predef(hive).open_subkey(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts") else { continue };
            for (name, _) in key.enum_values().flatten() {
                let family = name.split(" (").next().unwrap_or(&name)
                    .trim_end_matches(" Bold").trim_end_matches(" Italic").trim_end_matches(" Light").trim_end_matches(" Regular").trim().to_string();
                if !family.is_empty() && !family.contains('&') {
                    fonts.push(family);
                }
            }
        }
    }
    fonts.sort_by_key(|f| f.to_lowercase());
    fonts.dedup();
    fonts
}

#[tauri::command]
pub fn roulette_spin(state: State<'_, AppState>) {
    state.hub.broadcast(ServerId::Roulette, &json!({ "type": "spin" }));
}

#[tauri::command]
pub fn widgets_refresh(state: State<'_, AppState>) {
    state.hub.refresh_all();
}
