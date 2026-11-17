use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
use crate::tauri::{call, call0, listen};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{GiveawaySettings, GiveawayState};

#[component]
pub fn GiveawayPage() -> impl IntoView {
    let state = RwSignal::new(GiveawayState::default());
    let command = RwSignal::new(String::new());
    let start = RwSignal::new(String::new());
    let stop = RwSignal::new(String::new());
    let win = RwSignal::new(String::new());
    let notices = notices();

    let apply = move |next: GiveawayState| {
        command.set(next.settings.command.clone());
        start.set(next.settings.start_message.clone());
        stop.set(next.settings.stop_message.clone());
        win.set(next.settings.win_message.clone());
        state.set(next);
    };

    spawn_local(async move {
        if let Ok(next) = call0::<GiveawayState>("giveaway_state").await {
            apply(next);
        }
    });
    listen::<GiveawayState>(shared::events::GIVEAWAY, move |next| state.update(|s| s.participants = next.participants));

    let run = move |cmd: &'static str, success: Option<&'static str>| {
        spawn_local(async move {
            match call0::<GiveawayState>(cmd).await {
                Ok(next) => {
                    state.set(next);
                    if let Some(message) = success {
                        notices.success(message);
                    }
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let save = move |_| {
        let settings = GiveawaySettings { command: command.get_untracked(), start_message: start.get_untracked(), stop_message: stop.get_untracked(), win_message: win.get_untracked() };
        spawn_local(async move {
            match call::<GiveawayState>("giveaway_save_settings", json!({ "settings": settings })).await {
                Ok(next) => {
                    apply(next);
                    notices.success("Paramètres enregistrés");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <div class="page-body columns">
            <section class="panel fill">
                <div class="panel-header">
                    <h2>"Participants " <span class="count">{move || state.get().participants.len()}</span></h2>
                    <ConfirmDelete title="Vider la liste" on_confirm=Callback::new(move |_| run("giveaway_clear", Some("Liste vidée")))/>
                </div>
                <div class="winner" class:has-winner=move || state.get().winner.is_some()>
                    <Show when=move || state.get().winner.is_some() fallback=|| "Aucun gagnant tiré.">
                        <Icon name="trophy"/>{move || format!("Gagnant : {}", state.get().winner.unwrap_or_default())}
                    </Show>
                </div>
                <div class="list">
                    <Show when=move || !state.get().participants.is_empty() fallback=|| view! { <p class="empty">"Aucun participant pour le moment."</p> }>
                        <For each=move || state.get().participants key=|p| p.clone() let:name>
                            <div class="row">{name}</div>
                        </For>
                    </Show>
                </div>
            </section>
            <section class="panel fill">
                <h2>"Paramètres"</h2>
                <label class="field"><span>"Commande de participation"</span><input type="text" bind:value=command/></label>
                <label class="field"><span>"Message à l'ouverture"</span><textarea rows="4" bind:value=start></textarea></label>
                <label class="field"><span>"Message à la fermeture"</span><textarea rows="4" bind:value=stop></textarea></label>
                <label class="field"><span>"Message au gagnant " <em class="hint">"{winner} = nom du gagnant"</em></span><textarea rows="4" bind:value=win></textarea></label>
                <div class="panel-footer">
                    <Show when=move || state.get().active fallback=move || view! {
                        <button class="button success" on:click=move |_| run("giveaway_start", Some("Giveaway ouvert"))><Icon name="play"/>"Ouvrir le giveaway"</button>
                    }>
                        <button class="button danger" on:click=move |_| run("giveaway_stop", Some("Giveaway fermé"))><Icon name="close"/>"Fermer le giveaway"</button>
                    </Show>
                    <button class="button" on:click=move |_| run("giveaway_draw", None)><Icon name="trophy"/>"Tirer un gagnant"</button>
                    <span class="spacer"></span>
                    <button class="button primary" on:click=save><Icon name="check"/>"Enregistrer"</button>
                </div>
            </section>
        </div>
    }
}
