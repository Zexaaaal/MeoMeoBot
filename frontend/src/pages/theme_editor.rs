use crate::components::{notices, ConfirmDelete, Toolbar};
use crate::icons::Icon;
use crate::tauri::{call, call0};
use crate::theme_builder::{self, Prop, Section, Values};
use leptos::html::Iframe;
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::{json, Value};
use shared::{ThemeEditorState, ThemeInfo};

pub fn widget_label(widget: &str) -> &'static str {
    match widget {
        "chat" => "Tchat",
        "spotify" => "Spotify",
        "subgoals" => "Subgoals",
        "subgoals-list" => "Liste des subgoals",
        "goals" => "Goals",
        "roulette" => "Roulette",
        "alerts" => "Alertes",
        "emote-wall" => "Mur d'emotes",
        _ => "Widget",
    }
}

fn split_color(value: &str) -> (String, f64) {
    let v = value.trim();
    if let Some(inner) = v.strip_prefix("rgba(").or_else(|| v.strip_prefix("rgb(")).and_then(|r| r.strip_suffix(')')) {
        let parts: Vec<f64> = inner.split(',').filter_map(|p| p.trim().parse().ok()).collect();
        if parts.len() >= 3 {
            return (format!("#{:02x}{:02x}{:02x}", parts[0] as u8, parts[1] as u8, parts[2] as u8), parts.get(3).copied().unwrap_or(1.0));
        }
    }
    if v.starts_with('#') && v.len() == 9 {
        let alpha = u8::from_str_radix(&v[7..9], 16).map(|a| a as f64 / 255.0).unwrap_or(1.0);
        return (v[..7].to_string(), alpha);
    }
    if v.starts_with('#') && v.len() == 7 {
        return (v.to_string(), 1.0);
    }
    ("#000000".into(), 1.0)
}

fn join_color(hex: &str, alpha: f64) -> String {
    let channel = |i: usize| u8::from_str_radix(hex.get(i..i + 2).unwrap_or("00"), 16).unwrap_or(0);
    format!("rgba({}, {}, {}, {})", channel(1), channel(3), channel(5), (alpha * 100.0).round() / 100.0)
}

#[component]
fn Control(prop: Prop, section: Section, values: RwSignal<Values>, fonts: RwSignal<Vec<String>>, on_change: Callback<()>) -> impl IntoView {
    let key = theme_builder::value_key(&section, &prop.key);
    let current = {
        let key = key.clone();
        move || values.get().get(&key).cloned().unwrap_or(Value::Null)
    };
    let set = {
        let key = key.clone();
        move |value: Value| {
            values.update(|v| {
                v.insert(key.clone(), value);
            });
            on_change.run(());
        }
    };

    let input = match prop.kind.as_str() {
        "slider" | "blur" => {
            let (min, max, step) = (prop.min.unwrap_or(0.0), prop.max.unwrap_or(100.0), prop.step.unwrap_or(1.0));
            let unit = prop.unit.clone().unwrap_or_else(|| if prop.kind == "blur" { "px".into() } else { String::new() });
            let shown = current.clone();
            view! {
                <div class="control-row">
                    <input type="range" min=min max=max step=step prop:value=move || theme_builder::text(&current())
                        on:input=move |e| set(json!(event_target_value(&e).parse::<f64>().unwrap_or(min)))/>
                    <span class="hint value">{move || format!("{}{unit}", theme_builder::text(&shown()))}</span>
                </div>
            }.into_any()
        }
        "color" => view! {
            <input type="color" class="color" prop:value=move || split_color(&theme_builder::text(&current())).0
                on:input=move |e| set(json!(event_target_value(&e)))/>
        }.into_any(),
        "color-alpha" => {
            let read = current.clone();
            let set_hex = set.clone();
            let read_alpha = current.clone();
            let alpha_source = current.clone();
            view! {
                <div class="control-row">
                    <input type="color" class="color" prop:value=move || split_color(&theme_builder::text(&read())).0
                        on:input=move |e| { let alpha = split_color(&theme_builder::text(&current())).1; set_hex(json!(join_color(&event_target_value(&e), alpha))) }/>
                    <input type="range" min="0" max="1" step="0.05" title="Opacité" prop:value=move || split_color(&theme_builder::text(&read_alpha())).1.to_string()
                        on:input=move |e| { let hex = split_color(&theme_builder::text(&alpha_source())).0; set(json!(join_color(&hex, event_target_value(&e).parse().unwrap_or(1.0)))) }/>
                </div>
            }.into_any()
        }
        "select" => {
            let options = prop.options.clone().unwrap_or_default();
            view! {
                <select on:change=move |e| set(json!(event_target_value(&e)))>
                    {options.into_iter().map(|o| {
                        let value = o.value.clone();
                        let current = current.clone();
                        view! { <option value=o.value.clone() selected=move || theme_builder::text(&current()) == value>{o.label}</option> }
                    }).collect_view()}
                </select>
            }.into_any()
        }
        "font" => view! {
            <select on:change=move |e| set(json!(event_target_value(&e)))>
                <option value="sans-serif">"Par défaut"</option>
                {move || fonts.get().into_iter().map(|name| {
                    let value = if name.contains(' ') { format!("'{name}', sans-serif") } else { format!("{name}, sans-serif") };
                    let selected = theme_builder::text(&current()) == value;
                    view! { <option value=value.clone() selected=selected>{name}</option> }
                }).collect_view()}
            </select>
        }.into_any(),
        "toggle" => view! {
            <input type="checkbox" prop:checked=move || current() == Value::Bool(true) on:change=move |e| set(json!(event_target_checked(&e)))/>
        }.into_any(),
        _ => view! {
            <input type="text" prop:value=move || theme_builder::text(&current()) on:change=move |e| set(json!(event_target_value(&e)))/>
        }.into_any(),
    };

    let user_color = prop.use_user_color.then(|| {
        let section = section.clone();
        let section_read = section.clone();
        view! {
            <label class="check small">
                <input type="checkbox" prop:checked=move || theme_builder::uses_user_color(&values.get(), &section_read)
                    on:change=move |e| { let on = event_target_checked(&e); values.update(|v| theme_builder::set_user_color(v, &section, on)); on_change.run(()) }/>
                <span>"Couleur du pseudo"</span>
            </label>
        }
    });

    view! {
        <div class="builder-control">
            <span>{prop.label.clone()}</span>
            {input}
            {user_color}
        </div>
    }
}

#[component]
pub fn ThemeEditor(widget: &'static str, on_back: Callback<()>) -> impl IntoView {
    let notices = notices();
    let state = RwSignal::new(ThemeEditorState::default());
    let selected = RwSignal::new(String::new());
    let base_css = RwSignal::new(String::new());
    let base_values = RwSignal::new(Values::new());
    let values = RwSignal::new(Values::new());
    let css = RwSignal::new(String::new());
    let visual = RwSignal::new(theme_builder::schema(widget).is_some());
    let fonts = RwSignal::new(Vec::<String>::new());
    let new_name = RwSignal::new(String::new());
    let rename = RwSignal::new(None::<String>);
    let frame = NodeRef::<Iframe>::new();

    let push_preview = move || {
        if let Some(window) = frame.get_untracked().and_then(|f| f.content_window()) {
            let message = serde_wasm_bindgen::to_value(&json!({ "type": "preview-css", "css": css.get_untracked() }))
                .unwrap_or(wasm_bindgen::JsValue::NULL);
            let _ = window.post_message(&message, "*");
        }
    };
    Effect::new(move |_| {
        css.track();
        push_preview();
    });

    let load_base = move |file: String, keep_css: Option<String>| {
        spawn_local(async move {
            let content = if file.is_empty() { String::new() } else { call::<String>("theme_content", json!({ "file": file })).await.unwrap_or_default() };
            base_values.set(theme_builder::parse(&content, widget));
            let current = keep_css.unwrap_or_else(|| content.clone());
            values.set(theme_builder::parse(&current, widget));
            base_css.set(content);
            css.set(current);
        });
    };

    let reload = move |select: Option<String>| {
        spawn_local(async move {
            match call::<ThemeEditorState>("theme_editor", json!({ "widget": widget })).await {
                Ok(next) => {
                    let theme = select.unwrap_or_else(|| next.current_theme.clone());
                    let keep = (theme == next.current_theme).then(|| next.css.clone());
                    selected.set(theme.clone());
                    state.set(next);
                    load_base(theme, keep);
                }
                Err(e) => notices.error(e),
            }
        });
    };
    reload(None);
    spawn_local(async move { fonts.set(call0("system_fonts").await.unwrap_or_default()) });

    let regenerate = Callback::new(move |_| {
        css.set(theme_builder::generate(widget, &values.get_untracked(), &base_css.get_untracked(), &base_values.get_untracked()));
    });

    let apply = move |theme: String, value: String, message: &'static str| {
        spawn_local(async move {
            match call::<ThemeEditorState>("theme_apply", json!({ "widget": widget, "theme": theme.clone(), "css": value.clone() })).await {
                Ok(next) => {
                    state.set(next);
                    if theme == selected.get_untracked() {
                        base_values.set(theme_builder::parse(&value, widget));
                        base_css.set(value);
                    }
                    notices.success(message);
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let reset = move |_| {
        let file = selected.get_untracked();
        spawn_local(async move {
            match call::<ThemeEditorState>("theme_reset", json!({ "widget": widget, "file": file.clone() })).await {
                Ok(next) => {
                    state.set(next);
                    load_base(file, None);
                    notices.success("Thème d'origine restauré");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let dirty = move || css.get() != base_css.get();

    let save_as = move |_| {
        let name = new_name.get_untracked();
        if name.trim().is_empty() {
            notices.error("Donne un nom au thème.");
            return;
        }
        let value = css.get_untracked();
        spawn_local(async move {
            match call::<ThemeEditorState>("theme_create", json!({ "widget": widget, "name": name, "css": value })).await {
                Ok(next) => {
                    new_name.set(String::new());
                    let theme = next.current_theme.clone();
                    selected.set(theme.clone());
                    state.set(next);
                    load_base(theme, None);
                    notices.success("Thème créé et appliqué");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let import = move |_| {
        spawn_local(async move {
            match call::<Option<String>>("theme_import", json!({ "widget": widget })).await {
                Ok(Some(file)) => {
                    reload(Some(file));
                    notices.success("Thème importé");
                }
                Ok(None) => {}
                Err(e) => notices.error(e),
            }
        });
    };

    let selected_info = move || state.get().themes.into_iter().find(|t| t.id == selected.get());
    let is_user_theme = move || selected_info().map(|t| !t.builtin).unwrap_or(false);
    let is_modified_builtin = move || selected_info().map(|t| t.builtin && t.modified).unwrap_or(false);

    view! {
        <Toolbar on_back back_label="Widgets" title=widget_label(widget)>
            <Show when=dirty>
                <span class="hint">"Modifications non enregistrées"</span>
            </Show>
            <button class="button" on:click=move |_| apply(String::new(), String::new(), "Widget remis sans thème")>"Retirer le thème"</button>
            <button class="button primary" on:click=move |_| apply(selected.get_untracked(), css.get_untracked(), "Thème enregistré et appliqué")><Icon name="check"/>"Enregistrer et appliquer"</button>
        </Toolbar>
        <div class="page-body theme-layout">
            <div class="stack">
                <section class="panel">
                    <div class="form-inline">
                        <label class="field grow"><span>"Thème de base"</span>
                            <select on:change=move |e| { let file = event_target_value(&e); selected.set(file.clone()); load_base(file, None) }>
                                <option value="" selected=move || selected.get().is_empty()>"Aucun"</option>
                                {move || state.get().themes.into_iter().map(|t: ThemeInfo| {
                                    let id = t.id.clone();
                                    let label = match (t.builtin, t.modified) {
                                        (true, true) => format!("{} (modifié)", t.name),
                                        (true, false) => t.name,
                                        (false, _) => format!("{} (perso)", t.name),
                                    };
                                    view! { <option value=t.id.clone() selected=move || selected.get() == id>{label}</option> }
                                }).collect_view()}
                            </select>
                        </label>
                        <button class="button" on:click=import><Icon name="plus"/>"Importer"</button>
                    </div>
                    <Show when=is_modified_builtin>
                        <div class="form-inline">
                            <span class="hint grow">"Tes modifications de ce thème intégré sont conservées, même en changeant de thème."</span>
                            <button class="button small" on:click=reset><Icon name="refresh"/>"Restaurer l'original"</button>
                        </div>
                    </Show>
                    <Show when=is_user_theme>
                        <div class="form-inline">
                            <Show when=move || rename.get().is_some() fallback=move || view! {
                                <button class="button small" on:click=move |_| rename.set(selected_info().map(|t| t.name))><Icon name="edit"/>"Renommer"</button>
                            }>
                                <input type="text" class="grow" prop:value=move || rename.get().unwrap_or_default() on:input=move |e| rename.set(Some(event_target_value(&e)))/>
                                <button class="button small primary" on:click=move |_| {
                                    let name = rename.get_untracked().unwrap_or_default();
                                    let file = selected.get_untracked();
                                    rename.set(None);
                                    spawn_local(async move {
                                        match call::<ThemeEditorState>("theme_rename", json!({ "widget": widget, "file": file, "name": name })).await {
                                            Ok(next) => state.set(next),
                                            Err(e) => notices.error(e),
                                        }
                                    });
                                }><Icon name="check"/>"Renommer"</button>
                            </Show>
                            <ConfirmDelete title="Supprimer ce thème" on_confirm=Callback::new(move |_| {
                                let file = selected.get_untracked();
                                spawn_local(async move {
                                    match call::<ThemeEditorState>("theme_delete", json!({ "widget": widget, "file": file })).await {
                                        Ok(_) => { reload(Some(String::new())); notices.success("Thème supprimé"); }
                                        Err(e) => notices.error(e),
                                    }
                                });
                            })/>
                        </div>
                    </Show>
                    <div class="form-inline">
                        <input type="text" class="grow" placeholder="Nom du nouveau thème" bind:value=new_name/>
                        <button class="button" on:click=save_as><Icon name="plus"/>"Enregistrer comme nouveau thème"</button>
                    </div>
                </section>
                <section class="panel fill">
                    <Show when=move || theme_builder::schema(widget).is_some()>
                        <div class="tabs inline">
                            <button class="tab" class:active=move || visual.get() on:click=move |_| { values.set(theme_builder::parse(&css.get_untracked(), widget)); visual.set(true) }>"Réglages"</button>
                            <button class="tab" class:active=move || !visual.get() on:click=move |_| visual.set(false)>"CSS"</button>
                        </div>
                    </Show>
                    <Show when=move || visual.get() fallback=move || view! {
                        <textarea class="css-editor" spellcheck="false" prop:value=move || css.get() on:input=move |e| css.set(event_target_value(&e))></textarea>
                    }>
                        <div class="builder">
                            {theme_builder::schema(widget).cloned().unwrap_or_default().into_iter().map(|section| view! {
                                <details class="builder-section">
                                    <summary>{section.label.clone()}</summary>
                                    {section.props.iter().cloned().map(|prop| {
                                        let section = section.clone();
                                        view! { <Control prop section values fonts on_change=regenerate/> }
                                    }).collect_view()}
                                </details>
                            }).collect_view()}
                        </div>
                    </Show>
                </section>
            </div>
            <section class="panel fill">
                <h2>"Aperçu"</h2>
                <iframe class="preview tall" node_ref=frame src=move || state.get().preview_url on:load=move |_| push_preview()></iframe>
            </section>
        </div>
    }
}
