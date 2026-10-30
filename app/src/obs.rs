use crate::config::Store;
use crate::widgets::{Hub, ServerId};
use anyhow::{anyhow, bail};
use base64::Engine;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::async_runtime::JoinHandle;
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

const DEFAULT_URL: &str = "ws://127.0.0.1:4455";
const RECONNECT_DELAY: Duration = Duration::from_secs(10);
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);

type Request = (String, Value, oneshot::Sender<anyhow::Result<Value>>);

pub struct Obs {
    store: Arc<Store>,
    hub: Arc<Hub>,
    connected: AtomicBool,
    sender: Mutex<Option<mpsc::UnboundedSender<Request>>>,
    task: Mutex<Option<JoinHandle<()>>>,
}

pub struct WidgetSource {
    pub widget: String,
    pub host: String,
    pub port: u16,
}

pub fn parse_widget_url(raw: &str) -> Option<WidgetSource> {
    let url = url::Url::parse(raw).ok()?;
    let host = url.host_str()?.to_string();
    let local = matches!(host.as_str(), "127.0.0.1" | "localhost" | "[::1]" | "::1")
        || host.starts_with("192.168.") || host.starts_with("10.")
        || host.strip_prefix("172.").and_then(|r| r.split('.').next()?.parse::<u8>().ok()).map(|n| (16..=31).contains(&n)).unwrap_or(false);
    if !local {
        return None;
    }
    let mut segments = url.path_segments()?;
    let kind = segments.next()?;
    let widget = segments.next()?.to_lowercase();
    if !(kind == "widget" || kind == "go") || segments.next().is_some() || widget.is_empty() {
        return None;
    }
    Some(WidgetSource { widget, host, port: url.port().unwrap_or(80) })
}

fn auth_string(password: &str, salt: &str, challenge: &str) -> String {
    let b64 = base64::engine::general_purpose::STANDARD;
    let secret = b64.encode(Sha256::digest(format!("{password}{salt}")));
    b64.encode(Sha256::digest(format!("{secret}{challenge}")))
}

impl Obs {
    pub fn new(store: Arc<Store>, hub: Arc<Hub>) -> Arc<Self> {
        Arc::new(Obs { store, hub, connected: AtomicBool::new(false), sender: Mutex::new(None), task: Mutex::new(None) })
    }

    pub fn enabled(&self) -> bool {
        self.store.get("config.obsWebsocketEnabled") != json!(false)
    }

    pub fn is_connected(&self) -> bool {
        self.connected.load(Ordering::Relaxed)
    }

    pub fn restart(self: &Arc<Self>) {
        if let Some(task) = self.task.lock().unwrap().take() {
            task.abort();
        }
        self.connected.store(false, Ordering::Relaxed);
        *self.sender.lock().unwrap() = None;
        if !self.enabled() {
            return;
        }
        let obs = self.clone();
        *self.task.lock().unwrap() = Some(tauri::async_runtime::spawn(async move {
            loop {
                match obs.session().await {
                    Ok(()) => {}
                    Err(e) if e.to_string().contains("mot de passe") => {
                        log::error!("OBS : {e}");
                        return;
                    }
                    Err(_) => {}
                }
                obs.connected.store(false, Ordering::Relaxed);
                *obs.sender.lock().unwrap() = None;
                tokio::time::sleep(RECONNECT_DELAY).await;
            }
        }));
    }

    async fn session(self: &Arc<Self>) -> anyhow::Result<()> {
        let config = self.store.config();
        let url = config["obsWebsocketUrl"].as_str().filter(|u| !u.is_empty()).unwrap_or(DEFAULT_URL).to_string();
        let password = config["obsWebsocketPassword"].as_str().unwrap_or_default().to_string();

        let (ws, _) = tokio_tungstenite::connect_async(url.as_str()).await?;
        let (mut sink, mut stream) = ws.split();

        let hello = loop {
            match stream.next().await {
                Some(Ok(Message::Text(text))) => break serde_json::from_str::<Value>(&text)?,
                Some(Ok(_)) => continue,
                _ => bail!("connexion fermée"),
            }
        };
        let mut identify = json!({ "rpcVersion": 1, "eventSubscriptions": 0 });
        if let Some(auth) = hello["d"]["authentication"].as_object() {
            if password.is_empty() {
                bail!("OBS exige un mot de passe WebSocket : renseigne-le dans Configuration > Intégrations");
            }
            identify["authentication"] = json!(auth_string(&password, auth["salt"].as_str().unwrap_or_default(), auth["challenge"].as_str().unwrap_or_default()));
        }
        sink.send(Message::Text(json!({ "op": 1, "d": identify }).to_string().into())).await?;

        let (tx, mut rx) = mpsc::unbounded_channel::<Request>();
        let mut pending: std::collections::HashMap<String, oneshot::Sender<anyhow::Result<Value>>> = Default::default();
        let mut next_id = 0u64;

        loop {
            tokio::select! {
                request = rx.recv() => {
                    let Some((kind, data, reply)) = request else { break };
                    next_id += 1;
                    let id = next_id.to_string();
                    let message = json!({ "op": 6, "d": { "requestType": kind, "requestId": id, "requestData": data } });
                    if sink.send(Message::Text(message.to_string().into())).await.is_err() {
                        let _ = reply.send(Err(anyhow!("socket OBS fermée")));
                        break;
                    }
                    pending.insert(id, reply);
                }
                incoming = stream.next() => {
                    let text = match incoming {
                        Some(Ok(Message::Text(text))) => text,
                        Some(Ok(_)) => continue,
                        _ => break,
                    };
                    let message: Value = serde_json::from_str(&text).unwrap_or_default();
                    match message["op"].as_u64() {
                        Some(2) => {
                            self.connected.store(true, Ordering::Relaxed);
                            *self.sender.lock().unwrap() = Some(tx.clone());
                            log::info!("Connecté à OBS");
                            let obs = self.clone();
                            tauri::async_runtime::spawn(async move {
                                if let Err(e) = obs.refresh_sources().await {
                                    log::warn!("Rafraîchissement OBS échoué : {e}");
                                }
                            });
                        }
                        Some(7) => {
                            let d = &message["d"];
                            if let Some(reply) = pending.remove(d["requestId"].as_str().unwrap_or_default()) {
                                let status = &d["requestStatus"];
                                let result = if status["result"] == json!(true) {
                                    Ok(d["responseData"].clone())
                                } else {
                                    Err(anyhow!("{}", status["comment"].as_str().unwrap_or("requête OBS refusée")))
                                };
                                let _ = reply.send(result);
                            }
                        }
                        _ => {}
                    }
                }
            }
        }
        Ok(())
    }

    async fn request(&self, kind: &str, data: Value) -> anyhow::Result<Value> {
        let sender = self.sender.lock().unwrap().clone().ok_or_else(|| anyhow!("OBS non connecté"))?;
        let (reply, response) = oneshot::channel();
        sender.send((kind.to_string(), data, reply)).map_err(|_| anyhow!("OBS non connecté"))?;
        tokio::time::timeout(REQUEST_TIMEOUT, response).await.map_err(|_| anyhow!("OBS ne répond pas"))??
    }

    pub async fn refresh_sources(&self) -> anyhow::Result<(u32, u32)> {
        let inputs = self.request("GetInputList", json!({ "inputKind": "browser_source" })).await?;
        let (mut refreshed, mut repaired) = (0, 0);
        for input in inputs["inputs"].as_array().cloned().unwrap_or_default() {
            let name = input["inputName"].as_str().unwrap_or_default().to_string();
            let Ok(settings) = self.request("GetInputSettings", json!({ "inputName": name })).await else { continue };
            let raw = settings["inputSettings"]["url"].as_str().unwrap_or_default().to_string();
            let Some(source) = parse_widget_url(&raw) else { continue };

            let expected = ServerId::owner_of(&source.widget).map(|id| self.hub.port(id)).filter(|p| *p > 0);
            if let Ok(mut url) = url::Url::parse(&raw) {
                let mut changed = false;
                if let Some(port) = expected.filter(|p| *p != source.port) {
                    let _ = url.set_port(Some(port));
                    changed = true;
                }
                if source.host != "127.0.0.1" {
                    let _ = url.set_host(Some("127.0.0.1"));
                    changed = true;
                }
                if changed && self.request("SetInputSettings", json!({ "inputName": name, "inputSettings": { "url": url.to_string() } })).await.is_ok() {
                    repaired += 1;
                }
            }
            if self.request("PressInputPropertiesButton", json!({ "inputName": name, "propertyName": "refreshnocache" })).await.is_ok() {
                refreshed += 1;
            }
        }
        Ok((refreshed, repaired))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn widget_urls_are_recognised() {
        let s = parse_widget_url("http://127.0.0.1:8087/widget/chat").unwrap();
        assert_eq!((s.widget.as_str(), s.port), ("chat", 8087));
        assert_eq!(parse_widget_url("http://localhost:8091/widget/daily-subs").unwrap().widget, "daily-subs");
        assert_eq!(parse_widget_url("http://127.0.0.1:8087/go/spotify").unwrap().widget, "spotify");
        assert_eq!(parse_widget_url("http://192.168.1.20:8093/widget/goals?id=abc").unwrap().widget, "goals");
    }

    #[test]
    fn unrelated_sources_are_ignored() {
        assert!(parse_widget_url("https://streamelements.com/overlay/x").is_none());
        assert!(parse_widget_url("http://8.8.8.8:8087/widget/chat").is_none());
        assert!(parse_widget_url("not a url").is_none());
        assert!(parse_widget_url("http://127.0.0.1:8087/widget/chat/extra").is_none());
    }

    #[test]
    fn auth_matches_obs_reference() {
        assert_eq!(auth_string("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY="),
            "1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
    }
}
