use serde_json::{json, Map, Value};

const FORWARDED_NOTICES: &[&str] = &["announcement", "shared_chat_announcement", "viewer_milestone"];

fn badges(event: &Value) -> Vec<(String, String)> {
    event["badges"].as_array().map(|list| list.iter().filter_map(|b| {
        let set = b["set_id"].as_str()?.to_string();
        let id = match &b["id"] { Value::String(s) => s.clone(), other => other.to_string() };
        Some((set, id))
    }).collect()).unwrap_or_default()
}

fn badges_raw(event: &Value) -> String {
    badges(event).iter().map(|(set, id)| format!("{set}/{id}")).collect::<Vec<_>>().join(",")
}

fn badges_obj(event: &Value) -> Value {
    Value::Object(badges(event).into_iter().map(|(set, id)| (set, Value::String(id))).collect::<Map<_, _>>())
}

pub fn has_badge(event: &Value, set: &str) -> bool {
    badges(event).iter().any(|(s, _)| s == set)
}

pub fn fragments_to_emotes(fragments: &Value) -> Value {
    let mut emotes = Map::new();
    let mut cursor = 0usize;
    for fragment in fragments.as_array().into_iter().flatten() {
        let length = fragment["text"].as_str().unwrap_or_default().encode_utf16().count();
        if fragment["type"] == "emote" {
            if let Some(id) = fragment["emote"]["id"].as_str() {
                let entry = emotes.entry(id.to_string()).or_insert_with(|| json!([]));
                entry.as_array_mut().unwrap().push(json!({ "start": cursor, "end": cursor + length.max(1) - 1 }));
            }
        }
        cursor += length;
    }
    Value::Object(emotes)
}

fn base_message(event: &Value, text: String) -> Value {
    let login = event["chatter_user_login"].as_str().unwrap_or_default();
    json!({
        "type": "chat",
        "platform": "twitch",
        "username": login,
        "displayName": event["chatter_user_name"].as_str().unwrap_or(login),
        "text": text,
        "id": event["message_id"],
        "color": event["color"].as_str().filter(|c| !c.is_empty()).unwrap_or("#FFFFFF"),
        "badgesRaw": badges_raw(event),
        "badgesObj": badges_obj(event),
        "emotes": fragments_to_emotes(&event["message"]["fragments"]),
        "roomId": event["broadcaster_user_id"],
    })
}

pub fn to_widget_message(event: &Value) -> Value {
    let mut message = base_message(event, event["message"]["text"].as_str().unwrap_or_default().to_string());
    message["isWidgetHidden"] = json!(event["channel_points_custom_reward_id"].is_string());
    message
}

pub fn should_forward_notice(notice_type: &str) -> bool {
    FORWARDED_NOTICES.contains(&notice_type)
}

pub fn notice_to_widget_message(event: &Value) -> Value {
    let text = event["message"]["text"].as_str().filter(|t| !t.is_empty())
        .or_else(|| event["system_message"].as_str())
        .unwrap_or_default().to_string();
    let mut message = base_message(event, text);
    message["isWidgetHidden"] = json!(false);
    message
}

#[cfg(test)]
mod tests {
    use super::*;

    fn render(text: &str, emotes: &Value) -> String {
        let units: Vec<u16> = text.encode_utf16().collect();
        let mut ranges: Vec<(usize, usize, String)> = emotes.as_object().unwrap().iter().flat_map(|(id, list)| {
            list.as_array().unwrap().iter().map(|r| (r["start"].as_u64().unwrap() as usize, r["end"].as_u64().unwrap() as usize, id.clone())).collect::<Vec<_>>()
        }).collect();
        ranges.sort();
        let mut out = String::new();
        let mut pos = 0;
        for (start, end, id) in ranges {
            out.push_str(&String::from_utf16_lossy(&units[pos..start]));
            out.push_str(&format!("<{id}:{}>", String::from_utf16_lossy(&units[start..=end])));
            pos = end + 1;
        }
        out.push_str(&String::from_utf16_lossy(&units[pos..]));
        out
    }

    fn fragments(parts: &[(&str, Option<&str>)]) -> Value {
        Value::Array(parts.iter().map(|(text, emote)| match emote {
            Some(id) => json!({ "type": "emote", "text": text, "emote": { "id": id } }),
            None => json!({ "type": "text", "text": text }),
        }).collect())
    }

    #[test]
    fn offsets_survive_emoji() {
        let text = "gg 🎉 Kappa!";
        let emotes = fragments_to_emotes(&fragments(&[("gg 🎉 ", None), ("Kappa", Some("25")), ("!", None)]));
        assert_eq!(render(text, &emotes), "gg 🎉 <25:Kappa>!");
    }

    #[test]
    fn repeated_emotes_get_their_own_range() {
        let emotes = fragments_to_emotes(&fragments(&[("Kappa", Some("25")), (" ", None), ("Kappa", Some("25"))]));
        assert_eq!(emotes["25"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn badges_and_hidden_flag_are_mapped() {
        let event = json!({
            "chatter_user_login": "bob", "chatter_user_name": "Bob", "message_id": "m1",
            "message": { "text": "hi", "fragments": [] },
            "badges": [{ "set_id": "moderator", "id": "1" }, { "set_id": "subscriber", "id": "12" }],
            "channel_points_custom_reward_id": "r1"
        });
        let msg = to_widget_message(&event);
        assert_eq!(msg["badgesRaw"], "moderator/1,subscriber/12");
        assert_eq!(msg["badgesObj"]["subscriber"], "12");
        assert_eq!(msg["isWidgetHidden"], true);
        assert!(has_badge(&event, "moderator"));
    }

    #[test]
    fn malformed_payloads_do_not_panic() {
        let msg = to_widget_message(&json!({}));
        assert_eq!(msg["text"], "");
        assert!(msg["emotes"].as_object().unwrap().is_empty());
    }

    #[test]
    fn only_selected_notices_are_forwarded() {
        assert!(should_forward_notice("announcement"));
        assert!(!should_forward_notice("sub"));
    }
}
