use crate::icons::Icon;
use crate::pages::{AlertsPage, CastPage, CommandsPage, GiveawayPage, ModerationPage, PlanningPage, PointsPage, SettingsPage, WidgetsPage};
use crate::tauri::{call, call0, listen};
use leptos::prelude::*;
use leptos::task::spawn_local;
use shared::{AppInfo, BotStatus, Notice, NoticeKind};

#[derive(Clone, Copy)]
pub struct Notices {
    items: RwSignal<Vec<(u32, Notice)>>,
    next_id: StoredValue<u32>,
}

impl Notices {
    pub fn new() -> Self {
        Notices { items: RwSignal::new(Vec::new()), next_id: StoredValue::new(0) }
    }

    pub fn push(&self, kind: NoticeKind, message: impl Into<String>) {
        let id = self.next_id.get_value();
        self.next_id.set_value(id + 1);
        self.items.update(|items| items.push((id, Notice { kind, message: message.into() })));
        let items = self.items;
        set_timeout(
            move || items.update(|items| items.retain(|(item_id, _)| *item_id != id)),
            std::time::Duration::from_secs(4),
        );
    }

    pub fn success(&self, message: impl Into<String>) {
        self.push(NoticeKind::Success, message);
    }

    pub fn error(&self, message: impl Into<String>) {
        self.push(NoticeKind::Error, message);
    }
}

pub fn notices() -> Notices {
    expect_context::<Notices>()
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum Tab {
    Commands,
    Giveaway,
    Moderation,
    Cast,
    Widgets,
    Alerts,
    Points,
    Planning,
    Settings,
}

impl Tab {
    const MAIN: [Tab; 8] = [Tab::Commands, Tab::Giveaway, Tab::Moderation, Tab::Cast, Tab::Widgets, Tab::Alerts, Tab::Points, Tab::Planning];

    fn label(self) -> &'static str {
        match self {
            Tab::Commands => "Commandes",
            Tab::Giveaway => "Giveaway",
            Tab::Moderation => "Modération",
            Tab::Cast => "Cast",
            Tab::Widgets => "Widgets",
            Tab::Alerts => "Alertes",
            Tab::Points => "Points",
            Tab::Planning => "Planning",
            Tab::Settings => "Configuration",
        }
    }

    fn icon(self) -> &'static str {
        match self {
            Tab::Commands => "commands",
            Tab::Giveaway => "giveaway",
            Tab::Moderation => "moderation",
            Tab::Cast => "cast",
            Tab::Widgets => "widgets",
            Tab::Alerts => "alerts",
            Tab::Points => "points",
            Tab::Planning => "planning",
            Tab::Settings => "settings",
        }
    }
}

#[component]
fn NavItem(tab: Tab, current: RwSignal<Tab>) -> impl IntoView {
    view! {
        <button class="nav-item" class:active=move || current.get() == tab on:click=move |_| current.set(tab)>
            <Icon name=tab.icon()/>
            <span>{tab.label()}</span>
        </button>
    }
}

fn window_control(action: &'static str) {
    spawn_local(async move {
        let _ = call::<()>("window_control", serde_json::json!({ "action": action })).await;
    });
}

#[component]
fn TitleBar(status: RwSignal<BotStatus>) -> impl IntoView {
    let version = RwSignal::new(String::new());
    spawn_local(async move {
        if let Ok(info) = call0::<AppInfo>("app_info").await {
            version.set(format!("v{}", info.version));
        }
    });
    let update = RwSignal::new(None::<String>);
    let installing = RwSignal::new(false);
    spawn_local(async move {
        if let Ok(next) = call0::<Option<String>>("update_check").await {
            update.set(next);
        }
    });
    let install = move |_| {
        installing.set(true);
        spawn_local(async move {
            if let Err(e) = call0::<()>("update_install").await {
                installing.set(false);
                notices().error(format!("Mise à jour impossible : {e}"));
            }
        });
    };

    view! {
        <div class="titlebar" data-tauri-drag-region>
            <img src="assets/icon.png" class="titlebar-logo" alt="" data-tauri-drag-region/>
            <span class="titlebar-name" data-tauri-drag-region>"MeoMeoBot"</span>
            <span class="titlebar-version" data-tauri-drag-region>{version}</span>
            <span class="status" class:ok=move || status.get().connected data-tauri-drag-region>
                <span class="status-dot"></span>
                {move || if status.get().connected { "Connecté" } else { "Déconnecté" }}
            </span>
            <span class="spacer" data-tauri-drag-region></span>
            {move || update.get().map(|next| view! {
                <button class="update-button" disabled=move || installing.get() on:click=install>
                    <Icon name="download"/>{move || if installing.get() { "Installation…".to_string() } else { format!("Mettre à jour (v{next})") }}
                </button>
            })}
            <div class="titlebar-controls">
                <button class="window-button" title="Réduire" on:click=|_| window_control("minimize")><Icon name="minimize"/></button>
                <button class="window-button" title="Agrandir" on:click=|_| window_control("maximize")><Icon name="maximize"/></button>
                <button class="window-button close" title="Fermer" on:click=|_| window_control("close")><Icon name="close"/></button>
            </div>
        </div>
    }
}

#[component]
fn Toasts() -> impl IntoView {
    let notices = notices();
    view! {
        <div class="toasts">
            <For each=move || notices.items.get() key=|(id, _)| *id let:item>
                <div class=format!("toast {}", serde_json::to_value(item.1.kind).ok().and_then(|v| v.as_str().map(str::to_string)).unwrap_or_default())>
                    {item.1.message.clone()}
                </div>
            </For>
        </div>
    }
}

#[component]
pub fn Shell() -> impl IntoView {
    let current = RwSignal::new(Tab::Commands);
    let status = RwSignal::new(BotStatus::default());

    spawn_local(async move {
        if let Ok(value) = call0::<BotStatus>("bot_status").await {
            status.set(value);
        }
        let configured = call0::<shared::TwitchSettings>("twitch_settings").await
            .map(|s| !s.channel.is_empty() && !s.token.is_empty())
            .unwrap_or(true);
        if !configured {
            current.set(Tab::Settings);
        }
    });
    listen::<BotStatus>(shared::events::BOT_STATUS, move |value| status.set(value));
    let notices = notices();
    listen::<Notice>(shared::events::NOTIFICATION, move |notice| notices.push(notice.kind, notice.message));

    view! {
        <TitleBar status/>
        <nav class="navbar">
            {Tab::MAIN.into_iter().map(|tab| view! { <NavItem tab current/> }).collect_view()}
            <span class="spacer"></span>
            <NavItem tab=Tab::Settings current/>
        </nav>
        <div class="app-body">
            <main class="content">
                {move || match current.get() {
                    Tab::Commands => view! { <CommandsPage/> }.into_any(),
                    Tab::Giveaway => view! { <GiveawayPage/> }.into_any(),
                    Tab::Moderation => view! { <ModerationPage/> }.into_any(),
                    Tab::Widgets => view! { <WidgetsPage/> }.into_any(),
                    Tab::Alerts => view! { <AlertsPage/> }.into_any(),
                    Tab::Points => view! { <PointsPage/> }.into_any(),
                    Tab::Planning => view! { <PlanningPage/> }.into_any(),
                    Tab::Settings => view! { <SettingsPage status/> }.into_any(),
                    Tab::Cast => view! { <CastPage/> }.into_any(),
                }}
            </main>
        </div>
        <Toasts/>
    }
}

#[component]
pub fn Toolbar(on_back: Callback<()>, back_label: &'static str, #[prop(optional)] title: Option<&'static str>, children: Children) -> impl IntoView {
    view! {
        <div class="toolbar">
            <button class="button" on:click=move |_| on_back.run(())><Icon name="chevronLeft"/>{back_label}</button>
            {title.map(|t| view! { <h2>{t}</h2> })}
            <span class="spacer"></span>
            {children()}
        </div>
    }
}

#[component]
pub fn ConfirmDelete(on_confirm: Callback<()>, #[prop(default = "Supprimer")] title: &'static str) -> impl IntoView {
    let confirming = RwSignal::new(false);
    view! {
        <Show
            when=move || confirming.get()
            fallback=move || view! { <button class="icon-button" title=title on:click=move |_| confirming.set(true)><Icon name="trash"/></button> }
        >
            <button class="icon-button danger" title="Confirmer" on:click=move |_| { confirming.set(false); on_confirm.run(()); }><Icon name="check"/></button>
            <button class="icon-button" title="Annuler" on:click=move |_| confirming.set(false)><Icon name="close"/></button>
        </Show>
    }
}
