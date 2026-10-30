use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
use crate::tauri::{call, call0};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::ChatCommand;

async fn save(command: ChatCommand, previous: Option<String>) -> Result<Vec<ChatCommand>, String> {
    call("command_save", json!({ "command": command, "previous": previous })).await
}

#[component]
fn CommandRow(command: ChatCommand, list: RwSignal<Vec<ChatCommand>>) -> impl IntoView {
    let editing = RwSignal::new(false);
    let name = RwSignal::new(command.name.clone());
    let response = RwSignal::new(command.response.clone());
    let original = StoredValue::new(command);
    let notices = notices();

    let submit = move || {
        let previous = original.get_value().name;
        let updated = ChatCommand { name: name.get_untracked(), response: response.get_untracked() };
        spawn_local(async move {
            match save(updated, Some(previous)).await {
                Ok(commands) => {
                    list.set(commands);
                    notices.success("Commande modifiée");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let remove = Callback::new(move |_| {
        let target = original.get_value().name;
        spawn_local(async move {
            match call::<Vec<ChatCommand>>("command_remove", json!({ "name": target })).await {
                Ok(commands) => list.set(commands),
                Err(e) => notices.error(e),
            }
        });
    });

    view! {
        <div class="row command-row">
            <Show
                when=move || editing.get()
                fallback=move || view! {
                    <span class="command-name">{original.get_value().name}</span>
                    <span class="command-response">{original.get_value().response}</span>
                    <div class="row-actions">
                        <button class="icon-button" title="Modifier" on:click=move |_| editing.set(true)><Icon name="edit"/></button>
                        <ConfirmDelete on_confirm=remove/>
                    </div>
                }
            >
                <input type="text" bind:value=name/>
                <input type="text" bind:value=response on:keydown=move |e| if e.key() == "Enter" { submit() }/>
                <div class="row-actions">
                    <button class="icon-button" title="Enregistrer" on:click=move |_| submit()><Icon name="check"/></button>
                    <button class="icon-button" title="Annuler" on:click=move |_| editing.set(false)><Icon name="close"/></button>
                </div>
            </Show>
        </div>
    }
}

#[component]
pub fn CommandsPage() -> impl IntoView {
    let list = RwSignal::new(Vec::<ChatCommand>::new());
    let name = RwSignal::new(String::new());
    let response = RwSignal::new(String::new());
    let notices = notices();

    spawn_local(async move {
        match call0::<Vec<ChatCommand>>("commands_list").await {
            Ok(commands) => list.set(commands),
            Err(e) => notices.error(e),
        }
    });

    let add = move || {
        let command = ChatCommand { name: name.get_untracked(), response: response.get_untracked() };
        spawn_local(async move {
            match save(command, None).await {
                Ok(commands) => {
                    list.set(commands);
                    name.set(String::new());
                    response.set(String::new());
                    notices.success("Commande ajoutée");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <div class="page-body">
            <section class="panel">
                <div class="form-inline">
                    <label class="field field-command">
                        <span>"Commande"</span>
                        <input type="text" placeholder="!discord" bind:value=name/>
                    </label>
                    <label class="field grow">
                        <span>"Réponse du bot"</span>
                        <input type="text" placeholder="Rejoins le Discord : https://discord.gg/..." bind:value=response
                            on:keydown=move |e| if e.key() == "Enter" { add() }/>
                    </label>
                    <button class="button primary" on:click=move |_| add()><Icon name="plus"/>"Ajouter"</button>
                </div>
            </section>
            <section class="panel fill">
                <h2>"Commandes"</h2>
                <div class="list">
                    <Show when=move || !list.get().is_empty() fallback=|| view! { <p class="empty">"Aucune commande pour le moment."</p> }>
                        <For each=move || list.get() key=|c| (c.name.clone(), c.response.clone()) let:command>
                            <CommandRow command list/>
                        </For>
                    </Show>
                </div>
            </section>
        </div>
    }
}
