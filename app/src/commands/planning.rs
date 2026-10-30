use super::CmdResult;
use crate::state::{err, AppState};
use base64::Engine;
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveTime, TimeZone};
use serde_json::{json, Value};
use shared::{Category, PlanningEvent, PlanningState};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub fn week_dates(monday: NaiveDate) -> Vec<NaiveDate> {
    (0..7).map(|i| monday + Duration::days(i)).collect()
}

pub fn duration_minutes(start: &str, end: Option<&str>) -> i64 {
    let parse = |t: &str| NaiveTime::parse_from_str(t, "%H:%M").ok();
    match (parse(start), end.and_then(parse)) {
        (Some(s), Some(e)) => {
            let minutes = (e - s).num_minutes();
            if minutes <= 0 { minutes + 24 * 60 } else { minutes }
        }
        _ => 120,
    }
}

pub fn week_key(monday: NaiveDate) -> String {
    let iso = monday.iso_week();
    format!("{}-W{:02}", iso.year(), iso.week())
}

pub fn webhook_content(state: &PlanningState, monday: NaiveDate) -> String {
    let start = if state.start_sunday { monday - Duration::days(1) } else { monday };
    let end = start + Duration::days(6);
    let mut message = state.webhook_message.trim().to_string();
    if message.is_empty() {
        message = format!("# {} du {} au {}", state.title, start.format("%d.%m"), end.format("%d.%m"));
    }
    let mention = if state.role_id.trim().is_empty() { String::new() } else { format!("<@&{}>", state.role_id.trim()) };
    regex::Regex::new(r"(?i)\{roleid\}").unwrap().replace_all(&message, mention.as_str()).to_string()
}

fn local(date: NaiveDate, time: &str) -> Option<DateTime<Local>> {
    let time = NaiveTime::parse_from_str(time, "%H:%M").ok()?;
    Local.from_local_datetime(&date.and_time(time)).earliest()
}

fn segment_to_event(segment: &Value) -> Option<(NaiveDate, PlanningEvent)> {
    let start: DateTime<Local> = DateTime::parse_from_rfc3339(segment["start_time"].as_str()?).ok()?.with_timezone(&Local);
    let end = segment["end_time"].as_str().and_then(|e| DateTime::parse_from_rfc3339(e).ok()).map(|e| e.with_timezone(&Local).format("%H:%M").to_string());
    let category = &segment["category"];
    Some((start.date_naive(), PlanningEvent {
        id: segment["id"].as_str().map(str::to_string),
        start_time: start.format("%H:%M").to_string(),
        end_time: end,
        category: Category {
            id: category["id"].as_str().unwrap_or_default().to_string(),
            name: category["name"].as_str().unwrap_or_default().to_string(),
            box_art_url: category["box_art_url"].as_str().unwrap_or_default().to_string(),
        },
        title: segment["title"].as_str().unwrap_or_default().to_string(),
        image_url: String::new(),
        use_miniature: false,
        show_game_title: true,
    }))
}

#[tauri::command]
pub fn planning_state(state: State<'_, AppState>) -> PlanningState {
    let mut planning: PlanningState = serde_json::from_value(state.store.get("planning")).unwrap_or_default();
    if planning.title.is_empty() {
        planning.title = "PLANNING".into();
    }
    planning
}

#[tauri::command]
pub fn planning_save(state: State<'_, AppState>, planning: PlanningState) -> CmdResult<()> {
    state.store.set("planning", serde_json::to_value(planning).map_err(err)?).map_err(err)
}

#[tauri::command]
pub async fn planning_load_twitch(state: State<'_, AppState>, monday: NaiveDate) -> CmdResult<PlanningState> {
    let segments = state.bot.helix.schedule().await.map_err(err)?;
    let mut planning = planning_state(state.clone());
    let dates = week_dates(monday);
    let mut found = false;
    let mut events: std::collections::BTreeMap<String, Vec<PlanningEvent>> = dates.iter().map(|d| (d.to_string(), Vec::new())).collect();
    for (date, event) in segments.iter().filter_map(segment_to_event) {
        if let Some(day) = events.get_mut(&date.to_string()) {
            let previous = planning.events.get(&date.to_string()).and_then(|list| list.iter().find(|e| e.id == event.id)).cloned();
            day.push(match previous {
                Some(p) => PlanningEvent { image_url: p.image_url, use_miniature: p.use_miniature, show_game_title: p.show_game_title, ..event },
                None => event,
            });
            found = true;
        }
    }
    if found {
        planning.events.extend(events);
        planning_save(state, planning.clone())?;
    }
    Ok(planning)
}

#[tauri::command]
pub async fn planning_sync_twitch(state: State<'_, AppState>, monday: NaiveDate) -> CmdResult<PlanningState> {
    let helix = &state.bot.helix;
    let planning = planning_state(state.clone());
    let existing = helix.schedule().await.map_err(err)?;
    let timezone = iana_time_zone::get_timezone().unwrap_or_else(|_| "Europe/Paris".into());
    let now = Local::now();
    let mut kept = std::collections::HashSet::new();

    for date in week_dates(monday) {
        for event in planning.events.get(&date.to_string()).into_iter().flatten() {
            let Some(start) = local(date, &event.start_time) else { continue };
            let body = json!({
                "start_time": start.to_utc().to_rfc3339(),
                "timezone": timezone,
                "duration": duration_minutes(&event.start_time, event.end_time.as_deref()).to_string(),
                "category_id": event.category.id,
                "title": event.title,
                "is_recurring": false,
            });
            match event.id.as_deref().filter(|id| existing.iter().any(|s| s["id"].as_str() == Some(id))) {
                Some(id) => {
                    helix.update_segment(id, body).await.map_err(err)?;
                    kept.insert(id.to_string());
                }
                None if start > now => helix.create_segment(body).await.map_err(err)?,
                None => {}
            }
        }
    }

    let week_start = local(monday, "00:00").unwrap_or(now);
    let week_end = week_start + Duration::days(7);
    for segment in &existing {
        let Some(id) = segment["id"].as_str() else { continue };
        let in_week = segment["start_time"].as_str().and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|s| s >= week_start && s < week_end).unwrap_or(false);
        if in_week && !kept.contains(id) {
            helix.delete_segment(id).await.map_err(err)?;
        }
    }

    planning_load_twitch(state, monday).await
}

#[tauri::command]
pub async fn category_search(state: State<'_, AppState>, query: String) -> CmdResult<Vec<Category>> {
    if query.trim().is_empty() {
        return Ok(Vec::new());
    }
    let results = state.bot.helix.search_categories(query.trim()).await.map_err(err)?;
    Ok(results.iter().map(|c| Category {
        id: c["id"].as_str().unwrap_or_default().to_string(),
        name: c["name"].as_str().unwrap_or_default().to_string(),
        box_art_url: c["box_art_url"].as_str().unwrap_or_default().to_string(),
    }).collect())
}

#[tauri::command]
pub async fn steamgriddb_image(state: State<'_, AppState>, game: String) -> CmdResult<Option<String>> {
    let key = state.store.get_str("config.steamGridDbApiKey");
    if key.is_empty() {
        return Err("Renseigne une clé SteamGridDB dans Configuration > Intégrations.".into());
    }
    Ok(state.bot.helix.steamgriddb_image(&key, &game).await)
}

#[tauri::command]
pub async fn image_data_url(state: State<'_, AppState>, source: String) -> CmdResult<String> {
    let (bytes, mime) = if source.starts_with("http") {
        let response = state.bot.helix.http.get(&source).send().await.map_err(err)?;
        let mime = response.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("image/jpeg").to_string();
        (response.bytes().await.map_err(err)?.to_vec(), mime)
    } else {
        let path = std::path::PathBuf::from(source.trim_start_matches("file://"));
        let mime = crate::media::content_type(&path).to_string();
        if !mime.starts_with("image/") {
            return Err("Ce fichier n'est pas une image.".into());
        }
        (tokio::fs::read(&path).await.map_err(err)?, mime)
    };
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub async fn planning_export(app: AppHandle, data_url: String) -> CmdResult<bool> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().set_file_name("planning.jpg").add_filter("Image", &["jpg"]).save_file(move |file| {
        let _ = tx.send(file);
    });
    let Some(path) = rx.await.map_err(err)?.and_then(|f| f.into_path().ok()) else { return Ok(false) };
    let encoded = data_url.split_once(',').map(|(_, b)| b).unwrap_or(&data_url);
    let bytes = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(err)?;
    tokio::fs::write(path, bytes).await.map_err(err)?;
    Ok(true)
}

#[tauri::command]
pub async fn planning_publish(state: State<'_, AppState>, monday: NaiveDate, data_url: String) -> CmdResult<()> {
    let webhook = state.store.get_str("config.discordWebhookUrl");
    if webhook.is_empty() {
        return Err("Renseigne le webhook Discord dans Configuration > Intégrations.".into());
    }
    let mut planning = planning_state(state.clone());
    let key = week_key(monday);
    let content = webhook_content(&planning, monday);
    let existing = planning.discord_messages.get(&key).cloned();
    let message_id = crate::discord::publish(&state.bot.helix.http, &webhook, &data_url, &content, existing.as_deref()).await?;
    planning.discord_messages.insert(key, message_id);
    planning_save(state, planning)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn durations_handle_midnight_and_missing_end() {
        assert_eq!(duration_minutes("20:00", Some("23:30")), 210);
        assert_eq!(duration_minutes("22:00", Some("01:00")), 180);
        assert_eq!(duration_minutes("20:00", None), 120);
    }

    #[test]
    fn weeks_cover_seven_days() {
        let monday = NaiveDate::from_ymd_opt(2026, 10, 26).unwrap();
        let dates = week_dates(monday);
        assert_eq!(dates.len(), 7);
        assert_eq!(dates[6], NaiveDate::from_ymd_opt(2026, 11, 1).unwrap());
        assert_eq!(week_key(monday), "2026-W44");
    }

    #[test]
    fn webhook_content_mentions_role_and_falls_back() {
        let monday = NaiveDate::from_ymd_opt(2026, 10, 26).unwrap();
        let mut planning = PlanningState { title: "PLANNING".into(), ..Default::default() };
        assert_eq!(webhook_content(&planning, monday), "# PLANNING du 26.10 au 01.11");
        planning.webhook_message = "{RoleID} Planning !".into();
        planning.role_id = "42".into();
        assert_eq!(webhook_content(&planning, monday), "<@&42> Planning !");
    }
}
