use serde_json::{Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const DEFAULTS: &str = include_str!("../defaults.json");
const USER_DATA_TOKEN: &str = "{userData}";

pub struct Store {
    file: PathBuf,
    user_data: PathBuf,
    data: Mutex<Value>,
}

pub struct Locations {
    pub user_data: PathBuf,
    pub config_file: PathBuf,
}

fn has_portable_marker(exe_dir: &Path) -> bool {
    std::env::args().any(|a| a == "--portable" || a == "-p")
        || ["portable", "portable.txt", "portable_data"].iter().any(|m| exe_dir.join(m).exists())
}

pub fn locate() -> Locations {
    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));

    if let Ok(dir) = std::env::var("PORTABLE_EXECUTABLE_DIR") {
        let user_data = PathBuf::from(dir).join("portable_data");
        return Locations { config_file: user_data.join("config.json"), user_data };
    }
    if has_portable_marker(&exe_dir) {
        let user_data = exe_dir.join("portable_data");
        return Locations { config_file: user_data.join("config.json"), user_data };
    }

    let user_data = dirs::config_dir().unwrap_or_else(|| exe_dir.clone()).join("MeoMeoBot");
    let config_file = if cfg!(debug_assertions) {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("config.json")
    } else {
        user_data.join("config.json")
    };
    Locations { user_data, config_file }
}

fn get_path<'a>(root: &'a Value, key: &str) -> Option<&'a Value> {
    key.split('.').try_fold(root, |node, part| node.get(part))
}

fn set_path(root: &mut Value, key: &str, value: Value) {
    let mut node = root;
    let parts: Vec<&str> = key.split('.').collect();
    for part in &parts[..parts.len() - 1] {
        if !node.get(*part).map(Value::is_object).unwrap_or(false) {
            node[*part] = Value::Object(Map::new());
        }
        node = node.get_mut(*part).expect("object just ensured");
    }
    node[parts[parts.len() - 1]] = value;
}

fn map_strings(value: Value, f: &dyn Fn(String) -> String) -> Value {
    match value {
        Value::String(s) => Value::String(f(s)),
        Value::Array(items) => Value::Array(items.into_iter().map(|v| map_strings(v, f)).collect()),
        Value::Object(map) => Value::Object(map.into_iter().map(|(k, v)| (k, map_strings(v, f))).collect()),
        other => other,
    }
}

impl Store {
    pub fn open(locations: &Locations) -> anyhow::Result<Self> {
        fs::create_dir_all(&locations.user_data)?;
        if let Some(parent) = locations.config_file.parent() {
            fs::create_dir_all(parent)?;
        }

        let mut data = fs::read_to_string(&locations.config_file)
            .ok()
            .and_then(|text| serde_json::from_str::<Value>(&text).ok())
            .filter(Value::is_object)
            .unwrap_or_else(|| Value::Object(Map::new()));

        let defaults: Value = serde_json::from_str(DEFAULTS)?;
        if let (Some(target), Some(source)) = (data.as_object_mut(), defaults.as_object()) {
            for (key, value) in source {
                target.entry(key.clone()).or_insert_with(|| value.clone());
            }
        }

        let store = Store {
            file: locations.config_file.clone(),
            user_data: locations.user_data.clone(),
            data: Mutex::new(data),
        };
        store.persist()?;
        Ok(store)
    }

    pub fn user_data(&self) -> &Path {
        &self.user_data
    }

    fn user_data_str(&self) -> String {
        self.user_data.to_string_lossy().replace('\\', "/")
    }

    fn resolve(&self, value: Value) -> Value {
        let base = self.user_data_str();
        map_strings(value, &|s| s.replace(USER_DATA_TOKEN, &base))
    }

    fn unresolve(&self, value: Value) -> Value {
        let base = self.user_data_str();
        map_strings(value, &|s| s.replace(&base, USER_DATA_TOKEN))
    }

    fn persist(&self) -> anyhow::Result<()> {
        let text = serde_json::to_string_pretty(&*self.data.lock().unwrap())?;
        let tmp = self.file.with_extension("json.tmp");
        fs::write(&tmp, text)?;
        fs::rename(&tmp, &self.file)?;
        Ok(())
    }

    pub fn get(&self, key: &str) -> Value {
        let data = self.data.lock().unwrap();
        let value = get_path(&data, key).cloned().unwrap_or(Value::Null);
        drop(data);
        self.resolve(value)
    }

    pub fn get_str(&self, key: &str) -> String {
        self.get(key).as_str().unwrap_or_default().to_string()
    }

    pub fn set(&self, key: &str, value: Value) -> anyhow::Result<()> {
        let value = self.unresolve(value);
        set_path(&mut self.data.lock().unwrap(), key, value);
        self.persist()
    }

    pub fn merge(&self, key: &str, patch: Value) -> anyhow::Result<()> {
        let patch = self.unresolve(patch);
        {
            let mut data = self.data.lock().unwrap();
            let mut current = get_path(&data, key).cloned().filter(Value::is_object).unwrap_or_else(|| Value::Object(Map::new()));
            if let (Some(target), Value::Object(source)) = (current.as_object_mut(), patch) {
                target.extend(source);
            }
            set_path(&mut data, key, current);
        }
        self.persist()
    }

    pub fn config(&self) -> Value {
        self.get("config")
    }

    pub fn widget(&self, name: &str) -> Value {
        let value = self.get(&format!("widgets.{name}"));
        if value.is_null() { Value::Object(Map::new()) } else { value }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_store(name: &str) -> Store {
        let dir = std::env::temp_dir().join(format!("meomeobot-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        Store::open(&Locations { user_data: dir.join("data (x86)"), config_file: dir.join("config.json") }).unwrap()
    }

    #[test]
    fn defaults_are_filled_in() {
        let store = temp_store("defaults");
        assert_eq!(store.get("config.chatWidgetPort"), json!(8087));
        assert!(store.get("commands").is_object());
    }

    #[test]
    fn user_data_paths_round_trip_even_with_regex_characters() {
        let store = temp_store("paths");
        let path = format!("{}/sounds/a.mp3", store.user_data_str());
        store.set("config.rewardSounds", json!({ "r": path.clone() })).unwrap();
        let raw = store.data.lock().unwrap()["config"]["rewardSounds"]["r"].clone();
        assert_eq!(raw, json!("{userData}/sounds/a.mp3"));
        assert_eq!(store.get("config.rewardSounds.r"), json!(path));
    }

    #[test]
    fn merge_keeps_existing_keys() {
        let store = temp_store("merge");
        store.merge("widgets.chat", json!({ "maxMessages": 20 })).unwrap();
        assert_eq!(store.get("widgets.chat.maxMessages"), json!(20));
        assert!(store.get("widgets.chat.badgePrefs").is_object());
    }
}
