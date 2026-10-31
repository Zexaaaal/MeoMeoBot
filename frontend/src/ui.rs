use crate::components::notices;
use crate::icons::Icon;
use leptos::prelude::*;
use leptos::task::spawn_local;
use shared::WidgetUrl;

pub fn copy_with(notices: crate::components::Notices, text: String, label: &'static str) {
    spawn_local(async move {
        let clipboard = web_sys::window().map(|w| w.navigator().clipboard());
        match clipboard {
            Some(clipboard) if !text.is_empty() => match wasm_bindgen_futures::JsFuture::from(clipboard.write_text(&text)).await {
                Ok(_) => notices.success(label),
                Err(_) => notices.error("Impossible de copier"),
            },
            _ => notices.error("URL indisponible"),
        }
    });
}

pub async fn widget_urls() -> Vec<WidgetUrl> {
    crate::tauri::call0("widget_urls").await.unwrap_or_default()
}

pub fn url_for(urls: &[WidgetUrl], key: &str) -> String {
    urls.iter().find(|u| u.key == key).map(|u| u.url.clone()).unwrap_or_default()
}

#[component]
pub fn CopyLink(label: &'static str, url: Signal<String>) -> impl IntoView {
    let notices = notices();
    let copied = RwSignal::new(false);
    let click = move |_| {
        copy_with(notices, url.get_untracked(), "URL copiée");
        copied.set(true);
        set_timeout(move || copied.set(false), std::time::Duration::from_millis(1500));
    };
    view! {
        <button class="card-title" class:copied=copied title="Copier l'URL de la source navigateur OBS" on:click=click>
            {label}{move || if copied.get() { view! { <Icon name="check"/> } } else { view! { <Icon name="link"/> } }}
        </button>
    }
}

#[component]
pub fn CopyUrl(urls: RwSignal<Vec<WidgetUrl>>, key: &'static str, label: &'static str) -> impl IntoView {
    view! { <CopyLink label url=Signal::derive(move || url_for(&urls.get(), key))/> }
}

#[component]
pub fn NumberField(label: &'static str, value: RwSignal<u32>, #[prop(optional)] min: u32) -> impl IntoView {
    view! {
        <label class="field inline">
            <span>{label}</span>
            <input type="number" min=min prop:value=move || value.get().to_string()
                on:input=move |e| value.set(event_target_value(&e).parse().unwrap_or(min))/>
        </label>
    }
}

#[component]
pub fn Checkbox(label: String, value: RwSignal<bool>) -> impl IntoView {
    view! {
        <label class="check">
            <input type="checkbox" bind:checked=value/>
            <span>{label}</span>
        </label>
    }
}

#[component]
pub fn MultiSelect(label: &'static str, items: Signal<Vec<(String, RwSignal<bool>)>>) -> impl IntoView {
    let open = RwSignal::new(false);
    let summary = move || {
        let chosen: Vec<String> = items.get().into_iter().filter(|(_, v)| v.get()).map(|(l, _)| l).collect();
        match chosen.len() {
            0 => "Aucun".to_string(),
            n if n == items.get().len() => "Tous".to_string(),
            _ => chosen.join(", "),
        }
    };
    view! {
        <div class="field">
            <span>{label}</span>
            <div class="multiselect">
                <button class="multiselect-toggle" class:open=move || open.get() on:click=move |_| open.update(|o| *o = !*o)>
                    <span>{summary}</span>
                    <Icon name="chevronDown"/>
                </button>
                <Show when=move || open.get()>
                    <div class="multiselect-backdrop" on:click=move |_| open.set(false)></div>
                    <div class="multiselect-menu">
                        {move || items.get().into_iter().map(|(label, value)| view! { <Checkbox label value/> }).collect_view()}
                    </div>
                </Show>
            </div>
        </div>
    }
}
