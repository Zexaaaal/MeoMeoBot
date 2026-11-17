use crate::bot::Bot;
use futures_util::FutureExt;
use rust_socketio::asynchronous::{Client, ClientBuilder};
use rust_socketio::{Payload, TransportType};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};

pub struct Streamlabs {
    bot: Arc<Bot>,
    client: tokio::sync::Mutex<Option<Client>>,
    token: Mutex<String>,
}

fn donations(payload: &Payload) -> Vec<Value> {
    let Payload::Text(values) = payload else { return Vec::new() };
    values.iter()
        .filter(|event| event["type"] == "donation")
        .flat_map(|event| event["message"].as_array().cloned().unwrap_or_default())
        .collect()
}

impl Streamlabs {
    pub fn new(bot: Arc<Bot>) -> Arc<Self> {
        Arc::new(Streamlabs { bot, client: tokio::sync::Mutex::new(None), token: Mutex::new(String::new()) })
    }

    pub async fn restart(self: &Arc<Self>) {
        let token = self.bot.store.get_str("config.streamlabsSocketToken");
        if *self.token.lock().unwrap() == token && self.client.lock().await.is_some() {
            return;
        }
        if let Some(client) = self.client.lock().await.take() {
            let _ = client.disconnect().await;
        }
        *self.token.lock().unwrap() = token.clone();
        if token.is_empty() {
            return;
        }

        let bot = self.bot.clone();
        let result = ClientBuilder::new(format!("https://sockets.streamlabs.com?token={token}"))
            .transport_type(TransportType::Websocket)
            .reconnect(true)
            .on("event", move |payload: Payload, _| {
                let bot = bot.clone();
                async move {
                    for donation in donations(&payload) {
                        let name = donation["name"].as_str().unwrap_or("Inconnu").to_string();
                        bot.set_last_event("donation", json!({ "name": name, "amount": donation["amount"], "currency": donation["currency"] }));
                        bot.trigger_alert("donation", json!({ "username": name, "amount": donation["formatted_amount"], "message": donation["message"] }));
                    }
                }
                .boxed()
            })
            .connect()
            .await;

        match result {
            Ok(client) => {
                log::info!("Streamlabs connecté");
                *self.client.lock().await = Some(client);
            }
            Err(e) => log::error!("Connexion Streamlabs impossible : {e}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_donations_are_extracted() {
        let payload = Payload::Text(vec![
            json!({ "type": "donation", "message": [{ "name": "A", "amount": 5 }, { "name": "B", "amount": 2 }] }),
            json!({ "type": "follow", "message": [{ "name": "C" }] }),
        ]);
        let names: Vec<String> = donations(&payload).iter().map(|d| d["name"].as_str().unwrap().to_string()).collect();
        assert_eq!(names, vec!["A", "B"]);
    }
}
