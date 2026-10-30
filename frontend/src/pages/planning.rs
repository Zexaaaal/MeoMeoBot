use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
use crate::pages::alerts::{display_path, MediaPicker};
use crate::planning_render::{self, image_source, Images};
use crate::tauri::{call, call0};
use chrono::{Datelike, Duration, Local, NaiveDate};
use leptos::html::Canvas;
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{Category, PlanningEvent, PlanningState};
use std::collections::HashSet;
use wasm_bindgen::JsCast;
use web_sys::HtmlImageElement;

const DAYS: [&str; 7] = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

fn this_monday() -> NaiveDate {
    let today = Local::now().date_naive();
    today - Duration::days(today.weekday().num_days_from_monday() as i64)
}

async fn load_image(data_url: String) -> Option<HtmlImageElement> {
    let image = HtmlImageElement::new().ok()?;
    image.set_src(&data_url);
    wasm_bindgen_futures::JsFuture::from(image.decode()).await.ok()?;
    Some(image)
}

#[component]
fn EventEditor(index: usize, date: String, planning: RwSignal<PlanningState>) -> impl IntoView {
    let notices = notices();
    let event = planning.get_untracked().events.get(&date).and_then(|list| list.get(index)).cloned().unwrap_or_default();
    let query = RwSignal::new(event.category.name.clone());
    let results = RwSignal::new(Vec::<Category>::new());

    let update = {
        let date = date.clone();
        move |f: Box<dyn Fn(&mut PlanningEvent)>| {
            planning.update(|p| {
                if let Some(e) = p.events.get_mut(&date).and_then(|list| list.get_mut(index)) {
                    f(e);
                }
            });
        }
    };
    let (u1, u2, u3, u4, u5, u6, u7) = (update.clone(), update.clone(), update.clone(), update.clone(), update.clone(), update.clone(), update.clone());

    let pick_category = Callback::new(move |chosen: Category| {
        u4(Box::new(move |x| { x.category = chosen.clone(); x.image_url = String::new(); }));
    });

    let search = move || {
        let q = query.get_untracked();
        spawn_local(async move {
            match call::<Vec<Category>>("category_search", json!({ "query": q })).await {
                Ok(found) => results.set(found),
                Err(e) => notices.error(e),
            }
        });
    };

    let fetch_grid = move |_| {
        let game = query.get_untracked();
        let set = u7.clone();
        spawn_local(async move {
            match call::<Option<String>>("steamgriddb_image", json!({ "game": game })).await {
                Ok(Some(url)) => {
                    set(Box::new(move |e| { e.image_url = url.clone(); e.use_miniature = true; }));
                    notices.success("Image SteamGridDB ajoutée");
                }
                Ok(None) => notices.error("Aucune image trouvée sur SteamGridDB"),
                Err(e) => notices.error(e),
            }
        });
    };

    let remove = {
        let date = date.clone();
        Callback::new(move |_| planning.update(|p| { if let Some(list) = p.events.get_mut(&date) { if index < list.len() { list.remove(index); } } }))
    };

    view! {
        <div class="event-editor">
            <div class="grid-4">
                <label class="field"><span>"Début"</span><input type="time" prop:value=event.start_time.clone() on:input=move |e| { let v = event_target_value(&e); u1(Box::new(move |x| x.start_time = v.clone())) }/></label>
                <label class="field"><span>"Fin"</span><input type="time" prop:value=event.end_time.clone().unwrap_or_default() on:input=move |e| { let v = event_target_value(&e); u2(Box::new(move |x| x.end_time = (!v.is_empty()).then(|| v.clone()))) }/></label>
                <label class="field span-2"><span>"Titre"</span><input type="text" prop:value=event.title.clone() on:input=move |e| { let v = event_target_value(&e); u3(Box::new(move |x| x.title = v.clone())) }/></label>
            </div>
            <div class="form-inline">
                <label class="field grow"><span>"Catégorie Twitch"</span>
                    <input type="text" placeholder="Rechercher un jeu puis Entrée" bind:value=query on:keydown=move |e| if e.key() == "Enter" { search() }/>
                </label>
                <button class="button" on:click=move |_| search()>"Rechercher"</button>
                <button class="button" title="Remplacer la jaquette par une image SteamGridDB" on:click=fetch_grid>"Image SteamGridDB"</button>
            </div>
            <Show when=move || !results.get().is_empty()>
                <div class="search-results">
                    {move || results.get().into_iter().map(|category| {
                        let name = category.name.clone();
                        view! {
                            <button class="button small" on:click=move |_| {
                                query.set(category.name.clone());
                                results.set(Vec::new());
                                pick_category.run(category.clone());
                            }>{name}</button>
                        }
                    }).collect_view()}
                </div>
            </Show>
            <div class="form-inline">
                <label class="check"><input type="checkbox" prop:checked=event.use_miniature on:change=move |e| { let v = event_target_checked(&e); u5(Box::new(move |x| x.use_miniature = v)) }/><span>"Afficher l'image du jeu"</span></label>
                <label class="check"><input type="checkbox" prop:checked=event.show_game_title on:change=move |e| { let v = event_target_checked(&e); u6(Box::new(move |x| x.show_game_title = v)) }/><span>"Afficher le nom du jeu"</span></label>
                <span class="grow"></span>
                <ConfirmDelete title="Retirer ce stream" on_confirm=remove/>
            </div>
        </div>
    }
}

#[component]
pub fn PlanningPage() -> impl IntoView {
    let notices = notices();
    let planning = RwSignal::new(PlanningState::default());
    let loaded = RwSignal::new(false);
    let monday = RwSignal::new(this_monday());
    let busy = RwSignal::new(false);
    let images = StoredValue::new(Images::new());
    let canvas = NodeRef::<Canvas>::new();
    let save_generation = StoredValue::new(0u32);

    spawn_local(async move {
        if let Ok(state) = call0::<PlanningState>("planning_state").await {
            planning.set(state);
        }
        loaded.set(true);
    });

    let redraw = move || {
        if let Some(element) = canvas.get_untracked() {
            let element: web_sys::HtmlCanvasElement = element.unchecked_into();
            images.with_value(|imgs| planning_render::render(&element, &planning.get_untracked(), monday.get_untracked(), imgs));
        }
    };

    Effect::new(move |_| {
        let state = planning.get();
        let week = monday.get();
        if !loaded.get() {
            return;
        }
        let mut wanted: HashSet<String> = HashSet::new();
        if !state.background.is_empty() {
            wanted.insert(state.background.clone());
        }
        for offset in 0..7 {
            for event in state.events.get(&(week + Duration::days(offset)).to_string()).into_iter().flatten() {
                let source = image_source(event);
                if event.use_miniature && !source.is_empty() {
                    wanted.insert(source);
                }
            }
        }
        let missing: Vec<String> = images.with_value(|imgs| wanted.into_iter().filter(|s| !imgs.contains_key(s)).collect());
        redraw();
        if !missing.is_empty() {
            spawn_local(async move {
                for source in missing {
                    let Ok(data) = call::<String>("image_data_url", json!({ "source": source.clone() })).await else { continue };
                    if let Some(image) = load_image(data).await {
                        images.update_value(|imgs| { imgs.insert(source, image); });
                    }
                }
                redraw();
            });
        }

        save_generation.update_value(|g| *g += 1);
        let generation = save_generation.get_value();
        set_timeout(move || {
            if save_generation.get_value() == generation {
                let state = planning.get_untracked();
                spawn_local(async move { let _ = call::<()>("planning_save", json!({ "planning": state })).await; });
            }
        }, std::time::Duration::from_millis(600));
    });

    let snapshot = move || -> Option<String> {
        let element: web_sys::HtmlCanvasElement = canvas.get_untracked()?.unchecked_into();
        element.to_data_url_with_type_and_encoder_options("image/jpeg", &wasm_bindgen::JsValue::from_f64(0.9)).ok()
    };

    let twitch = move |cmd: &'static str, message: &'static str| move |_| {
        let week = monday.get_untracked();
        busy.set(true);
        spawn_local(async move {
            let _ = call::<()>("planning_save", json!({ "planning": planning.get_untracked() })).await;
            match call::<PlanningState>(cmd, json!({ "monday": week })).await {
                Ok(state) => {
                    planning.set(state);
                    notices.success(message);
                }
                Err(e) => notices.error(e),
            }
            busy.set(false);
        });
    };

    let export = move |_| {
        let Some(data) = snapshot() else { return };
        spawn_local(async move {
            match call::<bool>("planning_export", json!({ "dataUrl": data })).await {
                Ok(true) => notices.success("Image enregistrée"),
                Ok(false) => {}
                Err(e) => notices.error(e),
            }
        });
    };

    let publish = move |_| {
        let Some(data) = snapshot() else { return };
        let week = monday.get_untracked();
        busy.set(true);
        spawn_local(async move {
            let _ = call::<()>("planning_save", json!({ "planning": planning.get_untracked() })).await;
            match call::<()>("planning_publish", json!({ "monday": week, "dataUrl": data })).await {
                Ok(()) => {
                    if let Ok(state) = call0::<PlanningState>("planning_state").await {
                        planning.set(state);
                    }
                    notices.success("Planning publié sur Discord");
                }
                Err(e) => notices.error(e),
            }
            busy.set(false);
        });
    };

    let text_input = move |read: fn(&PlanningState) -> String, write: fn(&mut PlanningState, String)| view! {
        <input type="text" prop:value=move || read(&planning.get()) on:input=move |e| { let v = event_target_value(&e); planning.update(|p| write(p, v)) }/>
    };

    view! {
        <div class="page-body split">
            <section class="panel">
                <div class="week-nav">
                    <button class="icon-button" title="Semaine précédente" on:click=move |_| monday.update(|m| *m -= Duration::days(7))><Icon name="chevronLeft"/></button>
                    <strong>{move || planning_render::date_range(monday.get(), planning.get().start_sunday)}</strong>
                    <button class="icon-button" title="Semaine suivante" on:click=move |_| monday.update(|m| *m += Duration::days(7))><Icon name="chevronRight"/></button>
                </div>
                <div class="days">
                    {(0..7).map(|offset| view! { <Day offset monday planning/> }).collect_view()}
                </div>
            </section>
            <div class="stack">
                <section class="panel">
                    <div class="panel-header"><h2>"Aperçu"</h2></div>
                    <canvas class="planning-canvas" node_ref=canvas></canvas>
                </section>
                <section class="panel fill scroll">
                    <div class="grid-2">
                        <label class="field"><span>"Titre"</span>{text_input(|p| p.title.clone(), |p, v| p.title = v)}</label>
                        <MediaPicker label="Image de fond" kind="image" value=Signal::derive(move || display_path(&planning.get().background))
                            on_change=Callback::new(move |v: String| planning.update(|p| p.background = v.trim_start_matches("file://").to_string()))/>
                        <label class="field"><span>"Rôle Discord à mentionner"</span>{text_input(|p| p.role_id.clone(), |p, v| p.role_id = v)}</label>
                        <label class="field"><span>"Message Discord " <em class="hint">"{roleid}"</em></span>{text_input(|p| p.webhook_message.clone(), |p, v| p.webhook_message = v)}</label>
                    </div>
                    <div class="form-inline center-items">
                        <label class="check"><input type="checkbox" prop:checked=move || planning.get().compact on:change=move |e| planning.update(|p| p.compact = event_target_checked(&e))/><span>"Compact"</span></label>
                        <label class="check"><input type="checkbox" prop:checked=move || planning.get().start_sunday on:change=move |e| planning.update(|p| p.start_sunday = event_target_checked(&e))/><span>"Commencer le dimanche"</span></label>
                    </div>
                    <div class="panel-footer">
                        <button class="button" disabled=move || busy.get() on:click=twitch("planning_load_twitch", "Planning chargé depuis Twitch")><Icon name="download"/>"Charger de Twitch"</button>
                        <button class="button" disabled=move || busy.get() on:click=twitch("planning_sync_twitch", "Planning envoyé sur Twitch")><Icon name="refresh"/>"Envoyer sur Twitch"</button>
                        <span class="spacer"></span>
                        <button class="button" on:click=export>"Exporter"</button>
                        <button class="button primary" disabled=move || busy.get() on:click=publish>"Publier sur Discord"</button>
                    </div>
                </section>
            </div>
        </div>
    }
}

#[component]
fn Day(offset: usize, monday: RwSignal<NaiveDate>, planning: RwSignal<PlanningState>) -> impl IntoView {
    let date = move || monday.get() + Duration::days(offset as i64);
    let day_count = Memo::new(move |_| {
        let key = date().to_string();
        (key.clone(), planning.with(|p| p.events.get(&key).map(|l| l.len()).unwrap_or(0)))
    });
    let add_event = move |_| {
        let key = date().to_string();
        planning.update(|p| p.events.entry(key).or_default().push(PlanningEvent { start_time: "20:00".into(), show_game_title: true, ..Default::default() }));
    };
    view! {
        <div class="day">
            <div class="day-head">
                <strong>{DAYS[offset]}</strong>
                <span class="hint">{move || date().format("%d.%m").to_string()}</span>
                <button class="icon-button" title="Ajouter un stream" on:click=add_event><Icon name="plus"/></button>
            </div>
            {move || {
                let (key, count) = day_count.get();
                (0..count).map(|index| view! { <EventEditor index date=key.clone() planning/> }).collect_view()
            }}
        </div>
    }
}
