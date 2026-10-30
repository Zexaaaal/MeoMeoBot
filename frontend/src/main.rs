mod components;
mod icons;
mod pages;
mod tauri;
mod planning_render;
mod theme_builder;
mod ui;

use components::{Notices, Shell};
use leptos::prelude::*;

fn main() {
    console_error_panic_hook::set_once();
    leptos::mount::mount_to_body(|| {
        provide_context(Notices::new());
        view! { <Shell/> }
    });
}
