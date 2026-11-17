use crate::config::Store;
use crate::widgets::{Hub, ServerId};
use serde_json::{json, Value};
use shared::ALERT_TYPES;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use std::time::Duration;

pub fn escape_html(value: &str) -> String {
    value.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&#39;")
}

fn text_of(value: &Value) -> String {
    match value {
        Value::Null => String::new(),
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

pub fn build(store: &Store, kind: &str, data: &Value) -> Option<Value> {
    let config = store.widget("alerts")[kind].clone();
    if config["enabled"] == json!(false) {
        return None;
    }

    let username = data["username"].as_str().filter(|u| !u.is_empty()).unwrap_or("Inconnu");
    let amount = &data["amount"];
    let default_text = ALERT_TYPES.iter().find(|(k, _, _)| *k == kind).map(|(_, _, t)| *t).unwrap_or("Nouvelle alerte");
    let template = data["text"].as_str().filter(|t| !t.is_empty())
        .or_else(|| config["textTemplate"].as_str().filter(|t| !t.is_empty()))
        .unwrap_or(default_text);
    let plural = amount.as_f64().map(|a| a > 1.0).unwrap_or(false);

    let text = template
        .replace("{username}", &format!("<span class=\"alert-username\">{}</span>", escape_html(username)))
        .replace("{amount}", &format!("<span class=\"alert-amount\">{}</span>", escape_html(&text_of(amount))))
        .replace("{months}", &format!("<span class=\"alert-months\">{}</span>", escape_html(&text_of(&data["months"]))))
        .replace("{s}", if plural { "s" } else { "" });

    let pick = |key: &str| if data[key].is_null() { config[key].clone() } else { data[key].clone() };
    let message = if matches!(kind, "sub" | "resub" | "subgift") { String::new() } else { text_of(&data["message"]) };

    Some(json!({
        "type": kind,
        "username": username,
        "amount": amount,
        "message": message,
        "text": text,
        "image": pick("image"),
        "audio": pick("audio"),
        "volume": pick("volume"),
        "duration": pick("duration"),
        "isVod": pick("isVod").as_bool().unwrap_or(false),
        "platform": "twitch"
    }))
}

pub fn test_payload(kind: &str) -> Value {
    match kind {
        "resub" => json!({ "username": "TestResubber", "months": 12, "message": "Message de test" }),
        "subgift" => json!({ "username": "TestGifter", "amount": 5 }),
        "raid" => json!({ "username": "TestRaider", "viewers": 150 }),
        "cheer" => json!({ "username": "TestCheerer", "amount": 500, "message": "Message de test" }),
        "hypetrain" => json!({ "username": "Twitch", "amount": 2 }),
        "donation" => json!({ "username": "TestDonor", "amount": "5,00 €", "message": "Message de test" }),
        "sub" => json!({ "username": "TestSubscriber" }),
        _ => json!({ "username": "TestUser" }),
    }
}

#[derive(Default)]
struct QueueState {
    queue: VecDeque<Value>,
    playing: bool,
    generation: u64,
}

pub struct AlertQueue {
    hub: Arc<Hub>,
    state: Mutex<QueueState>,
}

impl AlertQueue {
    pub fn new(hub: Arc<Hub>) -> Arc<Self> {
        Arc::new(AlertQueue { hub, state: Mutex::new(QueueState::default()) })
    }

    pub fn push(self: &Arc<Self>, alert: Value) {
        self.state.lock().unwrap().queue.push_back(alert);
        self.process();
    }

    pub fn finished(self: &Arc<Self>) {
        self.state.lock().unwrap().playing = false;
        self.process();
    }

    pub fn process(self: &Arc<Self>) {
        let (alert, generation) = {
            let mut state = self.state.lock().unwrap();
            if state.playing || state.queue.is_empty() || !self.hub.has_clients(ServerId::Alerts) {
                return;
            }
            let alert = state.queue.pop_front().unwrap();
            state.playing = true;
            state.generation += 1;
            (alert, state.generation)
        };

        self.hub.broadcast(ServerId::Alerts, &json!({ "type": "alert", "alert": alert }));

        let duration = alert["duration"].as_u64().filter(|d| *d > 0).unwrap_or(5000);
        let wait = if self.hub.has_widget_clients(ServerId::Alerts) { duration + 2000 } else { duration };
        let queue = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(Duration::from_millis(wait)).await;
            let expired = {
                let mut state = queue.state.lock().unwrap();
                let expired = state.playing && state.generation == generation;
                if expired {
                    state.playing = false;
                }
                expired
            };
            if expired {
                queue.process();
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Locations, Store};

    fn store(name: &str, alerts: Value) -> Store {
        let dir = std::env::temp_dir().join(format!("meomeobot-alerts-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        let store = Store::open(&Locations { user_data: dir.clone(), config_file: dir.join("config.json") }).unwrap();
        store.set("widgets.alerts", alerts).unwrap();
        store
    }

    #[test]
    fn usernames_are_escaped() {
        let alert = build(&store("escape", json!({})), "donation", &json!({ "username": "<img src=x onerror=alert(1)>", "amount": "5 €" })).unwrap();
        let text = alert["text"].as_str().unwrap();
        assert!(!text.contains("<img"));
        assert!(text.contains("&lt;img src=x onerror=alert(1)&gt;"));
    }

    #[test]
    fn every_placeholder_occurrence_is_filled() {
        let alert = build(&store("repeat", json!({ "follow": { "textTemplate": "{username} {username}" } })), "follow", &json!({ "username": "Bob" })).unwrap();
        assert_eq!(alert["text"].as_str().unwrap().matches("Bob").count(), 2);
    }

    #[test]
    fn disabled_types_are_skipped() {
        assert!(build(&store("disabled", json!({ "raid": { "enabled": false } })), "raid", &json!({ "username": "X" })).is_none());
    }

    #[test]
    fn sub_messages_are_dropped_and_plural_applied() {
        let alert = build(&store("plural", json!({})), "subgift", &json!({ "username": "G", "amount": 3, "message": "hi" })).unwrap();
        assert_eq!(alert["message"], "");
        assert!(alert["text"].as_str().unwrap().contains("subs"));
    }
}
