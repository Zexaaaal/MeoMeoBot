use crate::config::Store;
use crate::widgets::Hub;
use serde_json::{json, Value};
use shared::ThemeInfo;
use std::path::{Path, PathBuf};

const DEFAULT_NAMES: &[(&str, &str)] = &[
    ("chat_christmas.css", "Noël"),
    ("chat_halloween.css", "Halloween"),
    ("chat_horror.css", "Horreur"),
    ("chat_retro_terminal.css", "Matrix"),
    ("chat_bubble_pop.css", "meoMessage"),
    ("chat_neon_cyberpunk.css", "Cyberpunk"),
    ("chat_soso_base.css", "Soso Défaut"),
    ("chat_pro.css", "Pro"),
    ("spotify_soso_base.css", "Défaut"),
    ("subgoals_candycane.css", "Candy Cane"),
    ("subgoals_halloween.css", "Halloween"),
    ("subgoals_horror.css", "Horreur"),
    ("subgoals-list_halloween.css", "Halloween"),
    ("subgoals-list_horror.css", "Horreur"),
    ("goals_christmas.css", "Noël"),
    ("goals_halloween.css", "Halloween"),
    ("goals_horror.css", "Horreur"),
    ("roulette_base.css", "Roue"),
    ("roulette_list.css", "Liste"),
    ("roulette_halloween.css", "Halloween"),
    ("roulette_horror.css", "Horreur"),
    ("alerts_christmas.css", "Noël"),
    ("alerts_halloween.css", "Halloween"),
    ("alerts_horror.css", "Horreur"),
    ("emote-wall_halloween.css", "Halloween"),
    ("emote-wall_horror.css", "Horreur"),
    ("chat_gta6.css", "GTA VI"),
    ("alerts_gta6.css", "GTA VI"),
    ("goals_gta6.css", "GTA VI"),
    ("subgoals_gta6.css", "GTA VI"),
    ("subgoals-list_gta6.css", "GTA VI"),
    ("roulette_gta6.css", "GTA VI"),
    ("emote-wall_gta6.css", "GTA VI"),
    ("spotify_gta6.css", "GTA VI"),
];

const SPOTIFY_DEFAULT: &str = "spotify_soso_base.css";

pub const SEASONAL_WIDGETS: &[&str] = &["chat", "subgoals", "subgoals-list", "goals", "roulette", "alerts", "emote-wall"];

fn cascade(key: &str) -> &'static [(&'static str, &'static str)] {
    match key {
        "christmas" => &[("chat", "chat_christmas.css"), ("subgoals", "subgoals_candycane.css"), ("alerts", "alerts_christmas.css"), ("goals", "goals_christmas.css")],
        "halloween" => &[("chat", "chat_halloween.css"), ("subgoals", "subgoals_halloween.css"), ("subgoals-list", "subgoals-list_halloween.css"), ("goals", "goals_halloween.css"), ("roulette", "roulette_halloween.css"), ("alerts", "alerts_halloween.css"), ("emote-wall", "emote-wall_halloween.css")],
        "horror" => &[("chat", "chat_horror.css"), ("subgoals", "subgoals_horror.css"), ("subgoals-list", "subgoals-list_horror.css"), ("goals", "goals_horror.css"), ("roulette", "roulette_horror.css"), ("alerts", "alerts_horror.css"), ("emote-wall", "emote-wall_horror.css")],
        "gta6" => &[("chat", "chat_gta6.css"), ("subgoals", "subgoals_gta6.css"), ("subgoals-list", "subgoals-list_gta6.css"), ("goals", "goals_gta6.css"), ("roulette", "roulette_gta6.css"), ("alerts", "alerts_gta6.css"), ("emote-wall", "emote-wall_gta6.css"), ("spotify", "spotify_gta6.css")],
        _ => &[],
    }
}

pub fn season_of(theme: &str) -> Option<&'static str> {
    let name = theme.to_lowercase();
    if !name.starts_with("chat_") {
        return None;
    }
    if name.contains("gta") {
        Some("gta6")
    } else if name.contains("halloween") {
        Some("halloween")
    } else if name.contains("horror") || name.contains("horreur") {
        Some("horror")
    } else if name.contains("christmas") || name.contains("noel") || name.contains("noël") {
        Some("christmas")
    } else {
        None
    }
}

pub fn is_theme_file(name: &str) -> bool {
    name.ends_with(".css") && !name.contains(['/', '\\']) && name != "." && !name.starts_with("..")
}

pub fn belongs_to(file: &str, widget: &str) -> bool {
    file.strip_prefix(widget).map(|rest| rest.starts_with('_')).unwrap_or(false)
}

pub struct Themes {
    user_dir: PathBuf,
    builtin_dir: PathBuf,
}

impl Themes {
    pub fn new(store: &Store, widgets_dir: &Path) -> Self {
        Themes { user_dir: store.user_data().join("themes"), builtin_dir: widgets_dir.join("themes") }
    }

    fn names_file(&self) -> PathBuf {
        self.user_dir.join("themes.json")
    }

    fn custom_names(&self) -> Value {
        std::fs::read_to_string(self.names_file()).ok().and_then(|t| serde_json::from_str(&t).ok()).unwrap_or_else(|| json!({}))
    }

    fn save_names(&self, names: &Value) -> anyhow::Result<()> {
        std::fs::create_dir_all(&self.user_dir)?;
        std::fs::write(self.names_file(), serde_json::to_string_pretty(names)?)?;
        Ok(())
    }

    fn find(&self, file: &str) -> Option<PathBuf> {
        if !is_theme_file(file) {
            return None;
        }
        [self.user_dir.join(file), self.builtin_dir.join(file)].into_iter().find(|p| p.is_file())
    }

    pub fn content(&self, file: &str) -> String {
        self.find(file).and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_default()
    }

    pub fn list(&self, widget: &str) -> Vec<ThemeInfo> {
        let names = self.custom_names();
        let mut themes: Vec<ThemeInfo> = Vec::new();
        for (dir, builtin) in [(&self.builtin_dir, true), (&self.user_dir, false)] {
            for entry in std::fs::read_dir(dir).into_iter().flatten().flatten() {
                let file = entry.file_name().to_string_lossy().to_string();
                if !is_theme_file(&file) || !belongs_to(&file, widget) || themes.iter().any(|t| t.id == file) {
                    continue;
                }
                let modified = builtin && self.is_modified(&file);
                let name = names[&file].as_str().map(str::to_string)
                    .or_else(|| DEFAULT_NAMES.iter().find(|(f, _)| *f == file).map(|(_, n)| n.to_string()))
                    .unwrap_or_else(|| file.trim_start_matches(&format!("{widget}_")).trim_end_matches(".css").replace('_', " "));
                themes.push(ThemeInfo { id: file, name, builtin, modified });
            }
        }
        themes.sort_by(|a, b| b.builtin.cmp(&a.builtin).then(a.name.to_lowercase().cmp(&b.name.to_lowercase())));
        themes
    }

    fn is_modified(&self, file: &str) -> bool {
        let user = self.user_dir.join(file);
        if !user.is_file() {
            return false;
        }
        std::fs::read_to_string(&user).ok() != std::fs::read_to_string(self.builtin_dir.join(file)).ok()
    }

    pub fn save(&self, file: &str, css: &str) -> anyhow::Result<()> {
        if !is_theme_file(file) {
            anyhow::bail!("Thème introuvable");
        }
        if self.find(file).is_none() {
            anyhow::bail!("Thème introuvable");
        }
        std::fs::create_dir_all(&self.user_dir)?;
        if self.builtin_dir.join(file).is_file() && std::fs::read_to_string(self.builtin_dir.join(file)).ok().as_deref() == Some(css) {
            let _ = std::fs::remove_file(self.user_dir.join(file));
            return Ok(());
        }
        std::fs::write(self.user_dir.join(file), css)?;
        Ok(())
    }

    pub fn reset(&self, file: &str) -> anyhow::Result<()> {
        if !is_theme_file(file) || !self.builtin_dir.join(file).is_file() {
            anyhow::bail!("Seuls les thèmes intégrés peuvent être réinitialisés");
        }
        let user = self.user_dir.join(file);
        if user.is_file() {
            std::fs::remove_file(user)?;
        }
        Ok(())
    }

    pub fn create(&self, widget: &str, name: &str, css: &str) -> anyhow::Result<String> {
        let slug: String = name.trim().chars().map(|c| if c.is_ascii_alphanumeric() || c == '-' { c.to_ascii_lowercase() } else { '_' }).collect();
        if slug.trim_matches('_').is_empty() {
            anyhow::bail!("Nom de thème invalide");
        }
        let file = format!("{widget}_{slug}.css");
        std::fs::create_dir_all(&self.user_dir)?;
        std::fs::write(self.user_dir.join(&file), css)?;
        let mut names = self.custom_names();
        names[&file] = json!(name.trim());
        self.save_names(&names)?;
        Ok(file)
    }

    pub fn import(&self, widget: &str, source: &Path) -> anyhow::Result<String> {
        let original = source.file_name().and_then(|n| n.to_str()).ok_or_else(|| anyhow::anyhow!("Fichier invalide"))?.to_string();
        let file = if belongs_to(&original, widget) { original } else { format!("{widget}_{original}") };
        if !is_theme_file(&file) {
            anyhow::bail!("Seuls les fichiers .css peuvent être importés");
        }
        std::fs::create_dir_all(&self.user_dir)?;
        std::fs::copy(source, self.user_dir.join(&file))?;
        Ok(file)
    }

    pub fn rename(&self, file: &str, name: &str) -> anyhow::Result<()> {
        let mut names = self.custom_names();
        if name.trim().is_empty() {
            names.as_object_mut().map(|m| m.remove(file));
        } else {
            names[file] = json!(name.trim());
        }
        self.save_names(&names)
    }

    pub fn delete(&self, file: &str) -> anyhow::Result<()> {
        if !is_theme_file(file) {
            anyhow::bail!("Thème introuvable");
        }
        let path = self.user_dir.join(file);
        if !path.is_file() || self.builtin_dir.join(file).is_file() {
            anyhow::bail!("Les thèmes intégrés ne peuvent pas être supprimés");
        }
        std::fs::remove_file(path)?;
        let mut names = self.custom_names();
        names.as_object_mut().map(|m| m.remove(file));
        self.save_names(&names)
    }

    fn write_widget(&self, store: &Store, hub: &Hub, widget: &str, theme: &str, css: &str) {
        let mut patch = json!({ "currentTheme": theme, "customCSS": css });
        if widget == "goals" {
            let goals: Vec<Value> = store.widget("goals")["goals"].as_array().cloned().unwrap_or_default().into_iter()
                .map(|mut g| { g["customCSS"] = json!(css); g["currentTheme"] = json!(theme); g })
                .collect();
            patch["goals"] = json!(goals);
        }
        let _ = store.merge(&format!("widgets.{widget}"), patch);
        hub.broadcast_config(widget, &store.widget(widget));
    }

    pub fn apply(&self, store: &Store, hub: &Hub, widget: &str, theme: &str, css: &str) {
        let previous_season = season_of(store.widget("chat")["currentTheme"].as_str().unwrap_or_default());
        self.write_widget(store, hub, widget, theme, css);
        if widget != "chat" {
            return;
        }
        match season_of(theme) {
            Some(season) => {
                for (target, file) in cascade(season).iter().filter(|(w, _)| *w != "chat") {
                    self.write_widget(store, hub, target, file, &self.content(file));
                }
            }
            None if previous_season.is_some() => {
                for target in SEASONAL_WIDGETS.iter().filter(|w| **w != "chat") {
                    self.write_widget(store, hub, target, "", "");
                }
                if store.widget("spotify")["currentTheme"].as_str().is_some_and(|t| t.contains("gta")) {
                    self.write_widget(store, hub, "spotify", SPOTIFY_DEFAULT, &self.content(SPOTIFY_DEFAULT));
                }
            }
            None => {}
        }
        hub.refresh_all();
    }

    pub fn reload_contents(&self, store: &Store) {
        for widget in SEASONAL_WIDGETS.iter().chain(["spotify"].iter()) {
            let config = store.widget(widget);
            let Some(theme) = config["currentTheme"].as_str().filter(|t| !t.is_empty()) else { continue };
            let content = self.content(theme);
            if !content.is_empty() && config["customCSS"].as_str() != Some(content.as_str()) {
                let _ = store.merge(&format!("widgets.{widget}"), json!({ "customCSS": content }));
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn theme_files_are_validated() {
        assert!(is_theme_file("chat_halloween.css"));
        assert!(!is_theme_file("../config.json"));
        assert!(!is_theme_file("a/b.css"));
        assert!(!is_theme_file("chat.txt"));
    }

    #[test]
    fn widget_prefixes_do_not_overlap() {
        assert!(belongs_to("subgoals_halloween.css", "subgoals"));
        assert!(!belongs_to("subgoals-list_halloween.css", "subgoals"));
        assert!(belongs_to("subgoals-list_halloween.css", "subgoals-list"));
    }

    #[test]
    fn seasons_only_come_from_chat_themes() {
        assert_eq!(season_of("chat_halloween.css"), Some("halloween"));
        assert_eq!(season_of("chat_horror.css"), Some("horror"));
        assert_eq!(season_of("chat_christmas.css"), Some("christmas"));
        assert_eq!(season_of("chat_gta6.css"), Some("gta6"));
        assert_eq!(season_of("chat_pro.css"), None);
        assert_eq!(season_of("alerts_halloween.css"), None);
    }
}
