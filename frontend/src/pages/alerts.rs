use crate::components::notices;
use crate::icons::Icon;
use crate::tauri::{call, call0};
use crate::ui::{url_for, widget_urls, CopyLink};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{AlertSettings, ALERT_TYPES};
use std::collections::BTreeMap;

pub fn display_path(value: &str) -> String {
    value.trim_start_matches("file://").to_string()
}

#[component]
pub fn MediaPicker(label: &'static str, kind: &'static str, value: Signal<String>, on_change: Callback<String>) -> impl IntoView {
    let notices = notices();
    let placeholder = match kind { "audio" => "Choisir un son", "image" => "Choisir une image", "video" => "Choisir une vidéo", _ => "Choisir un fichier" };
    let pick = move |_| {
        spawn_local(async move {
            match call::<Option<String>>("pick_media_file", json!({ "kind": kind })).await {
                Ok(Some(path)) => on_change.run(path),
                Ok(None) => {}
                Err(e) => notices.error(e),
            }
        });
    };
    view! {
        <div class="field">
            {(!label.is_empty()).then(|| view! { <span>{label}</span> })}
            <div class="picker">
                <button class="picker-value" class:placeholder=move || value.get().is_empty() on:click=pick>
                    {move || { let v = value.get(); if v.is_empty() { placeholder.to_string() } else { display_path(&v) } }}
                </button>
                <Show when=move || !value.get().is_empty()>
                    <button class="icon-button" title="Retirer" on:click=move |_| on_change.run(String::new())><Icon name="close"/></button>
                </Show>
            </div>
        </div>
    }
}

#[component]
pub fn AlertsPage() -> impl IntoView {
    let settings = RwSignal::new(BTreeMap::<String, AlertSettings>::new());
    let current = RwSignal::new("follow".to_string());
    let alerts_url = RwSignal::new(String::new());
    let notices = notices();

    spawn_local(async move {
        if let Ok(loaded) = call0::<BTreeMap<String, AlertSettings>>("alerts_settings").await {
            settings.set(loaded);
        }
        alerts_url.set(url_for(&widget_urls().await, "alerts"));
    });

    let selected = move || settings.get().get(&current.get()).cloned().unwrap_or_default();
    let edit = move |f: Box<dyn Fn(&mut AlertSettings)>| {
        let kind = current.get_untracked();
        settings.update(|map| f(map.entry(kind).or_default()));
    };

    let save = move |_| {
        let values = settings.get_untracked();
        spawn_local(async move {
            match call::<()>("alerts_save", json!({ "settings": values })).await {
                Ok(()) => notices.success("Alertes enregistrées"),
                Err(e) => notices.error(e),
            }
        });
    };

    let test = move |_| {
        let kind = current.get_untracked();
        spawn_local(async move {
            if let Err(e) = call::<()>("alert_test", json!({ "kind": kind })).await {
                notices.error(e);
            }
        });
    };

    view! {
        <div class="page-body alerts-layout">
            <section class="panel">
                <div class="panel-header"><h2>"Événements"</h2></div>
                <div class="list">
                    {ALERT_TYPES.iter().map(|(kind, label, _)| {
                        let kind = kind.to_string();
                        let k1 = kind.clone();
                        let k2 = kind.clone();
                        let k3 = kind.clone();
                        view! {
                            <div class="row selectable" class:selected=move || current.get() == k1 on:click=move |_| current.set(k2.clone())>
                                <span class="grow">{*label}</span>
                                <input type="checkbox" title="Activer cette alerte"
                                    prop:checked=move || settings.get().get(&k3).map(|s| s.enabled).unwrap_or(true)
                                    on:click=|e| e.stop_propagation()
                                    on:change={
                                        let kind = kind.clone();
                                        move |e| { let on = event_target_checked(&e); let kind = kind.clone(); settings.update(|m| m.entry(kind).or_default().enabled = on) }
                                    }/>
                            </div>
                        }
                    }).collect_view()}
                </div>
            </section>
            <section class="panel">
                <div class="panel-header">
                    <h2>{move || ALERT_TYPES.iter().find(|(k, _, _)| *k == current.get()).map(|(_, l, _)| *l).unwrap_or_default()}</h2>
                    <button class="button" on:click=test><Icon name="play"/>"Tester"</button>
                    <button class="button primary" on:click=save><Icon name="check"/>"Enregistrer"</button>
                </div>
                <label class="field"><span>"Message " <em class="hint">"{username}, {amount}, {months}"</em></span>
                    <input type="text" prop:value=move || selected().text_template
                        on:input=move |e| { let v = event_target_value(&e); edit(Box::new(move |s| s.text_template = v.clone())) }/>
                </label>
                <MediaPicker label="Image ou vidéo" kind="image" value=Signal::derive(move || selected().image)
                    on_change=Callback::new(move |v: String| edit(Box::new(move |s| s.image = v.clone())))/>
                <MediaPicker label="Son" kind="audio" value=Signal::derive(move || selected().audio)
                    on_change=Callback::new(move |v: String| edit(Box::new(move |s| s.audio = v.clone())))/>
                <div class="grid-2">
                    <label class="field"><span>{move || format!("Volume : {} %", (selected().volume * 100.0).round())}</span>
                        <input type="range" min="0" max="1" step="0.05" prop:value=move || selected().volume.to_string()
                            on:input=move |e| { let v = event_target_value(&e).parse().unwrap_or(0.5); edit(Box::new(move |s| s.volume = v)) }/>
                    </label>
                    <label class="field"><span>"Durée (ms)"</span>
                        <input type="number" min="500" step="500" prop:value=move || selected().duration.to_string()
                            on:input=move |e| { let v = event_target_value(&e).parse().unwrap_or(5000); edit(Box::new(move |s| s.duration = v)) }/>
                    </label>
                </div>
                <label class="check">
                    <input type="checkbox" prop:checked=move || selected().is_vod
                        on:change=move |e| { let v = event_target_checked(&e); edit(Box::new(move |s| s.is_vod = v)) }/>
                    <span>"Son joué uniquement sur la source « rediff » (absent des VOD)"</span>
                </label>
            </section>
            <section class="panel">
                <div class="panel-header">
                    <h2>"Aperçu"</h2>
                    <div class="card-links">
                        <CopyLink label="Source OBS" url=Signal::derive(move || format!("{}?mode=main", alerts_url.get()))/>
                        <CopyLink label="Source rediff" url=Signal::derive(move || format!("{}?mode=vod-audio", alerts_url.get()))/>
                    </div>
                </div>
                <iframe class="preview fill" src=move || { let u = alerts_url.get(); if u.is_empty() { String::new() } else { format!("{u}?mode=preview") } }></iframe>
            </section>
        </div>
    }
}
