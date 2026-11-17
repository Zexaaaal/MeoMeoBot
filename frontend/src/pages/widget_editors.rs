use crate::components::{notices, ConfirmDelete, Toolbar};
use crate::icons::Icon;
use crate::tauri::{call, call0};
use crate::ui::{copy_with, url_for, widget_urls};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::{json, Value};

async fn load(widget: &'static str) -> Value {
    call("widget_config", json!({ "widget": widget })).await.unwrap_or_else(|_| json!({}))
}

async fn save(widget: &'static str, patch: Value, message: &'static str) {
    let notices = notices();
    match call::<Value>("widget_config_save", json!({ "widget": widget, "patch": patch })).await {
        Ok(_) => notices.success(message),
        Err(e) => notices.error(e),
    }
}

#[component]
fn Preview(key: &'static str) -> impl IntoView {
    let url = RwSignal::new(String::new());
    spawn_local(async move { url.set(url_for(&widget_urls().await, key)) });
    view! {
        <section class="panel fill">
            <h2>"Aperçu"</h2>
            <iframe class="preview tall" src=move || { let u = url.get(); if u.is_empty() { u } else { format!("{u}?mode=preview") } }></iframe>
        </section>
    }
}

#[derive(Clone)]
struct Step {
    id: usize,
    count: RwSignal<f64>,
    label: RwSignal<String>,
}

#[component]
pub fn SubgoalsEditor(on_back: Callback<()>) -> impl IntoView {
    let notices = notices();
    let start = RwSignal::new(0f64);
    let goal = RwSignal::new(100f64);
    let current = RwSignal::new(0f64);
    let steps = RwSignal::new(Vec::<Step>::new());
    let next_id = StoredValue::new(0usize);
    let new_step = move |count: f64, label: String| {
        let id = next_id.get_value();
        next_id.set_value(id + 1);
        Step { id, count: RwSignal::new(count), label: RwSignal::new(label) }
    };

    spawn_local(async move {
        let config = load("subgoals").await;
        start.set(config["startCount"].as_f64().unwrap_or(0.0));
        goal.set(config["goalCount"].as_f64().unwrap_or(100.0));
        current.set(config["currentCount"].as_f64().unwrap_or(0.0));
        steps.set(config["steps"].as_array().into_iter().flatten()
            .map(|s| new_step(s["count"].as_f64().unwrap_or(0.0), s["label"].as_str().unwrap_or_default().to_string()))
            .collect());
    });

    let persist = move |reset: bool| {
        let mut list: Vec<Value> = steps.get_untracked().iter()
            .filter(|s| !s.label.get_untracked().trim().is_empty())
            .map(|s| json!({ "count": s.count.get_untracked(), "label": s.label.get_untracked().trim() }))
            .collect();
        list.sort_by(|a, b| a["count"].as_f64().partial_cmp(&b["count"].as_f64()).unwrap_or(std::cmp::Ordering::Equal));
        let mut patch = json!({ "startCount": start.get_untracked(), "goalCount": goal.get_untracked(), "steps": list });
        if reset {
            current.set(start.get_untracked());
            patch["currentCount"] = json!(start.get_untracked());
        }
        spawn_local(async move { save("subgoals", patch, if reset { "Compteur remis au départ" } else { "Subgoals enregistrés" }).await });
    };

    let fetch_count = move |_| {
        spawn_local(async move {
            match call0::<i64>("sub_count").await {
                Ok(count) => {
                    start.set(count as f64);
                    notices.success(format!("Nombre actuel récupéré : {count}"));
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let number = |value: RwSignal<f64>| view! {
        <input type="number" prop:value=move || value.get().to_string() on:input=move |e| value.set(event_target_value(&e).parse().unwrap_or(0.0))/>
    };

    view! {
        <Toolbar on_back back_label="Widgets" title="Subgoals">
            <button class="button primary" on:click=move |_| persist(false)><Icon name="check"/>"Enregistrer"</button>
        </Toolbar>
        <div class="page-body columns">
            <div class="stack">
                <section class="panel">
                    <h2>"Objectif"</h2>
                    <div class="grid-2">
                        <label class="field"><span>"Départ (subs)"</span>
                            <div class="form-inline">{number(start)}<button class="button small" title="Utiliser le nombre de subs actuel sur Twitch" on:click=fetch_count><Icon name="refresh"/>"Actuel"</button></div>
                        </label>
                        <label class="field"><span>"Objectif (subs)"</span>{number(goal)}</label>
                    </div>
                    <div class="form-inline">
                        <span class="grow hint">{move || format!("Compteur actuel : {}", current.get())}</span>
                        <ConfirmDelete title="Remettre le compteur au départ" on_confirm=Callback::new(move |_| persist(true))/>
                    </div>
                </section>
                <section class="panel fill">
                    <div class="panel-header">
                        <h2>"Paliers"</h2>
                        <button class="button small" on:click=move |_| steps.update(|s| s.push(new_step(0.0, String::new())))><Icon name="plus"/>"Ajouter un palier"</button>
                    </div>
                    <p class="hint">"Nombre de subs au-dessus du départ, puis le texte affiché."</p>
                    <div class="list">
                        <Show when=move || !steps.get().is_empty() fallback=|| view! { <p class="empty">"Aucun palier."</p> }>
                            <For each=move || steps.get() key=|s| s.id let:step>
                                <div class="row">
                                    <span class="hint">"+"</span>
                                    <input type="number" class="narrow" prop:value=move || step.count.get().to_string() on:input=move |e| step.count.set(event_target_value(&e).parse().unwrap_or(0.0))/>
                                    <input type="text" class="grow" placeholder="Texte du palier" bind:value=step.label/>
                                    <button class="icon-button" title="Retirer" on:click=move |_| steps.update(|s| s.retain(|x| x.id != step.id))><Icon name="trash"/></button>
                                </div>
                            </For>
                        </Show>
                    </div>
                </section>
            </div>
            <Preview key="subgoals"/>
        </div>
    }
}

#[derive(Clone)]
struct Goal {
    raw: Value,
    id: String,
    label: RwSignal<String>,
    target: RwSignal<f64>,
    source: RwSignal<String>,
}

fn goal_from(raw: Value) -> Goal {
    Goal {
        id: raw["id"].as_str().unwrap_or_default().to_string(),
        label: RwSignal::new(raw["label"].as_str().unwrap_or_default().to_string()),
        target: RwSignal::new(raw["targetCount"].as_f64().unwrap_or(100.0)),
        source: RwSignal::new(raw["sourceType"].as_str().unwrap_or("subs").to_string()),
        raw,
    }
}

fn new_goal_id() -> String {
    format!("goal-{}", js_sys::Date::now() as u64)
}

#[component]
pub fn GoalsEditor(on_back: Callback<()>) -> impl IntoView {
    let notices = notices();
    let goals = RwSignal::new(Vec::<Goal>::new());
    spawn_local(async move {
        let config = load("goals").await;
        goals.set(config["goals"].as_array().cloned().unwrap_or_default().into_iter().map(goal_from).collect());
    });

    let persist = move |_| {
        let list: Vec<Value> = goals.get_untracked().into_iter().map(|g| {
            let mut raw = g.raw.clone();
            raw["id"] = json!(g.id);
            raw["label"] = json!(g.label.get_untracked());
            raw["targetCount"] = json!(g.target.get_untracked());
            raw["sourceType"] = json!(g.source.get_untracked());
            raw
        }).collect();
        spawn_local(async move { save("goals", json!({ "goals": list }), "Goals enregistrés").await });
    };

    let add = move |_| {
        let css = goals.get_untracked().first().map(|g| g.raw.clone()).unwrap_or(json!({}));
        goals.update(|g| g.push(goal_from(json!({
            "id": new_goal_id(), "label": "Nouveau goal", "targetCount": 100, "sourceType": "subs",
            "customCSS": css["customCSS"], "currentTheme": css["currentTheme"]
        }))));
    };

    let copy_url = move |id: String| {
        spawn_local(async move {
            match call::<String>("goal_url", json!({ "id": id })).await {
                Ok(url) => copy_with(notices, url, "URL du goal copiée"),
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <Toolbar on_back back_label="Widgets" title="Goals">
            <button class="button" on:click=add><Icon name="plus"/>"Nouveau goal"</button>
            <button class="button primary" on:click=persist><Icon name="check"/>"Enregistrer"</button>
        </Toolbar>
        <div class="page-body columns">
            <section class="panel fill">
                <h2>"Goals"</h2>
                <p class="hint">"Pense à enregistrer avant de copier l'URL d'un nouveau goal."</p>
                <div class="list">
                    <Show when=move || !goals.get().is_empty() fallback=|| view! { <p class="empty">"Aucun goal."</p> }>
                        <For each=move || goals.get() key=|g| g.id.clone() let:goal>
                            <div class="row goal-row">
                                <input type="text" class="grow" placeholder="Libellé" bind:value=goal.label/>
                                <input type="number" class="narrow" min="1" prop:value=move || goal.target.get().to_string() on:input=move |e| goal.target.set(event_target_value(&e).parse().unwrap_or(1.0))/>
                                <select on:change=move |e| goal.source.set(event_target_value(&e))>
                                    <option value="subs" selected=move || goal.source.get() == "subs">"Subs"</option>
                                    <option value="followers" selected=move || goal.source.get() == "followers">"Followers"</option>
                                </select>
                                <button class="icon-button" title="Copier l'URL OBS de ce goal" on:click={ let id = goal.id.clone(); move |_| copy_url(id.clone()) }><Icon name="copy"/></button>
                                <ConfirmDelete on_confirm=Callback::new({ let id = goal.id.clone(); move |_| goals.update(|g| g.retain(|x| x.id != id)) })/>
                            </div>
                        </For>
                    </Show>
                </div>
            </section>
            <Preview key="goals"/>
        </div>
    }
}

#[derive(Clone)]
struct Choice {
    id: usize,
    text: RwSignal<String>,
}

#[component]
pub fn RouletteEditor(on_back: Callback<()>) -> impl IntoView {
    let notices = notices();
    let choices = RwSignal::new(Vec::<Choice>::new());
    let next_id = StoredValue::new(0usize);
    let make = move |text: String| {
        let id = next_id.get_value();
        next_id.set_value(id + 1);
        Choice { id, text: RwSignal::new(text) }
    };
    spawn_local(async move {
        let config = load("roulette").await;
        choices.set(config["choices"].as_array().into_iter().flatten().filter_map(|c| c.as_str().map(|s| make(s.to_string()))).collect());
    });

    let persist = move |_| {
        let list: Vec<String> = choices.get_untracked().iter().map(|c| c.text.get_untracked().trim().to_string()).filter(|c| !c.is_empty()).collect();
        spawn_local(async move { save("roulette", json!({ "choices": list }), "Roulette enregistrée").await });
    };
    let spin = move |_| {
        spawn_local(async move {
            match call0::<()>("roulette_spin").await {
                Ok(()) => notices.success("Roulette lancée"),
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <Toolbar on_back back_label="Widgets" title="Roulette">
            <button class="button success" on:click=spin><Icon name="play"/>"Lancer"</button>
            <button class="button primary" on:click=persist><Icon name="check"/>"Enregistrer"</button>
        </Toolbar>
        <div class="page-body columns">
            <section class="panel fill">
                <div class="panel-header">
                    <h2>"Choix " <span class="count">{move || choices.get().len()}</span></h2>
                    <button class="button small" on:click=move |_| choices.update(|c| c.push(make(String::new())))><Icon name="plus"/>"Ajouter un choix"</button>
                </div>
                <div class="list">
                    <Show when=move || !choices.get().is_empty() fallback=|| view! { <p class="empty">"Aucun choix."</p> }>
                        <For each=move || choices.get() key=|c| c.id let:choice>
                            <div class="row">
                                <input type="text" class="grow" placeholder="Choix" bind:value=choice.text/>
                                <button class="icon-button" title="Retirer" on:click=move |_| choices.update(|c| c.retain(|x| x.id != choice.id))><Icon name="trash"/></button>
                            </div>
                        </For>
                    </Show>
                </div>
            </section>
            <Preview key="roulette"/>
        </div>
    }
}
