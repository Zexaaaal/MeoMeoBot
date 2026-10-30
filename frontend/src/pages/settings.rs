use crate::components::notices;
use crate::icons::Icon;
use crate::tauri::{call, call0, listen};
use crate::ui::copy_text;
use leptos::prelude::*;
use leptos::task::spawn_local;
use serde_json::json;
use shared::{BotStatus, IntegrationSettings, ObsStatus, SubscriptionStatus, TwitchSettings};

#[derive(Clone, Copy, PartialEq)]
enum SettingsTab {
    Twitch,
    Spotify,
    Integrations,
}

#[component]
pub fn SettingsPage(status: RwSignal<BotStatus>) -> impl IntoView {
    let tab = RwSignal::new(SettingsTab::Twitch);
    let channel = RwSignal::new(String::new());
    let client_id = RwSignal::new(String::new());
    let token = RwSignal::new(String::new());
    let app_token = RwSignal::new(String::new());
    let redirect = RwSignal::new(String::new());
    let subscriptions = RwSignal::new(Vec::<SubscriptionStatus>::new());
    let busy = RwSignal::new(false);
    let integrations = RwSignal::new(IntegrationSettings::default());
    let spotify_redirect = RwSignal::new(String::new());
    let obs = RwSignal::new(ObsStatus::default());
    let notices = notices();

    let load_integrations = move || {
        spawn_local(async move {
            if let Ok(settings) = call0::<IntegrationSettings>("integration_settings").await {
                integrations.set(settings);
            }
            spotify_redirect.set(call0("spotify_redirect_uri").await.unwrap_or_default());
            obs.set(call0("obs_status").await.unwrap_or_default());
        });
    };
    load_integrations();
    listen::<()>(shared::events::INTEGRATIONS, move |_| load_integrations());

    let load = move || {
        spawn_local(async move {
            if let Ok(s) = call0::<TwitchSettings>("twitch_settings").await {
                channel.set(s.channel);
                client_id.set(s.client_id);
                token.set(s.token);
                app_token.set(s.app_token);
            }
            redirect.set(call0("twitch_redirect_uri").await.unwrap_or_default());
            subscriptions.set(call0("bot_subscriptions").await.unwrap_or_default());
        });
    };
    load();
    listen::<()>(shared::events::TWITCH_SETTINGS, move |_| load());
    listen::<Vec<SubscriptionStatus>>(shared::events::SUBSCRIPTIONS, move |list| subscriptions.set(list));

    let save = move |_| {
        let settings = TwitchSettings { channel: channel.get_untracked(), client_id: client_id.get_untracked(), token: token.get_untracked(), app_token: app_token.get_untracked() };
        let other = integrations.get_untracked();
        busy.set(true);
        spawn_local(async move {
            let result = match call::<()>("twitch_settings_save", json!({ "settings": settings })).await {
                Ok(()) => call::<()>("integration_settings_save", json!({ "settings": other })).await,
                Err(e) => Err(e),
            };
            match result {
                Ok(()) => notices.success("Configuration enregistrée"),
                Err(e) => notices.error(e),
            }
            obs.set(call0("obs_status").await.unwrap_or_default());
            busy.set(false);
        });
    };

    let authorize = move |_| {
        spawn_local(async move {
            match call0::<()>("twitch_authorize").await {
                Ok(()) => notices.success("Autorise MeoMeoBot dans le navigateur qui vient de s'ouvrir."),
                Err(e) => notices.error(e),
            }
        });
    };

    let toggle_connection = move |_| {
        let connected = status.get_untracked().connected;
        busy.set(true);
        spawn_local(async move {
            let result = if connected { call0::<()>("bot_disconnect").await } else { call0::<()>("bot_connect").await };
            if let Err(e) = result {
                notices.error(e);
            }
            busy.set(false);
        });
    };

    let tab_button = move |value: SettingsTab, label: &'static str| view! {
        <button class="tab" class:active=move || tab.get() == value on:click=move |_| tab.set(value)>{label}</button>
    };

    view! {
        <div class="tabs">
            {tab_button(SettingsTab::Twitch, "Twitch")}
            {tab_button(SettingsTab::Spotify, "Spotify")}
            {tab_button(SettingsTab::Integrations, "Intégrations")}
            <span class="spacer"></span>
            <button class="button primary" disabled=move || busy.get() on:click=save><Icon name="check"/>"Enregistrer"</button>
        </div>
        <div class="page-body">
            <Show when=move || tab.get() == SettingsTab::Spotify>
                <SpotifyTab settings=integrations redirect=spotify_redirect/>
            </Show>
            <Show when=move || tab.get() == SettingsTab::Integrations>
                <IntegrationsTab settings=integrations obs/>
            </Show>
            <Show when=move || tab.get() == SettingsTab::Twitch>
                <section class="panel">
                    <div class="panel-header">
                        <h2>"Compte Twitch"</h2>
                        <div class="row-actions">
                            <button class="button" on:click=authorize><Icon name="key"/>"Autoriser avec Twitch"</button>
                            <button class="button" class:primary=move || !status.get().connected disabled=move || busy.get() on:click=toggle_connection>
                                {move || if status.get().connected { "Déconnecter le bot" } else { "Connecter le bot" }}
                            </button>
                        </div>
                    </div>
                    <div class="grid-2">
                        <label class="field"><span>"Chaîne"</span><input type="text" placeholder="nom_de_la_chaine" bind:value=channel/></label>
                        <label class="field"><span>"Client ID"</span><input type="text" bind:value=client_id/></label>
                        <label class="field"><span>"Token OAuth"</span><input type="password" placeholder="Rempli par « Autoriser avec Twitch »" bind:value=token/></label>
                        <label class="field"><span>"App Token (optionnel)"</span><input type="password" bind:value=app_token/></label>
                    </div>
                    <div class="field">
                        <span>"Redirect URI à déclarer dans la console Twitch"</span>
                        <button class="url-box" title="Cliquer pour copier" on:click=move |_| copy_text(redirect.get_untracked(), "Redirect URI copiée")>{redirect}</button>
                    </div>
                </section>
                <Show when=move || subscriptions.get().iter().any(|s| !s.ok)>
                    <section class="panel">
                        <h2>"Événements Twitch non reçus"</h2>
                        <p class="hint">"Ces fonctions ne marcheront pas tant que le token n'a pas la permission indiquée. Clique sur « Autoriser avec Twitch » pour les accorder."</p>
                        <div class="list">
                            {move || subscriptions.get().into_iter().filter(|s| !s.ok).map(|s| view! {
                                <div class="row"><span class="grow">{s.kind}</span><span class="hint">{s.scope.unwrap_or_default()}</span></div>
                            }).collect_view()}
                        </div>
                    </section>
                </Show>
            </Show>
        </div>
    }
}

fn text_field(settings: RwSignal<IntegrationSettings>, read: fn(&IntegrationSettings) -> String, write: fn(&mut IntegrationSettings, String)) -> (Signal<String>, Callback<String>) {
    (Signal::derive(move || read(&settings.get())), Callback::new(move |v: String| settings.update(|s| write(s, v))))
}

#[component]
fn SettingField(label: &'static str, value: (Signal<String>, Callback<String>), #[prop(optional)] secret: bool, #[prop(optional)] placeholder: &'static str) -> impl IntoView {
    let (get, set) = value;
    view! {
        <label class="field">
            <span>{label}</span>
            <input type=if secret { "password" } else { "text" } placeholder=placeholder prop:value=get on:input=move |e| set.run(event_target_value(&e))/>
        </label>
    }
}

#[component]
fn SpotifyTab(settings: RwSignal<IntegrationSettings>, redirect: RwSignal<String>) -> impl IntoView {
    let notices = notices();
    let link = move |_| {
        spawn_local(async move {
            match call0::<()>("spotify_authorize").await {
                Ok(()) => notices.success("Autorise MeoMeoBot dans le navigateur qui vient de s'ouvrir."),
                Err(e) => notices.error(e),
            }
        });
    };
    view! {
        <section class="panel">
            <div class="panel-header">
                <h2>"Compte Spotify " <span class="hint">{move || if settings.get().spotify_linked { "lié" } else { "non lié" }}</span></h2>
                <button class="button" on:click=link><Icon name="key"/>"Lier Spotify"</button>
            </div>
            <p class="hint">"Enregistre le Client ID et le Client Secret avant de lier le compte. Sans compte lié, le widget lit le titre de la fenêtre Spotify."</p>
            <div class="grid-2">
                <SettingField label="Client ID" value=text_field(settings, |s| s.spotify_client_id.clone(), |s, v| s.spotify_client_id = v)/>
                <SettingField label="Client Secret" secret=true value=text_field(settings, |s| s.spotify_client_secret.clone(), |s, v| s.spotify_client_secret = v)/>
            </div>
            <div class="field">
                <span>"Redirect URI à déclarer dans le dashboard Spotify"</span>
                <button class="url-box" title="Cliquer pour copier" on:click=move |_| copy_text(redirect.get_untracked(), "Redirect URI copiée")>{redirect}</button>
            </div>
        </section>
    }
}

#[component]
fn IntegrationsTab(settings: RwSignal<IntegrationSettings>, obs: RwSignal<ObsStatus>) -> impl IntoView {
    let notices = notices();
    let refresh = move |_| {
        spawn_local(async move {
            match call0::<String>("obs_refresh").await {
                Ok(message) => notices.success(message),
                Err(e) => notices.error(e),
            }
        });
    };
    let obs_label = move || {
        let status = obs.get();
        if !status.enabled { "désactivé" } else if status.connected { "connecté" } else { "en attente d'OBS" }
    };
    view! {
        <section class="panel">
            <h2>"Dons et images"</h2>
            <div class="grid-2">
                <SettingField label="Token Streamlabs (socket API)" secret=true value=text_field(settings, |s| s.streamlabs_token.clone(), |s, v| s.streamlabs_token = v)/>
                <SettingField label="Clé API SteamGridDB" secret=true value=text_field(settings, |s| s.steamgriddb_key.clone(), |s, v| s.steamgriddb_key = v)/>
            </div>
            <SettingField label="Webhook Discord (planning)" placeholder="https://discord.com/api/webhooks/..." value=text_field(settings, |s| s.discord_webhook.clone(), |s, v| s.discord_webhook = v)/>
        </section>
        <section class="panel">
            <div class="panel-header">
                <h2>"OBS " <span class="hint" class:ok-text=move || obs.get().connected>{obs_label}</span></h2>
                <Show when=move || settings.get().obs_enabled>
                    <button class="button" disabled=move || !obs.get().connected on:click=refresh><Icon name="refresh"/>"Rafraîchir les sources"</button>
                </Show>
            </div>
            <label class="check">
                <input type="checkbox" prop:checked=move || settings.get().obs_enabled on:change=move |e| settings.update(|s| s.obs_enabled = event_target_checked(&e))/>
                <span>"Laisser le bot rafraîchir et réparer les sources des widgets dans OBS"</span>
            </label>
            <Show when=move || settings.get().obs_enabled>
                <p class="hint">"Le bot se connecte au serveur WebSocket intégré à OBS (Outils → Paramètres du serveur WebSocket). Recopie ici l'adresse et le mot de passe affichés dans OBS."</p>
                <div class="grid-2">
                    <SettingField label="Adresse du serveur WebSocket" placeholder="ws://127.0.0.1:4455" value=text_field(settings, |s| s.obs_url.clone(), |s, v| s.obs_url = v)/>
                    <SettingField label="Mot de passe" secret=true value=text_field(settings, |s| s.obs_password.clone(), |s, v| s.obs_password = v)/>
                </div>
            </Show>
        </section>
    }
}
