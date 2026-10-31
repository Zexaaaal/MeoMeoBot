use super::CmdResult;
use crate::state::{err, AppState};
use serde_json::{json, Map, Value};
use shared::{PointsState, Reward, RewardBinding, RewardDraft, RewardFolder};
use std::collections::{BTreeMap, HashSet};
use tauri::State;

fn bindings(state: &AppState) -> BTreeMap<String, RewardBinding> {
    let config = state.store.config();
    let mut ids: HashSet<String> = HashSet::new();
    for key in ["rewardSounds", "rewardVolumes", "rewardVodFlags", "rewardFunctions"] {
        if let Some(map) = config[key].as_object() {
            ids.extend(map.keys().cloned());
        }
    }
    ids.into_iter().map(|id| {
        let binding = RewardBinding {
            sound: config["rewardSounds"][&id].as_str().unwrap_or_default().to_string(),
            volume: config["rewardVolumes"][&id].as_f64().unwrap_or(1.0),
            vod: config["rewardVodFlags"][&id] == json!(true),
            function: config["rewardFunctions"][&id].as_str().unwrap_or_default().to_string(),
        };
        (id, binding)
    }).collect()
}

const LOCAL_KEY: &str = "devRewards";

async fn local_mode(state: &AppState) -> bool {
    cfg!(debug_assertions) && (!state.bot.helix.is_ready() || matches!(state.bot.helix.rewards(false).await, Err(e) if e.status == 403))
}

fn local_rewards(state: &AppState) -> Vec<Value> {
    state.store.get(LOCAL_KEY).as_array().cloned().unwrap_or_default()
}

fn local_save(state: &AppState, id: Option<&str>, patch: Value) -> CmdResult<Value> {
    let mut rewards = local_rewards(state);
    let index = match id.and_then(|id| rewards.iter().position(|r| r["id"] == json!(id))) {
        Some(index) => index,
        None if id.is_some() => return Err("Récompense introuvable.".into()),
        None => {
            rewards.push(json!({ "id": format!("dev-{:016x}", rand::random::<u64>()), "is_enabled": true }));
            rewards.len() - 1
        }
    };
    let reward = &mut rewards[index];
    if let (Some(target), Value::Object(source)) = (reward.as_object_mut(), patch) {
        target.extend(source);
    }
    let cooldown = reward["global_cooldown_seconds"].as_u64().unwrap_or(0);
    reward["global_cooldown_setting"] = json!({ "is_enabled": reward["is_global_cooldown_enabled"] == json!(true), "global_cooldown_seconds": cooldown });
    let saved = reward.clone();
    state.store.set(LOCAL_KEY, json!(rewards)).map_err(err)?;
    Ok(saved)
}

async fn fetch_rewards(state: &AppState) -> CmdResult<Vec<Reward>> {
    let helix = &state.bot.helix;
    if local_mode(state).await {
        return Ok(local_rewards(state).into_iter().filter_map(|raw| serde_json::from_value(raw).ok()).collect());
    }
    let all = match helix.rewards(false).await {
        Ok(all) => all,
        Err(e) if e.status == 403 => return Err("Points de chaîne indisponibles : la chaîne doit être Affiliée ou Partenaire.".into()),
        Err(e) => return Err(e.to_string()),
    };
    let manageable: HashSet<String> = match helix.rewards(true).await {
        Ok(list) => list.iter().filter_map(|r| r["id"].as_str().map(str::to_string)).collect(),
        Err(_) => all.iter().filter_map(|r| r["id"].as_str().map(str::to_string)).collect(),
    };
    Ok(all.into_iter().filter_map(|raw| {
        let mut reward: Reward = serde_json::from_value(raw).ok()?;
        reward.is_manageable = manageable.contains(&reward.id);
        Some(reward)
    }).collect())
}

fn state_of(state: &AppState, rewards: Vec<Reward>, notice: Option<String>) -> PointsState {
    let config = state.store.config();
    PointsState {
        rewards,
        bindings: bindings(state),
        folders: serde_json::from_value(config["rewardFolders"].clone()).unwrap_or_default(),
        global_volume: config["pointsGlobalVolume"].as_f64().unwrap_or(0.5),
        notice,
    }
}

#[tauri::command]
pub async fn points_state(state: State<'_, AppState>) -> CmdResult<PointsState> {
    let notice = if local_mode(&state).await {
        Some("Mode dev : récompenses locales, utilise Tester pour simuler un rachat.".to_string())
    } else {
        (!state.bot.helix.is_ready()).then(|| "Connecte le bot à Twitch pour voir les récompenses.".to_string())
    };
    Ok(match fetch_rewards(&state).await {
        Ok(rewards) => state_of(&state, rewards, notice),
        Err(e) => state_of(&state, Vec::new(), Some(e)),
    })
}

fn draft_body(draft: &RewardDraft) -> Value {
    let mut body = json!({
        "title": draft.title.trim(),
        "cost": draft.cost.max(1),
        "prompt": draft.prompt,
        "background_color": draft.background_color,
        "is_user_input_required": draft.is_user_input_required,
        "is_global_cooldown_enabled": draft.cooldown > 0,
    });
    if draft.cooldown > 0 {
        body["global_cooldown_seconds"] = json!(draft.cooldown);
    }
    body
}

#[tauri::command]
pub async fn reward_save(state: State<'_, AppState>, id: Option<String>, draft: RewardDraft, binding: RewardBinding) -> CmdResult<PointsState> {
    if draft.title.trim().is_empty() {
        return Err("Le nom de la récompense est obligatoire.".into());
    }
    let body = draft_body(&draft);
    let saved = match id {
        _ if local_mode(&state).await => local_save(&state, id.as_deref(), body)?,
        Some(id) => state.bot.helix.update_reward(&id, body).await.map_err(err)?,
        None => state.bot.helix.create_reward(body).await.map_err(err)?,
    };
    if let Some(id) = saved["id"].as_str() {
        store_binding(&state, id, &binding)?;
    }
    points_state(state).await
}

#[tauri::command]
pub async fn reward_set_enabled(state: State<'_, AppState>, ids: Vec<String>, enabled: bool) -> CmdResult<PointsState> {
    let local = local_mode(&state).await;
    for id in ids {
        if local {
            local_save(&state, Some(&id), json!({ "is_enabled": enabled }))?;
            continue;
        }
        state.bot.helix.update_reward(&id, json!({ "is_enabled": enabled })).await.map_err(err)?;
    }
    points_state(state).await
}

#[tauri::command]
pub async fn reward_delete(state: State<'_, AppState>, id: String) -> CmdResult<PointsState> {
    if local_mode(&state).await {
        let rewards: Vec<Value> = local_rewards(&state).into_iter().filter(|r| r["id"] != json!(id)).collect();
        state.store.set(LOCAL_KEY, json!(rewards)).map_err(err)?;
    } else {
        state.bot.helix.delete_reward(&id).await.map_err(err)?;
    }
    points_state(state).await
}

fn set_map_entry(map: &mut Map<String, Value>, id: &str, value: Option<Value>) {
    match value {
        Some(v) => {
            map.insert(id.to_string(), v);
        }
        None => {
            map.remove(id);
        }
    }
}

#[tauri::command]
pub fn reward_binding_save(state: State<'_, AppState>, id: String, binding: RewardBinding) -> CmdResult<()> {
    store_binding(&state, &id, &binding)
}

fn store_binding(state: &AppState, id: &str, binding: &RewardBinding) -> CmdResult<()> {
    let config = state.store.config();
    let take = |key: &str| config[key].as_object().cloned().unwrap_or_default();
    let (mut sounds, mut volumes, mut vods, mut functions) = (take("rewardSounds"), take("rewardVolumes"), take("rewardVodFlags"), take("rewardFunctions"));
    set_map_entry(&mut sounds, id, (!binding.sound.is_empty()).then(|| json!(binding.sound)));
    set_map_entry(&mut volumes, id, ((binding.volume - 1.0).abs() > f64::EPSILON).then(|| json!(binding.volume)));
    set_map_entry(&mut vods, id, binding.vod.then(|| json!(true)));
    set_map_entry(&mut functions, id, (!binding.function.is_empty()).then(|| json!(binding.function)));
    state.store.merge("config", json!({
        "rewardSounds": sounds, "rewardVolumes": volumes, "rewardVodFlags": vods, "rewardFunctions": functions
    })).map_err(err)
}

#[tauri::command]
pub fn reward_folders_save(state: State<'_, AppState>, folders: Vec<RewardFolder>) -> CmdResult<()> {
    state.store.set("config.rewardFolders", json!(folders)).map_err(err)
}

#[tauri::command]
pub fn points_volume_save(state: State<'_, AppState>, volume: f64) -> CmdResult<()> {
    state.store.set("config.pointsGlobalVolume", json!(volume.clamp(0.0, 1.0))).map_err(err)
}

#[tauri::command]
pub fn reward_test(state: State<'_, AppState>, id: String) {
    state.bot.redeem(&id, "Test");
}
