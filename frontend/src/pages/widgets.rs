use crate::components::notices;
use crate::icons::Icon;
use crate::pages::theme_editor::ThemeEditor;
use crate::pages::widget_editors::{GoalsEditor, RouletteEditor, SubgoalsEditor};
use crate::tauri::{call, call0, listen};
use crate::ui::{widget_urls, Checkbox, CopyUrl, MultiSelect, NumberField};
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
    Goals,
    Roulette,
}

#[component]
fn Section(#[prop(optional)] title: Option<&'static str>, #[prop(optional)] link: Option<(&'static str, &'static str)>, urls: RwSignal<Vec<WidgetUrl>>, children: Children) -> impl IntoView {
    view! {
        <div class="card-section">
            {match (link, title) {
                (Some((key, label)), _) => view! { <CopyUrl urls key label/> }.into_any(),
                (None, Some(label)) => view! { <h2>{label}</h2> }.into_any(),
                (None, None) => ().into_any(),
            }}
            {children()}
        </div>
    }
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
    let back = Callback::new(move |_| view.set(View::List));
    move || match view.get() {
        View::List => view! { <WidgetList view/> }.into_any(),
        View::Theme(widget) => view! { <ThemeEditor widget on_back=back/> }.into_any(),
        View::Subgoals => view! { <SubgoalsEditor on_back=back/> }.into_any(),
        View::Goals => view! { <GoalsEditor on_back=back/> }.into_any(),
        View::Roulette => view! { <RouletteEditor on_back=back/> }.into_any(),
    }
}

#[component]
fn WidgetList(view: RwSignal<View>) -> impl IntoView {
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
                    if let Err(e) = call::<()>("widget_settings_save", json!({ "settings": settings })).await {
                        notices.error(e);
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

    view! {
        <div class="page-body">
            <div class="widget-grid">
                <div class="widget-card">
                    <Section urls link=("chat", "Tchat")>
                        <div class="grid-2">
                            <label class="field"><span>"Messages max"</span>
                                <input type="number" min="1" prop:value=move || max_messages.get().to_string() on:input=move |e| max_messages.set(event_target_value(&e).parse().unwrap_or(1))/>
                            </label>
                            <MultiSelect label="Badges affichés" items=badge_items/>
                        </div>
                        <Actions view themes=&["chat"]/>
                    </Section>
                </div>
                <div class="widget-card">
                    <Section urls link=("emoteWall", "Mur d'emotes")>
                        <div class="grid-2">
                            <NumberField label="Min (px)" value=min_size min=8/>
                            <NumberField label="Max (px)" value=max_size min=8/>
                            <NumberField label="Intervalle" value=spawn_interval min=10/>
                            <NumberField label="Durée" value=duration min=500/>
                        </div>
                        <Actions view themes=&["emote-wall"]/>
                    </Section>
                </div>
                <div class="widget-card">
                    <Section urls link=("dailySubs", "Daily Subs")>
                        <NumberField label="Objectif" value=daily_goal min=1/>
                        <div class="form-inline center-items">
                            <Checkbox label="Subs".into() value=count_regular/>
                            <Checkbox label="Subs offerts".into() value=count_gifts/>
                        </div>
                    </Section>
                </div>
                <div class="widget-card">
                    <Section urls link=("subgoals", "Subgoals")>
                        <div class="card-links"><CopyUrl urls key="subgoalsList" label="Liste des paliers"/></div>
                        <Actions view configure=View::Subgoals themes=&["subgoals", "subgoals-list"]/>
                    </Section>
                    <Section urls title="Goals">
                        <span class="hint">"Chaque goal a sa propre URL dans « Configurer »."</span>
                        <Actions view configure=View::Goals themes=&["goals"]/>
                    </Section>
                </div>
                <div class="widget-card">
                    <Section urls link=("alerts", "Alertes")>
                        <Actions view themes=&["alerts"]/>
                    </Section>
                    <Section urls link=("spotify", "Spotify")>
                        <Actions view themes=&["spotify"]/>
                    </Section>
                    <Section urls title="Derniers événements">
                        <div class="card-links">
                            <CopyUrl urls key="lastSub" label="Sub"/>
                            <CopyUrl urls key="lastFollow" label="Follow"/>
                            <CopyUrl urls key="lastDonation" label="Don"/>
                        </div>
                    </Section>
                </div>
                <div class="widget-card">
                    <Section urls link=("roulette", "Roulette")>
                        <div class="card-actions">
                            <button class="button small success" on:click=simple("roulette_spin", "Roulette lancée")><Icon name="play"/>"Lancer"</button>
                            <button class="button small" on:click=move |_| view.set(View::Roulette)><Icon name="settings"/>"Configurer"</button>
                            <button class="button small" on:click=move |_| view.set(View::Theme("roulette"))><Icon name="star"/>"Thèmes"</button>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
        <button class="button floating" on:click=simple("widgets_refresh", "Widgets rechargés")><Icon name="refresh"/>"Recharger les widgets"</button>
    }
}
