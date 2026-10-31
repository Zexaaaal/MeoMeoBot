use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
use crate::pages::alerts::MediaPicker;
use crate::tauri::{call, call0};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::{json, Value};
use shared::{PointsState, Reward, RewardBinding, RewardDraft, RewardFolder};

const FUNCTIONS: &[(&str, &str)] = &[("", "Aucune action"), ("emote_rain", "Pluie d'emotes"), ("bat_rain", "Pluie de chauves-souris")];

fn folder_of(folders: &[RewardFolder], reward_id: &str) -> String {
    folders.iter().find(|f| f.reward_ids.iter().any(|id| id == reward_id)).map(|f| f.id.clone()).unwrap_or_default()
}

#[component]
fn RewardEditor(editing: RwSignal<Option<Option<Reward>>>, state: RwSignal<PointsState>) -> impl IntoView {
    let notices = notices();
    let original = editing.get_untracked().flatten();
    let title = RwSignal::new(original.as_ref().map(|r| r.title.clone()).unwrap_or_default());
    let cost = RwSignal::new(original.as_ref().map(|r| r.cost).unwrap_or(100));
    let color = RwSignal::new(original.as_ref().map(|r| r.background_color.clone()).filter(|c| !c.is_empty()).unwrap_or_else(|| "#9146FF".into()));
    let cooldown = RwSignal::new(original.as_ref().filter(|r| r.global_cooldown_setting.is_enabled).map(|r| r.global_cooldown_setting.global_cooldown_seconds).unwrap_or(0));
    let prompt = RwSignal::new(original.as_ref().map(|r| r.prompt.clone()).unwrap_or_default());
    let user_input = RwSignal::new(original.as_ref().map(|r| r.is_user_input_required).unwrap_or(false));
    let id = original.map(|r| r.id);
    let is_new = id.is_none();
    let binding = RwSignal::new(
        id.as_ref()
            .and_then(|id| state.get_untracked().bindings.get(id).cloned())
            .unwrap_or(RewardBinding { volume: 1.0, ..Default::default() }),
    );

    let save = move |_| {
        let draft = RewardDraft {
            title: title.get_untracked(),
            cost: cost.get_untracked(),
            prompt: prompt.get_untracked(),
            background_color: color.get_untracked(),
            is_user_input_required: user_input.get_untracked(),
            cooldown: cooldown.get_untracked(),
        };
        let id = id.clone();
        let binding = binding.get_untracked();
        spawn_local(async move {
            match call::<PointsState>("reward_save", json!({ "id": id, "draft": draft, "binding": binding })).await {
                Ok(next) => {
                    state.set(next);
                    editing.set(None);
                    notices.success("Récompense enregistrée");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <section class="panel">
            <div class="panel-header">
                <h2>{if is_new { "Nouvelle récompense" } else { "Modifier la récompense" }}</h2>
                <div class="row-actions">
                    <button class="button" on:click=move |_| editing.set(None)>"Annuler"</button>
                    <button class="button primary" on:click=save><Icon name="check"/>"Enregistrer"</button>
                </div>
            </div>
            <div class="grid-4">
                <label class="field span-2"><span>"Nom"</span><input type="text" bind:value=title/></label>
                <label class="field"><span>"Coût"</span>
                    <input type="number" min="1" prop:value=move || cost.get().to_string() on:input=move |e| cost.set(event_target_value(&e).parse().unwrap_or(1))/>
                </label>
                <label class="field"><span>"Couleur"</span><input type="color" class="color" bind:value=color/></label>
                <label class="field span-3"><span>"Description"</span><input type="text" bind:value=prompt/></label>
                <label class="field"><span>"Délai (secondes)"</span>
                    <input type="number" min="0" prop:value=move || cooldown.get().to_string() on:input=move |e| cooldown.set(event_target_value(&e).parse().unwrap_or(0))/>
                </label>
            </div>
            <div class="grid-4">
                <div class="span-2">
                    <MediaPicker label="Son" kind="audio" value=Signal::derive(move || binding.get().sound)
                        on_change=Callback::new(move |v: String| binding.update(|b| b.sound = v))/>
                </div>
                <label class="field"><span>{move || format!("Volume : {} %", (binding.get().volume * 100.0).round())}</span>
                    <input type="range" min="0" max="2" step="0.05" prop:value=move || binding.get().volume.to_string()
                        on:input=move |e| binding.update(|b| b.volume = event_target_value(&e).parse().unwrap_or(1.0))/>
                </label>
                <label class="field"><span>"Action"</span>
                    <select on:change=move |e| binding.update(|b| b.function = event_target_value(&e))>
                        {FUNCTIONS.iter().map(|(value, label)| view! { <option value=*value selected=move || binding.get().function == *value>{*label}</option> }).collect_view()}
                    </select>
                </label>
            </div>
            <div class="form-inline center-items">
                <label class="check"><input type="checkbox" bind:checked=user_input/><span>"Le viewer doit écrire un message"</span></label>
                <label class="check"><input type="checkbox" prop:checked=move || binding.get().vod on:change=move |e| binding.update(|b| b.vod = event_target_checked(&e))/><span>"Son rediff"</span></label>
            </div>
        </section>
    }
}

fn assign(state: RwSignal<PointsState>, notices: crate::components::Notices, reward_id: String, folder_id: String) {
    let mut folders = state.get_untracked().folders;
    if folder_of(&folders, &reward_id) == folder_id {
        return;
    }
    for folder in folders.iter_mut() {
        folder.reward_ids.retain(|r| *r != reward_id);
        if folder.id == folder_id {
            folder.reward_ids.push(reward_id.clone());
        }
    }
    state.update(|s| s.folders = folders.clone());
    spawn_local(async move {
        if let Err(e) = call::<()>("reward_folders_save", json!({ "folders": folders })).await {
            notices.error(e);
        }
    });
}

#[component]
fn RewardRow(reward: Reward, state: RwSignal<PointsState>, editing: RwSignal<Option<Option<Reward>>>, dragging: RwSignal<Option<String>>) -> impl IntoView {
    let notices = notices();
    let id = reward.id.clone();
    let initial = state.get_untracked().bindings.get(&id).cloned().unwrap_or(RewardBinding { volume: 1.0, ..Default::default() });
    let binding = RwSignal::new(initial);

    let persist = {
        let id = id.clone();
        move || {
            let id = id.clone();
            let value = binding.get_untracked();
            spawn_local(async move {
                if let Err(e) = call::<()>("reward_binding_save", json!({ "id": id, "binding": value })).await {
                    notices.error(e);
                }
            });
        }
    };

    let simple = move |cmd: &'static str, args: Value, success: &'static str| {
        spawn_local(async move {
            match call::<PointsState>(cmd, args).await {
                Ok(next) => {
                    state.set(next);
                    notices.success(success);
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let (p1, p2, p3, p4) = (persist.clone(), persist.clone(), persist.clone(), persist.clone());
    let id_toggle = id.clone();
    let id_delete = id.clone();
    let id_test = id.clone();
    let id_drag = id.clone();
    let id_dragged = id.clone();
    let enabled = reward.is_enabled;
    let manageable = reward.is_manageable;
    let editable = reward.clone();
    let cooldown = reward.global_cooldown_setting.is_enabled.then(|| format!("délai {} s", reward.global_cooldown_setting.global_cooldown_seconds));

    view! {
        <div class="reward" draggable="true" class:dragging=move || dragging.get().as_deref() == Some(id_dragged.as_str())
            on:dragstart=move |_| dragging.set(Some(id_drag.clone()))
            on:dragend=move |_| dragging.set(None)>
            <span class="swatch" style=format!("background:{}", reward.background_color)></span>
            <div class="reward-title">
                <strong>{reward.title.clone()}</strong>
                <span class="hint">{format!("{} pts", reward.cost)}</span>
                {cooldown.map(|c| view! { <span class="hint">{c}</span> })}
                <Show when=move || !manageable>
                    <span class="hint" title="Créée hors de MeoMeoBot : Twitch interdit de la modifier ici. Le son et l'action restent réglables."><Icon name="lock"/></span>
                </Show>
            </div>
            <div class="reward-sound">
                <MediaPicker label="" kind="audio" value=Signal::derive(move || binding.get().sound)
                    on_change=Callback::new(move |v: String| { binding.update(|b| b.sound = v); p1() })/>
            </div>
            <label class="reward-volume" title="Volume du son">
                <input type="range" min="0" max="2" step="0.05" prop:value=move || binding.get().volume.to_string()
                    on:input=move |e| binding.update(|b| b.volume = event_target_value(&e).parse().unwrap_or(1.0))
                    on:change=move |_| p2()/>
                <span class="hint">{move || format!("{} %", (binding.get().volume * 100.0).round())}</span>
            </label>
            <select class="reward-action" title="Action" on:change=move |e| { binding.update(|b| b.function = event_target_value(&e)); p3() }>
                {FUNCTIONS.iter().map(|(value, label)| view! { <option value=*value selected=move || binding.get().function == *value>{*label}</option> }).collect_view()}
            </select>
            <label class="check"><input type="checkbox" prop:checked=move || binding.get().vod on:change=move |e| { binding.update(|b| b.vod = event_target_checked(&e)); p4() }/><span>"Son rediff"</span></label>
            <button class="button small" title="Jouer le son et l'action comme si la récompense était utilisée"
                on:click={ let id = id_test.clone(); move |_| { let id = id.clone(); spawn_local(async move { let _ = call::<()>("reward_test", json!({ "id": id })).await; }) } }>
                <Icon name="play"/>"Tester"
            </button>
            <Show when=move || manageable>
                <label class="check"><input type="checkbox" prop:checked=enabled
                    on:change={ let id = id_toggle.clone(); move |e| simple("reward_set_enabled", json!({ "ids": [id.clone()], "enabled": event_target_checked(&e) }), "Récompense mise à jour") }/><span>"Actif"</span></label>
                <button class="icon-button" title="Modifier" on:click={ let r = editable.clone(); move |_| editing.set(Some(Some(r.clone()))) }><Icon name="edit"/></button>
                <ConfirmDelete on_confirm=Callback::new({ let id = id_delete.clone(); move |_| simple("reward_delete", json!({ "id": id.clone() }), "Récompense supprimée") })/>
            </Show>
        </div>
    }
}

#[component]
pub fn PointsPage() -> impl IntoView {
    let state = RwSignal::new(PointsState::default());
    let loading = RwSignal::new(true);
    let editing = RwSignal::new(None::<Option<Reward>>);
    let dragging = RwSignal::new(None::<String>);
    let over = RwSignal::new(None::<String>);
    let expanded = RwSignal::new(std::collections::HashSet::<String>::new());
    let renaming = RwSignal::new(None::<String>);
    let notices = notices();

    let load = move || {
        loading.set(true);
        spawn_local(async move {
            match call0::<PointsState>("points_state").await {
                Ok(next) => state.set(next),
                Err(e) => notices.error(e),
            }
            loading.set(false);
        });
    };
    load();

    let save_folders = move |folders: Vec<RewardFolder>| {
        state.update(|s| s.folders = folders.clone());
        spawn_local(async move {
            if let Err(e) = call::<()>("reward_folders_save", json!({ "folders": folders })).await {
                notices.error(e);
            }
        });
    };

    let add_folder = move |_| {
        let mut folders = state.get_untracked().folders;
        folders.push(RewardFolder { id: format!("folder-{}", js_sys::Date::now() as u64), name: "Nouveau dossier".into(), reward_ids: Vec::new() });
        save_folders(folders);
    };

    let save_volume = move |e: leptos::ev::Event| {
        let volume: f64 = event_target_value(&e).parse().unwrap_or(0.5);
        state.update(|s| s.global_volume = volume);
        spawn_local(async move {
            let _ = call::<()>("points_volume_save", json!({ "volume": volume })).await;
        });
    };

    let drop_into = move |folder_id: String| {
        over.set(None);
        if let Some(reward_id) = dragging.get_untracked() {
            dragging.set(None);
            assign(state, notices, reward_id, folder_id);
        }
    };

    let folders = move || {
        let s = state.get();
        s.folders.iter().map(|f| {
            let rewards: Vec<Reward> = s.rewards.iter().filter(|r| f.reward_ids.contains(&r.id)).cloned().collect();
            (f.clone(), rewards)
        }).collect::<Vec<_>>()
    };
    let loose = move || {
        let s = state.get();
        s.rewards.iter().filter(|r| folder_of(&s.folders, &r.id).is_empty()).cloned().collect::<Vec<_>>()
    };

    view! {
        <div class="page-body">
            <section class="panel">
                <div class="panel-header">
                    <label class="field inline grow"><span>{move || format!("Volume global : {} %", (state.get().global_volume * 100.0).round())}</span>
                        <input type="range" min="0" max="1" step="0.05" class="grow" prop:value=move || state.get().global_volume.to_string() on:change=save_volume/>
                    </label>
                    <button class="button" on:click=move |_| load()><Icon name="refresh"/>"Rafraîchir"</button>
                    <button class="button" on:click=add_folder><Icon name="folder"/>"Nouveau dossier"</button>
                    <button class="button primary" on:click=move |_| editing.set(Some(None))><Icon name="plus"/>"Nouvelle récompense"</button>
                </div>
            </section>
            {move || editing.get().map(|_| view! { <RewardEditor editing state/> })}
            <Show when=move || state.get().notice.is_none() || !state.get().rewards.is_empty() fallback=move || view! { <section class="panel"><p class="empty">{state.get().notice}</p></section> }>
                <Show when=move || !loading.get() || !state.get().rewards.is_empty() fallback=|| view! { <section class="panel"><p class="empty">"Chargement des récompenses…"</p></section> }>
                    <section class="panel fill scroll reward-list" class:drop-over=move || dragging.get().is_some() && over.get().as_deref() == Some("")
                        on:dragover=move |e| { e.prevent_default(); over.set(Some(String::new())); }
                        on:drop=move |e| { e.prevent_default(); drop_into(String::new()); }>
                        {move || folders().into_iter().map(|(f, rewards)| {
                            let ids: Vec<String> = rewards.iter().filter(|r| r.is_manageable).map(|r| r.id.clone()).collect();
                            let (ids_on, ids_off) = (ids.clone(), ids);
                            let fid = f.id.clone();
                            let fid_delete = f.id.clone();
                            let (fid_over, fid_class, fid_drop) = (f.id.clone(), f.id.clone(), f.id.clone());
                            let count = rewards.len();
                            let is_open = expanded.with(|set| set.contains(&f.id));
                            let is_renaming = renaming.get().as_deref() == Some(f.id.as_str());
                            let (fid_toggle, fid_rename) = (f.id.clone(), f.id.clone());
                            let toggle = move |ids: Vec<String>, enabled: bool| spawn_local(async move {
                                match call::<PointsState>("reward_set_enabled", json!({ "ids": ids, "enabled": enabled })).await {
                                    Ok(next) => state.set(next),
                                    Err(e) => notices.error(e),
                                }
                            });
                            view! {
                                <div class="folder" class:drop-over=move || dragging.get().is_some() && over.get().as_deref() == Some(fid_class.as_str())
                                    on:dragover=move |e| { e.prevent_default(); e.stop_propagation(); over.set(Some(fid_over.clone())); }
                                    on:drop=move |e| { e.prevent_default(); e.stop_propagation(); drop_into(fid_drop.clone()); }>
                                    <div class="folder-head" on:click=move |_| expanded.update(|set| { if !set.remove(&fid_toggle) { set.insert(fid_toggle.clone()); } })>
                                        <Icon name=if is_open { "chevronDown" } else { "chevronRight" }/>
                                        <Icon name="folder"/>
                                        {if is_renaming {
                                            view! {
                                                <input type="text" class="folder-name" prop:value=f.name.clone() autofocus
                                                    on:click=|e| e.stop_propagation()
                                                    on:keydown=|e| if e.key() == "Enter" || e.key() == "Escape" { if let Some(target) = e.target() { let _ = wasm_bindgen::JsCast::unchecked_into::<web_sys::HtmlElement>(target).blur(); } }
                                                    on:blur=move |e| { let name = event_target_value(&e); renaming.set(None); let mut folders = state.get_untracked().folders; if let Some(x) = folders.iter_mut().find(|x| x.id == fid) { if !name.trim().is_empty() { x.name = name.trim().to_string(); } } save_folders(folders); }/>
                                            }.into_any()
                                        } else {
                                            view! { <strong class="folder-title" title="Cliquer pour renommer" on:click=move |e| { e.stop_propagation(); renaming.set(Some(fid_rename.clone())); }>{f.name.clone()}</strong> }.into_any()
                                        }}
                                        <span class="hint">{format!("{count} récompense(s)")}</span>
                                        <span class="spacer"></span>
                                        <div class="row-actions" on:click=|e| e.stop_propagation()>
                                            <button class="button small" on:click=move |_| toggle(ids_on.clone(), true)>"Tout activer"</button>
                                            <button class="button small" on:click=move |_| toggle(ids_off.clone(), false)>"Tout désactiver"</button>
                                            <ConfirmDelete title="Supprimer le dossier" on_confirm=Callback::new(move |_| { let folders = state.get_untracked().folders.into_iter().filter(|x| x.id != fid_delete).collect(); save_folders(folders); })/>
                                        </div>
                                    </div>
                                    {(is_open && count == 0).then(|| view! { <p class="hint folder-empty">"Glisse une récompense ici."</p> })}
                                    {is_open.then(|| rewards.into_iter().map(|reward| view! { <RewardRow reward state editing dragging/> }).collect_view())}
                                </div>
                            }
                        }).collect_view()}
                        {move || loose().into_iter().map(|reward| view! { <RewardRow reward state editing dragging/> }).collect_view()}
                    </section>
                </Show>
            </Show>
        </div>
    }
}
