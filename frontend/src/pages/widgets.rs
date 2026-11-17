use crate::components::notices;
use crate::icons::Icon;
use crate::pages::theme_editor::ThemeEditor;
use crate::pages::widget_editors::{GoalsPanel, RouletteEditor, SubgoalsEditor};
use crate::tauri::{call, call0, listen};
use crate::ui::{url_for, widget_urls, Checkbox, CopyUrl, MultiSelect, NumberField};
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{WidgetSettings, WidgetUrl};
use std::collections::BTreeMap;

#[derive(Clone, Copy, PartialEq)]
enum View {
    List,
    Theme(&'static str),
    Subgoals,
    Roulette,
}

#[component]
fn Actions(view: RwSignal<View>, #[prop(optional)] configure: Option<View>, #[prop(optional)] themes: &'static [&'static str]) -> impl IntoView {
    view! {
        <div class="card-actions">
            {configure.map(|target| view! { <button class="button small" on:click=move |_| view.set(target)><Icon name="settings"/>"Configurer"</button> })}
            {themes.iter().map(|widget| {
                let label = if themes.len() > 1 && *widget == "subgoals-list" { "Thèmes liste" } else { "Thèmes" };
                view! { <button class="button small" on:click=move |_| view.set(View::Theme(widget))><Icon name="star"/>{label}</button> }
            }).collect_view()}
        </div>
    }
}

#[component]
pub fn WidgetsPage() -> impl IntoView {
    let view = RwSignal::new(View::List);
    let selected = RwSignal::new("chat");
    let back = Callback::new(move |_| view.set(View::List));
    move || match view.get() {
        View::List => view! { <WidgetList view selected/> }.into_any(),
        View::Theme(widget) => view! { <ThemeEditor widget on_back=back/> }.into_any(),
        View::Subgoals => view! { <SubgoalsEditor on_back=back/> }.into_any(),
        View::Roulette => view! { <RouletteEditor on_back=back/> }.into_any(),
    }
}

#[component]
fn WidgetList(view: RwSignal<View>, selected: RwSignal<&'static str>) -> impl IntoView {
    let urls = RwSignal::new(Vec::<WidgetUrl>::new());
    let labels = RwSignal::new(Vec::<(String, String)>::new());
    let badges = RwSignal::new(BTreeMap::<String, RwSignal<bool>>::new());
    let max_messages = RwSignal::new(10u32);
    let daily_goal = RwSignal::new(10u32);
    let count_regular = RwSignal::new(true);
    let count_gifts = RwSignal::new(false);
    let min_size = RwSignal::new(32u32);
    let max_size = RwSignal::new(96u32);
    let spawn_interval = RwSignal::new(100u32);
    let duration = RwSignal::new(5000u32);
    let notices = notices();
    let loaded = RwSignal::new(false);
    let save_generation = StoredValue::new(0u32);
    let preview_version = RwSignal::new(0u32);

    let load_urls = move || spawn_local(async move { urls.set(widget_urls().await) });
    load_urls();
    listen::<()>(shared::events::WIDGET_URLS, move |_| load_urls());

    spawn_local(async move {
        labels.set(call0("badge_labels").await.unwrap_or_default());
        if let Ok(s) = call0::<WidgetSettings>("widget_settings").await {
            badges.set(s.badge_prefs.into_iter().map(|(k, v)| (k, RwSignal::new(v))).collect());
            max_messages.set(s.chat_max_messages);
            daily_goal.set(s.daily_goal);
            count_regular.set(s.count_regular_subs);
            count_gifts.set(s.count_gift_subs);
            min_size.set(s.emote_min_size);
            max_size.set(s.emote_max_size);
            spawn_interval.set(s.emote_spawn_interval);
            duration.set(s.emote_duration);
        }
        loaded.set(true);
    });

    Effect::new(move |_| {
        let settings = WidgetSettings {
            chat_max_messages: max_messages.get(),
            badge_prefs: badges.get().into_iter().map(|(k, v)| (k, v.get())).collect(),
            daily_goal: daily_goal.get(),
            count_regular_subs: count_regular.get(),
            count_gift_subs: count_gifts.get(),
            emote_min_size: min_size.get(),
            emote_max_size: max_size.get(),
            emote_spawn_interval: spawn_interval.get(),
            emote_duration: duration.get(),
        };
        if !loaded.get() {
            return;
        }
        save_generation.update_value(|g| *g += 1);
        let generation = save_generation.get_value();
        set_timeout(move || {
            if save_generation.get_value() == generation {
                spawn_local(async move {
                    match call::<()>("widget_settings_save", json!({ "settings": settings })).await {
                        Ok(()) => preview_version.update(|v| *v += 1),
                        Err(e) => notices.error(e),
                    }
                });
            }
        }, std::time::Duration::from_millis(600));
    });

    let simple = move |cmd: &'static str, success: &'static str| move |_| {
        spawn_local(async move {
            match call0::<()>(cmd).await {
                Ok(()) => notices.success(success),
                Err(e) => notices.error(e),
            }
        });
    };

    let badge_items = Signal::derive(move || {
        let current = badges.get();
        labels.get().into_iter().filter_map(|(id, label)| current.get(&id).copied().map(|value| (label, value))).collect::<Vec<_>>()
    });

    let preview = move |key: &'static str| move || {
        let url = url_for(&urls.get(), key);
        if url.is_empty() { String::new() } else { format!("{url}?mode=preview&v={}", preview_version.get()) }
    };

    let nav_item = move |key: &'static str, label: &'static str| view! {
        <button class="widget-nav-item" class:active=move || selected.get() == key on:click=move |_| selected.set(key)>{label}</button>
    };

    let detail = move || match selected.get() {
        "emoteWall" => view! {
            <div class="panel-header">
                <CopyUrl urls key="emoteWall" label="Mur d'emotes"/>
                <span class="spacer"></span>
                <Actions view themes=&["emote-wall"]/>
            </div>
            <div class="grid-4">
                <NumberField label="Min (px)" value=min_size min=8/>
                <NumberField label="Max (px)" value=max_size min=8/>
                <NumberField label="Intervalle" value=spawn_interval min=10/>
                <NumberField label="Durée" value=duration min=500/>
            </div>
            <iframe class="preview fill" src=preview("emoteWall")></iframe>
        }.into_any(),
        "dailySubs" => view! {
            <div class="panel-header">
                <CopyUrl urls key="dailySubs" label="Daily Subs"/>
            </div>
            <div class="form-inline center-items">
                <NumberField label="Objectif" value=daily_goal min=1/>
                <Checkbox label="Subs".into() value=count_regular/>
                <Checkbox label="Subs offerts".into() value=count_gifts/>
            </div>
            <iframe class="preview fill" src=preview("dailySubs")></iframe>
        }.into_any(),
        "subgoals" => view! {
            <div class="panel-header">
                <CopyUrl urls key="subgoals" label="Subgoals"/>
                <span class="spacer"></span>
                <Actions view configure=View::Subgoals themes=&["subgoals", "subgoals-list"]/>
            </div>
            <div class="card-links"><CopyUrl urls key="subgoalsList" label="Liste des paliers"/></div>
            <iframe class="preview fill" src=preview("subgoals")></iframe>
            <iframe class="preview fill" src=preview("subgoalsList")></iframe>
        }.into_any(),
        "goals" => view! { <GoalsPanel on_themes=Callback::new(move |_| view.set(View::Theme("goals")))/> }.into_any(),
        "alerts" => view! {
            <div class="panel-header">
                <CopyUrl urls key="alerts" label="Alertes"/>
                <span class="spacer"></span>
                <Actions view themes=&["alerts"]/>
            </div>
            <p class="hint">"Les alertes se règlent dans l'onglet Alertes, où tu peux aussi les tester."</p>
            <iframe class="preview fill" src=preview("alerts")></iframe>
        }.into_any(),
        "spotify" => view! {
            <div class="panel-header">
                <CopyUrl urls key="spotify" label="Spotify"/>
                <span class="spacer"></span>
                <Actions view themes=&["spotify"]/>
            </div>
            <iframe class="preview fill" src=preview("spotify")></iframe>
        }.into_any(),
        "events" => view! {
            <div class="panel-header">
                <h2>"Derniers événements"</h2>
            </div>
            <div class="event-previews">
                <div class="event-preview"><CopyUrl urls key="lastSub" label="Dernier sub"/><iframe class="preview fill" src=preview("lastSub")></iframe></div>
                <div class="event-preview"><CopyUrl urls key="lastFollow" label="Dernier follow"/><iframe class="preview fill" src=preview("lastFollow")></iframe></div>
                <div class="event-preview"><CopyUrl urls key="lastDonation" label="Dernier don"/><iframe class="preview fill" src=preview("lastDonation")></iframe></div>
            </div>
        }.into_any(),
        "roulette" => view! {
            <div class="panel-header">
                <CopyUrl urls key="roulette" label="Roulette"/>
                <span class="spacer"></span>
                <div class="card-actions">
                    <button class="button small success" on:click=simple("roulette_spin", "Roulette lancée")><Icon name="play"/>"Lancer"</button>
                    <button class="button small" on:click=move |_| view.set(View::Roulette)><Icon name="settings"/>"Configurer"</button>
                    <button class="button small" on:click=move |_| view.set(View::Theme("roulette"))><Icon name="star"/>"Thèmes"</button>
                </div>
            </div>
            <iframe class="preview fill" src=preview("roulette")></iframe>
        }.into_any(),
        _ => view! {
            <div class="panel-header">
                <CopyUrl urls key="chat" label="Tchat"/>
                <span class="spacer"></span>
                <Actions view themes=&["chat"]/>
            </div>
            <div class="grid-2">
                <label class="field"><span>"Messages max"</span>
                    <input type="number" min="1" prop:value=move || max_messages.get().to_string() on:input=move |e| max_messages.set(event_target_value(&e).parse().unwrap_or(1))/>
                </label>
                <MultiSelect label="Badges affichés" items=badge_items/>
            </div>
            <iframe class="preview fill" src=preview("chat")></iframe>
        }.into_any(),
    };

    view! {
        <div class="page-body widgets-layout">
            <nav class="panel widget-nav">
                <span class="widget-nav-group">"Tchat"</span>
                {nav_item("chat", "Tchat")}
                {nav_item("emoteWall", "Mur d'emotes")}
                <span class="widget-nav-group">"Objectifs"</span>
                {nav_item("dailySubs", "Daily Subs")}
                {nav_item("subgoals", "Subgoals")}
                {nav_item("goals", "Goals")}
                <span class="widget-nav-group">"Événements"</span>
                {nav_item("alerts", "Alertes")}
                {nav_item("spotify", "Spotify")}
                {nav_item("events", "Derniers événements")}
                {nav_item("roulette", "Roulette")}
                <span class="spacer"></span>
                <button class="button block" on:click=simple("widgets_refresh", "Widgets rechargés")><Icon name="refresh"/>"Recharger les widgets"</button>
            </nav>
            <section class="panel fill widget-detail">
                {detail}
            </section>
        </div>
    }
}
