use crate::components::notices;
use crate::icons::Icon;
use crate::tauri::{call, call0};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{CastDevice, CastVideo};

#[component]
pub fn CastPage() -> impl IntoView {
    let notices = notices();
    let folder = RwSignal::new(None::<String>);
    let videos = RwSignal::new(Vec::<CastVideo>::new());
    let loading = RwSignal::new(false);
    let devices = RwSignal::new(Vec::<CastDevice>::new());
    let searching = RwSignal::new(false);
    let selected = RwSignal::new(None::<String>);
    let playing = RwSignal::new(None::<String>);

    let load = move |path: String| {
        folder.set(Some(path.clone()));
        loading.set(true);
        spawn_local(async move {
            videos.set(call::<Vec<CastVideo>>("cast_videos", json!({ "folder": path })).await.unwrap_or_default());
            loading.set(false);
        });
    };

    let discover = move || {
        searching.set(true);
        spawn_local(async move {
            match call0::<Vec<CastDevice>>("cast_discover").await {
                Ok(found) => {
                    if selected.get_untracked().is_none_or(|host| !found.iter().any(|d| d.host == host)) {
                        selected.set(found.first().map(|d| d.host.clone()));
                    }
                    devices.set(found);
                }
                Err(e) => notices.error(e),
            }
            searching.set(false);
        });
    };

    spawn_local(async move {
        if let Ok(Some(path)) = call0::<Option<String>>("cast_folder").await {
            load(path);
        }
    });
    discover();

    let pick_folder = move |_| {
        spawn_local(async move {
            match call0::<Option<String>>("cast_pick_folder").await {
                Ok(Some(path)) => load(path),
                Ok(None) => {}
                Err(e) => notices.error(e),
            }
        });
    };

    let play = move |video: CastVideo| {
        let Some(device) = selected.get_untracked().and_then(|host| devices.get_untracked().into_iter().find(|d| d.host == host)) else {
            notices.error("Choisis d'abord un appareil.");
            return;
        };
        spawn_local(async move {
            match call::<()>("cast_play", json!({ "device": device, "path": video.path })).await {
                Ok(()) => {
                    playing.set(Some(video.name));
                    notices.success("Lecture démarrée");
                }
                Err(e) => notices.error(format!("Impossible de lancer la vidéo : {e}")),
            }
        });
    };

    let stop = move |_| {
        spawn_local(async move {
            match call0::<()>("cast_stop").await {
                Ok(()) => {
                    playing.set(None);
                    notices.success("Diffusion arrêtée");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <div class="page-body sidebar-right">
            <section class="panel">
                <div class="panel-header">
                    <h2>"Vidéos"</h2>
                    <span class="hint folder-path">{move || folder.get().unwrap_or_default()}</span>
                    <button class="button" on:click=pick_folder><Icon name="folder"/>"Choisir un dossier"</button>
                </div>
                <div class="video-grid">
                    {move || {
                        if loading.get() {
                            view! { <p class="empty">"Chargement des vidéos…"</p> }.into_any()
                        } else if videos.get().is_empty() {
                            let message = if folder.get().is_some() { "Aucune vidéo dans ce dossier." } else { "Choisis un dossier contenant tes vidéos." };
                            view! { <p class="empty">{message}</p> }.into_any()
                        } else {
                            videos.get().into_iter().map(|video| {
                                let name = video.name.clone();
                                let is_playing = { let name = name.clone(); move || playing.get().as_deref() == Some(name.as_str()) };
                                let thumbnail = video.thumbnail.clone();
                                view! {
                                    <button class="video-card" class:active=is_playing on:click=move |_| play(video.clone())>
                                        {match thumbnail {
                                            Some(src) => view! { <img src=src alt=""/> }.into_any(),
                                            None => view! { <div class="video-placeholder"><Icon name="play"/></div> }.into_any(),
                                        }}
                                        <span class="video-title">{name}</span>
                                    </button>
                                }
                            }).collect_view().into_any()
                        }
                    }}
                </div>
            </section>
            <section class="panel">
                <div class="panel-header">
                    <h2>"Appareils"</h2>
                    <button class="button" disabled=move || searching.get() on:click=move |_| discover()><Icon name="refresh"/>{move || if searching.get() { "Recherche…" } else { "Rechercher" }}</button>
                </div>
                <div class="list">
                    {move || {
                        let found = devices.get();
                        if found.is_empty() {
                            let message = if searching.get() { "Recherche des appareils sur le réseau…" } else { "Aucun appareil trouvé." };
                            view! { <p class="empty">{message}</p> }.into_any()
                        } else {
                            found.into_iter().map(|device| {
                                let host = device.host.clone();
                                let checked = { let host = host.clone(); move || selected.get().as_deref() == Some(host.as_str()) };
                                let is_selected = checked.clone();
                                view! {
                                    <label class="device-row" class:selected=is_selected>
                                        <input type="radio" name="cast-device" prop:checked=checked on:change=move |_| selected.set(Some(host.clone()))/>
                                        <span class="grow">{device.name}</span>
                                        <span class="hint">{device.host}</span>
                                    </label>
                                }
                            }).collect_view().into_any()
                        }
                    }}
                </div>
                <button class="button danger block" disabled=move || playing.get().is_none() on:click=stop><Icon name="close"/>"Arrêter la diffusion"</button>
            </section>
        </div>
    }
}
