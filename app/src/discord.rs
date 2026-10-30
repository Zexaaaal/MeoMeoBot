use base64::Engine;
use reqwest::multipart::{Form, Part};
use serde_json::{json, Value};

pub fn parse_webhook(url: &str) -> Option<(String, String)> {
    let rest = url.split("/api/webhooks/").nth(1)?;
    let mut parts = rest.split(['/', '?']);
    let id = parts.next()?.to_string();
    let token = parts.next()?.to_string();
    (!id.is_empty() && id.chars().all(|c| c.is_ascii_digit()) && !token.is_empty()).then_some((id, token))
}

fn form(image: Vec<u8>, content: &str) -> Result<Form, String> {
    let payload = json!({ "content": content, "attachments": [{ "id": 0, "filename": "planning.jpg" }] });
    let file = Part::bytes(image).file_name("planning.jpg").mime_str("image/jpeg").map_err(|e| e.to_string())?;
    Ok(Form::new().text("payload_json", payload.to_string()).part("files[0]", file))
}

pub async fn publish(http: &reqwest::Client, webhook: &str, image_data_url: &str, content: &str, existing: Option<&str>) -> Result<String, String> {
    let (id, token) = parse_webhook(webhook).ok_or("URL de webhook Discord invalide")?;
    let encoded = image_data_url.split_once(',').map(|(_, b)| b).unwrap_or(image_data_url);
    let image = base64::engine::general_purpose::STANDARD.decode(encoded).map_err(|e| e.to_string())?;
    let base = format!("https://discord.com/api/webhooks/{id}/{token}");

    if let Some(message_id) = existing {
        let response = http.patch(format!("{base}/messages/{message_id}")).multipart(form(image.clone(), content)?).send().await;
        if let Ok(response) = response {
            if response.status().is_success() {
                let body: Value = response.json().await.unwrap_or_default();
                return Ok(body["id"].as_str().unwrap_or(message_id).to_string());
            }
        }
    }

    let response = http.post(format!("{base}?wait=true")).multipart(form(image, content)?).send().await.map_err(|e| e.to_string())?;
    let status = response.status();
    let body: Value = response.json().await.unwrap_or_default();
    if !status.is_success() {
        return Err(format!("Discord {status} : {}", body["message"].as_str().unwrap_or_default()));
    }
    body["id"].as_str().map(str::to_string).ok_or_else(|| "Réponse Discord inattendue".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn webhook_urls_are_parsed() {
        assert_eq!(parse_webhook("https://discord.com/api/webhooks/123/abc-DEF"), Some(("123".into(), "abc-DEF".into())));
        assert_eq!(parse_webhook("https://discordapp.com/api/webhooks/9/t?wait=true"), Some(("9".into(), "t".into())));
        assert_eq!(parse_webhook("https://example.com/hook"), None);
        assert_eq!(parse_webhook("https://discord.com/api/webhooks/abc/t"), None);
    }
}
