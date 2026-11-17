use crate::components::{notices, ConfirmDelete};
use crate::icons::Icon;
use crate::tauri::{call, call0};
use crate::ui::NumberField;
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::{json, Value};
use shared::{AutoMessage, ModerationState};

#[derive(Clone)]
struct DraftMessage {
    id: usize,
    message: RwSignal<String>,
    interval: RwSignal<u32>,
}

#[component]
pub fn ModerationPage() -> impl IntoView {
    let words = RwSignal::new(Vec::<String>::new());
    let new_word = RwSignal::new(String::new());
    let drafts = RwSignal::new(Vec::<DraftMessage>::new());
    let next_id = StoredValue::new(0usize);
    let cooldown = RwSignal::new(60u32);
    let notices = notices();

    let to_draft = move |m: AutoMessage| {
        let id = next_id.get_value();
        next_id.set_value(id + 1);
        DraftMessage { id, message: RwSignal::new(m.message), interval: RwSignal::new(m.interval) }
    };

    let apply = move |state: ModerationState| {
        words.set(state.banned_words);
        drafts.set(state.auto_messages.into_iter().map(to_draft).collect());
        cooldown.set(state.clip_cooldown);
    };

    spawn_local(async move {
        if let Ok(state) = call0::<ModerationState>("moderation_state").await {
            apply(state);
        }
    });

    let update_words = move |cmd: &'static str, args: Value, success: Option<String>| {
        spawn_local(async move {
            match call::<ModerationState>(cmd, args).await {
                Ok(state) => {
                    words.set(state.banned_words);
                    if let Some(message) = success {
                        notices.success(message);
                    }
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let add_word = move || {
        let word = new_word.get_untracked();
        new_word.set(String::new());
        update_words("banned_word_add", json!({ "word": word.clone() }), Some(format!("Mot ajouté : {word}")));
    };

    let save_messages = move |_| {
        let messages: Vec<AutoMessage> = drafts.get_untracked().iter()
            .map(|d| AutoMessage { message: d.message.get_untracked(), interval: d.interval.get_untracked() })
            .filter(|m| !m.message.trim().is_empty())
            .collect();
        spawn_local(async move {
            match call::<ModerationState>("auto_messages_save", json!({ "messages": messages })).await {
                Ok(state) => {
                    drafts.set(state.auto_messages.into_iter().map(to_draft).collect());
                    notices.success("Messages automatiques enregistrés");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    let save_cooldown = move |_| {
        let seconds = cooldown.get_untracked();
        spawn_local(async move {
            match call::<ModerationState>("clip_cooldown_save", json!({ "seconds": seconds })).await {
                Ok(state) => {
                    cooldown.set(state.clip_cooldown);
                    notices.success("Délai enregistré");
                }
                Err(e) => notices.error(e),
            }
        });
    };

    view! {
        <div class="page-body columns">
            <section class="panel fill">
                <div class="panel-header">
                    <h2>"Mots bannis"</h2>
                    <ConfirmDelete title="Vider la liste" on_confirm=Callback::new(move |_| update_words("banned_words_clear", json!({}), Some("Liste vidée".into())))/>
                </div>
                <div class="form-inline">
                    <label class="field grow"><span>"Mot ou expression"</span>
                        <input type="text" placeholder="Mot à bannir" bind:value=new_word on:keydown=move |e| if e.key() == "Enter" { add_word() }/>
                    </label>
                    <button class="button primary" on:click=move |_| add_word()><Icon name="plus"/>"Ajouter"</button>
                </div>
                <div class="list">
                    <Show when=move || !words.get().is_empty() fallback=|| view! { <p class="empty">"Aucun mot banni."</p> }>
                        <For each=move || words.get() key=|w| w.clone() let:word>
                            <div class="row">
                                <span class="grow">{word.clone()}</span>
                                <ConfirmDelete on_confirm=Callback::new(move |_| update_words("banned_word_remove", json!({ "word": word.clone() }), None))/>
                            </div>
                        </For>
                    </Show>
                </div>
            </section>
            <div class="stack">
                <section class="panel fill">
                    <div class="panel-header">
                        <h2>"Messages automatiques"</h2>
                        <div class="row-actions">
                            <button class="button small" on:click=move |_| drafts.update(|d| d.push(to_draft(AutoMessage { message: String::new(), interval: 40 })))><Icon name="plus"/>"Ajouter"</button>
                            <button class="button small primary" on:click=save_messages><Icon name="check"/>"Enregistrer"</button>
                        </div>
                    </div>
                    <div class="list">
                        <Show when=move || !drafts.get().is_empty() fallback=|| view! { <p class="empty">"Aucun message automatique."</p> }>
                            <For each=move || drafts.get() key=|d| d.id let:draft>
                                <div class="auto-message">
                                    <textarea rows="1" placeholder="Message à envoyer" bind:value=draft.message></textarea>
                                    <div class="auto-message-footer">
                                        <span class="hint">"Envoyé tous les"</span>
                                        <input type="number" min="1" prop:value=move || draft.interval.get().to_string()
                                            on:input=move |e| draft.interval.set(event_target_value(&e).parse().unwrap_or(40))/>
                                        <span class="hint">"messages du tchat"</span>
                                        <span class="spacer"></span>
                                        <button class="icon-button" title="Retirer" on:click=move |_| drafts.update(|d| d.retain(|x| x.id != draft.id))><Icon name="trash"/></button>
                                    </div>
                                </div>
                            </For>
                        </Show>
                    </div>
                </section>
                <section class="panel">
                    <h2>"Commande !clip"</h2>
                    <div class="form-inline">
                        <NumberField label="Délai entre deux clips (secondes)" value=cooldown min=10/>
                        <button class="button primary" on:click=save_cooldown><Icon name="check"/>"Enregistrer"</button>
                    </div>
                </section>
            </div>
        </div>
    }
}
