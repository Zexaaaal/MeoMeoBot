use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
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

const DAYS_SHORT: [&str; 7] = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

fn time_options(current: &str) -> Vec<String> {
    let mut times: Vec<String> = (0..24).flat_map(|h| ["00", "15", "30", "45"].map(|m| format!("{h:02}:{m}"))).collect();
    if !current.is_empty() && !times.iter().any(|t| t == current) {
        times.push(current.to_string());
        times.sort();
    }
    times
}

#[component]
fn Segment(index: usize, date: String, planning: RwSignal<PlanningState>) -> impl IntoView {
    let notices = notices();
    let event = planning.get_untracked().events.get(&date).and_then(|list| list.get(index)).cloned().unwrap_or_default();
    let query = RwSignal::new(event.category.name.clone());
    let results = RwSignal::new(Vec::<Category>::new());
    let input = NodeRef::<leptos::html::Input>::new();
    let anchor = RwSignal::new(String::new());
    let generation = StoredValue::new(0u32);

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

    let on_query = move |e: leptos::ev::Event| {
        let q = event_target_value(&e);
        query.set(q.clone());
        let name = q.clone();
        u7(Box::new(move |x| x.category.name = name.clone()));
        generation.update_value(|g| *g += 1);
        let current = generation.get_value();
        if q.trim().chars().count() < 3 {
            results.set(Vec::new());
            return;
        }
        set_timeout(move || {
            if generation.get_value() != current {
                return;
            }
            spawn_local(async move {
                match call::<Vec<Category>>("category_search", json!({ "query": q })).await {
                    Ok(found) if generation.get_value() == current => {
                        if let Some(el) = input.get_untracked() {
                            let r = el.get_bounding_client_rect();
                            anchor.set(format!("top:{}px;left:{}px;width:{}px", r.bottom() + 4.0, r.left(), r.width()));
                        }
                        results.set(found)
                    }
                    Ok(_) => {}
                    Err(e) => notices.error(e),
                }
            });
        }, std::time::Duration::from_millis(300));
    };

    let pick = Callback::new(move |chosen: Category| {
        query.set(chosen.name.clone());
        results.set(Vec::new());
        let game = chosen.name.clone();
        let set = u4.clone();
        set(Box::new(move |x| { x.category = chosen.clone(); x.image_url = String::new(); }));
        spawn_local(async move {
            if let Ok(Some(url)) = call::<Option<String>>("steamgriddb_image", json!({ "game": game })).await {
                set(Box::new(move |x| x.image_url = url.clone()));
            }
        });
    });

    let remove = {
        let date = date.clone();
        Callback::new(move |_| planning.update(|p| { if let Some(list) = p.events.get_mut(&date) { if index < list.len() { list.remove(index); } } }))
    };

    let start = event.start_time.clone();
    let end = event.end_time.clone().unwrap_or_default();
    let (start_selected, end_selected) = (start.clone(), end.clone());

    view! {
        <div class="segment">
            <div class="segment-head">
                <strong>{format!("Stream {}", index + 1)}</strong>
                <span class="spacer"></span>
                <ConfirmDelete title="Retirer ce stream" on_confirm=remove/>
            </div>
            <div class="grid-2">
                <label class="field"><span>"Début"</span>
                    <select on:change=move |e| { let v = event_target_value(&e); u1(Box::new(move |x| x.start_time = v.clone())) }>
                        {time_options(&start).into_iter().map(|t| { let selected = t == start_selected; view! { <option value=t.clone() selected=selected>{t.clone()}</option> } }).collect_view()}
                    </select>
                </label>
                <label class="field"><span>"Fin"</span>
                    <select on:change=move |e| { let v = event_target_value(&e); u2(Box::new(move |x| x.end_time = (!v.is_empty()).then(|| v.clone()))) }>
                        <option value="" selected=end.is_empty()>"--:--"</option>
                        {time_options(&end).into_iter().map(|t| { let selected = t == end_selected; view! { <option value=t.clone() selected=selected>{t.clone()}</option> } }).collect_view()}
                    </select>
                </label>
            </div>
            <div class="game-search">
                <input type="text" node_ref=input placeholder="Jeu / catégorie…" prop:value=move || query.get() on:input=on_query
                    on:keydown=move |e| match e.key().as_str() {
                        "Escape" => results.set(Vec::new()),
                        "Enter" => if let Some(first) = results.get_untracked().into_iter().next() { pick.run(first) },
                        _ => {}
                    }/>
                <Show when=move || !results.get().is_empty()>
                    <div class="multiselect-backdrop" on:click=move |_| results.set(Vec::new())></div>
                    <div class="game-results" style=move || anchor.get()>
                        {move || results.get().into_iter().map(|category| {
                            let art = planning_render::box_art(&category.box_art_url, 300, 400);
                            let name = category.name.clone();
                            view! {
                                <button class="game-result" on:click=move |_| pick.run(category.clone())>
                                    <img src=art alt=""/>
                                    <span>{name}</span>
                                </button>
                            }
                        }).collect_view()}
                    </div>
                </Show>
            </div>
            <input type="text" placeholder="Titre du stream" prop:value=event.title.clone() on:input=move |e| { let v = event_target_value(&e); u3(Box::new(move |x| x.title = v.clone())) }/>
            <div class="form-inline">
                <label class="check"><input type="checkbox" prop:checked=event.use_miniature on:change=move |e| { let v = event_target_checked(&e); u5(Box::new(move |x| x.use_miniature = v)) }/><span>"Miniature"</span></label>
                <label class="check"><input type="checkbox" prop:checked=event.show_game_title on:change=move |e| { let v = event_target_checked(&e); u6(Box::new(move |x| x.show_game_title = v)) }/><span>"Nom du jeu"</span></label>
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
    let day = RwSignal::new(Local::now().date_naive().weekday().num_days_from_monday() as usize);
    let busy = RwSignal::new(false);
    let confirm_copy = RwSignal::new(false);
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

    let week_has_events = move || {
        let week = monday.get();
        planning.with(|p| (0..7).any(|o| p.events.get(&(week + Duration::days(o)).to_string()).is_some_and(|l| !l.is_empty())))
    };

    let copy_previous = move |_| {
        if week_has_events() && !confirm_copy.get_untracked() {
            confirm_copy.set(true);
            set_timeout(move || confirm_copy.set(false), std::time::Duration::from_secs(3));
            return;
        }
        confirm_copy.set(false);
        let week = monday.get_untracked();
        planning.update(|p| {
            for offset in 0..7 {
                let date = week + Duration::days(offset);
                let previous = p.events.get(&(date - Duration::days(7)).to_string()).cloned().unwrap_or_default();
                p.events.insert(date.to_string(), previous);
            }
        });
        notices.success("Semaine précédente copiée");
    };

    let selected_date = move || (monday.get() + Duration::days(day.get() as i64)).to_string();
    let day_count = Memo::new(move |_| {
        let key = selected_date();
        (key.clone(), planning.with(|p| p.events.get(&key).map(|l| l.len()).unwrap_or(0)))
    });
    let usual_start = move || planning.with_untracked(|p| p.events.values().flatten().last().map(|e| e.start_time.clone())).filter(|t| !t.is_empty()).unwrap_or_else(|| "20:00".into());
    let add_at = move |key: String, start: String| {
        planning.update(|p| p.events.entry(key).or_default().push(PlanningEvent { start_time: start, show_game_title: true, use_miniature: true, ..Default::default() }));
    };
    let add_event = move |_| add_at(selected_date(), usual_start());

    let on_canvas = move |e: leptos::ev::MouseEvent| {
        let Some(element) = canvas.get_untracked() else { return };
        let width = element.client_width() as f64;
        let height = element.client_height() as f64;
        if width <= 0.0 || height <= 0.0 {
            return;
        }
        let x = e.offset_x() as f64 * planning_render::WIDTH / width;
        let y = e.offset_y() as f64 * planning_render::HEIGHT / height;
        let state = planning.get_untracked();
        let Some((d, minutes)) = planning_render::hit(&state, x, y) else { return };
        day.set(d);
        let key = (monday.get_untracked() + Duration::days(d as i64)).to_string();
        let events = state.events.get(&key).cloned().unwrap_or_default();
        let occupied = planning_render::spans(&events).iter().any(|(_, start, end)| minutes >= *start && minutes < *end);
        if !occupied && state.align_hours {
            add_at(key, format!("{:02}:{:02}", minutes / 60, minutes % 60));
        }
    };

    view! {
        <div class="page-body planning-layout">
            <div class="stack">
                <section class="panel fill scroll">
                    <div class="day-tabs">
                        {move || planning_render::day_order(planning.get().start_sunday).into_iter().map(|d| {
                            let date = monday.get() + Duration::days(d as i64);
                            let has = planning.with(|p| p.events.get(&date.to_string()).is_some_and(|l| !l.is_empty()));
                            view! {
                                <button class="day-tab" class:active=move || day.get() == d class:has-events=has on:click=move |_| day.set(d)>
                                    <strong>{DAYS_SHORT[d]}</strong>
                                    <span>{date.format("%d.%m").to_string()}</span>
                                </button>
                            }
                        }).collect_view()}
                    </div>
                    <button class="button primary block" on:click=add_event><Icon name="plus"/>{move || format!("Ajouter un stream le {}", DAYS[day.get()].to_lowercase())}</button>
                    {move || {
                        let (key, count) = day_count.get();
                        if count == 0 {
                            view! { <p class="empty">"Aucun stream prévu ce jour."</p> }.into_any()
                        } else {
                            (0..count).map(|index| view! { <Segment index date=key.clone() planning/> }).collect_view().into_any()
                        }
                    }}
                </section>
            </div>
            <section class="panel fill">
                <div class="panel-header">
                    <div class="week-nav">
                        <button class="icon-button" title="Semaine précédente" on:click=move |_| monday.update(|m| *m -= Duration::days(7))><Icon name="chevronLeft"/></button>
                        <strong>{move || planning_render::date_range(monday.get(), planning.get().start_sunday)}</strong>
                        <button class="icon-button" title="Semaine suivante" on:click=move |_| monday.update(|m| *m += Duration::days(7))><Icon name="chevronRight"/></button>
                    </div>
                    <span class="spacer"></span>
                    <button class="button" class:danger=move || confirm_copy.get() title="Copier les streams de la semaine précédente" on:click=copy_previous><Icon name="copy"/>{move || if confirm_copy.get() { "Remplacer ?" } else { "Semaine préc." }}</button>
                    <button class="icon-button" disabled=move || busy.get() title="Charger le planning Twitch de cette semaine" on:click=twitch("planning_load_twitch", "Planning chargé depuis Twitch")><Icon name="download"/></button>
                    <button class="icon-button" disabled=move || busy.get() title="Envoyer cette semaine sur le planning Twitch" on:click=twitch("planning_sync_twitch", "Planning envoyé sur Twitch")><Icon name="upload"/></button>
                    <button class="icon-button" title="Exporter l'image" on:click=export><Icon name="image"/></button>
                    <button class="button primary" disabled=move || busy.get() on:click=publish>"Publier sur Discord"</button>
                </div>
                <div class="planning-stage">
                    <canvas class="planning-canvas" title="Cliquer sur un jour pour l'ouvrir, sur un créneau vide pour y ajouter un stream" node_ref=canvas on:click=on_canvas></canvas>
                </div>
            </section>
        </div>
    }
}
