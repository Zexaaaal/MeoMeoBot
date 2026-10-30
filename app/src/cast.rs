use crate::widgets::{CastMedia, Hub, ServerId};
use anyhow::{anyhow, Result};
use rust_cast::channels::media::{Media, StreamType};
use rust_cast::channels::receiver::CastDeviceApp;
use sha2::{Digest, Sha256};
use shared::{CastDevice, CastVideo};
use std::collections::HashMap;
use std::net::UdpSocket;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const VIDEO_EXTENSIONS: &[&str] = &["webm", "mov", "avi", "mp4", "mkv", "m4v"];
const SERVICE: &str = "_googlecast._tcp.local.";

pub struct Cast {
    ffmpeg: PathBuf,
    cache: PathBuf,
    last: Mutex<Option<CastDevice>>,
}

impl Cast {
    pub fn new(ffmpeg: PathBuf, cache: PathBuf) -> Self {
        Cast { ffmpeg, cache, last: Mutex::new(None) }
    }

    pub async fn videos(&self, folder: &Path) -> Vec<CastVideo> {
        let Ok(entries) = std::fs::read_dir(folder) else { return Vec::new() };
        let mut paths: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.extension().and_then(|e| e.to_str()).is_some_and(|e| VIDEO_EXTENSIONS.contains(&e.to_lowercase().as_str())))
            .collect();
        paths.sort();
        let _ = std::fs::create_dir_all(&self.cache);
        let tasks = paths.into_iter().map(|path| async move {
            let thumbnail = self.thumbnail(&path).await;
            CastVideo {
                name: path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
                path: path.to_string_lossy().into_owned(),
                thumbnail,
            }
        });
        futures_util::future::join_all(tasks).await
    }

    async fn thumbnail(&self, video: &Path) -> Option<String> {
        let key = hex(&Sha256::digest(video.to_string_lossy().as_bytes())[..8]);
        let target = self.cache.join(format!("{key}.png"));
        if !target.exists() {
            let status = tokio::process::Command::new(&self.ffmpeg)
                .args(["-y", "-ss", "2", "-i"])
                .arg(video)
                .args(["-frames:v", "1", "-vf", "scale=320:180"])
                .arg(&target)
                .stdin(std::process::Stdio::null())
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null())
                .creation_flags(0x0800_0000)
                .status()
                .await;
            if !status.is_ok_and(|s| s.success()) {
                return None;
            }
        }
        let bytes = tokio::fs::read(&target).await.ok()?;
        Some(format!("data:image/png;base64,{}", base64::Engine::encode(&base64::engine::general_purpose::STANDARD, bytes)))
    }

    pub fn discover(timeout: Duration) -> Result<Vec<CastDevice>> {
        let daemon = mdns_sd::ServiceDaemon::new()?;
        let events = daemon.browse(SERVICE)?;
        let deadline = Instant::now() + timeout;
        let mut found: HashMap<String, CastDevice> = HashMap::new();
        while let Some(left) = deadline.checked_duration_since(Instant::now()) {
            let Ok(event) = events.recv_timeout(left) else { break };
            if let mdns_sd::ServiceEvent::ServiceResolved(info) = event {
                let Some(host) = info.get_addresses_v4().into_iter().next().map(|a| a.to_string()) else { continue };
                let name = info.get_property_val_str("fn").map(str::to_string).unwrap_or_else(|| info.get_fullname().trim_end_matches(SERVICE).trim_end_matches('.').to_string());
                found.insert(host.clone(), CastDevice { name, host, port: info.get_port() });
            }
        }
        let _ = daemon.shutdown();
        let mut devices: Vec<CastDevice> = found.into_values().collect();
        devices.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(devices)
    }

    pub fn play(&self, hub: &Hub, device: CastDevice, video: PathBuf) -> Result<()> {
        let ip = local_ip_towards(&device.host, device.port)?;
        hub.set_cast_media(Some(CastMedia { path: video, ffmpeg: self.ffmpeg.clone() }));
        let url = format!("http://{ip}:{}/cast/media?t={}", hub.port(ServerId::Chat), chrono::Utc::now().timestamp_millis());
        let cast = rust_cast::CastDevice::connect_without_host_verification(device.host.as_str(), device.port).map_err(|e| anyhow!("{e}"))?;
        cast.connection.connect("receiver-0").map_err(|e| anyhow!("{e}"))?;
        cast.heartbeat.ping().map_err(|e| anyhow!("{e}"))?;
        let app = cast.receiver.launch_app(&CastDeviceApp::DefaultMediaReceiver).map_err(|e| anyhow!("{e}"))?;
        cast.connection.connect(app.transport_id.as_str()).map_err(|e| anyhow!("{e}"))?;
        let media = Media { content_id: url, stream_type: StreamType::Buffered, content_type: "video/mp4".to_string(), metadata: None, duration: None };
        cast.media.load(app.transport_id.as_str(), app.session_id.as_str(), &media).map_err(|e| anyhow!("{e}"))?;
        *self.last.lock().unwrap() = Some(device);
        Ok(())
    }

    pub fn stop(&self, hub: &Hub) -> Result<()> {
        hub.set_cast_media(None);
        let Some(device) = self.last.lock().unwrap().take() else { return Ok(()) };
        let cast = rust_cast::CastDevice::connect_without_host_verification(device.host.as_str(), device.port).map_err(|e| anyhow!("{e}"))?;
        cast.connection.connect("receiver-0").map_err(|e| anyhow!("{e}"))?;
        let status = cast.receiver.get_status().map_err(|e| anyhow!("{e}"))?;
        for app in status.applications {
            cast.receiver.stop_app(app.session_id.as_str()).map_err(|e| anyhow!("{e}"))?;
        }
        Ok(())
    }
}

fn local_ip_towards(host: &str, port: u16) -> Result<std::net::IpAddr> {
    let socket = UdpSocket::bind("0.0.0.0:0")?;
    socket.connect((host, port))?;
    Ok(socket.local_addr()?.ip())
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
