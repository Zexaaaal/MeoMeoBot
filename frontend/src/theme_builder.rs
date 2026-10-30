use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::collections::{BTreeMap, HashMap};
use std::sync::OnceLock;

#[derive(Debug, Clone, Deserialize)]
pub struct Choice {
    pub label: String,
    pub value: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Prop {
    pub key: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub label: String,
    pub default: Value,
    pub min: Option<f64>,
    pub max: Option<f64>,
    pub step: Option<f64>,
    pub unit: Option<String>,
    #[serde(rename = "useUserColor", default)]
    pub use_user_color: bool,
    pub options: Option<Vec<Choice>>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Section {
    pub label: String,
    pub selector: String,
    pub props: Vec<Prop>,
}

pub type Values = BTreeMap<String, Value>;

const USER_COLOR_FLAG: &str = "--use-user-color";

pub fn value_key(section: &Section, prop_key: &str) -> String {
    format!("{}|{prop_key}", section.selector)
}

pub fn schema(widget: &str) -> Option<&'static Vec<Section>> {
    static SCHEMA: OnceLock<HashMap<String, Vec<Section>>> = OnceLock::new();
    SCHEMA.get_or_init(|| serde_json::from_str(include_str!("theme_schema.json")).unwrap_or_default()).get(widget)
}

pub fn defaults(widget: &str) -> Values {
    let mut values = Values::new();
    for section in schema(widget).into_iter().flatten() {
        for prop in &section.props {
            values.insert(value_key(section, &prop.key), prop.default.clone());
        }
    }
    values
}

fn keyframes(name: &str) -> &'static str {
    match name {
        "slideInBottom" => "@keyframes slideInBottom {\n    from { opacity: 0; transform: translateY(20px); }\n    to { opacity: 1; transform: translateY(0); }\n}\n\n",
        "slideInTop" => "@keyframes slideInTop {\n    from { opacity: 0; transform: translateY(-20px); }\n    to { opacity: 1; transform: translateY(0); }\n}\n\n",
        "slideInLeft" => "@keyframes slideInLeft {\n    from { opacity: 0; transform: translateX(-30px); }\n    to { opacity: 1; transform: translateX(0); }\n}\n\n",
        "slideInRight" => "@keyframes slideInRight {\n    from { opacity: 0; transform: translateX(30px); }\n    to { opacity: 1; transform: translateX(0); }\n}\n\n",
        "fadeIn" => "@keyframes fadeIn {\n    from { opacity: 0; }\n    to { opacity: 1; }\n}\n\n",
        "zoomIn" => "@keyframes zoomIn {\n    from { opacity: 0; transform: scale(0.8); }\n    to { opacity: 1; transform: scale(1); }\n}\n\n",
        "bounceIn" => "@keyframes bounceIn {\n    0% { opacity: 0; transform: scale(0.3); }\n    50% { opacity: 1; transform: scale(1.05); }\n    70% { transform: scale(0.95); }\n    100% { transform: scale(1); }\n}\n\n",
        _ => "",
    }
}

pub fn text(value: &Value) -> String {
    match value {
        Value::String(s) => s.clone(),
        Value::Null => String::new(),
        other => other.to_string(),
    }
}

fn last_block(css: &str, selector: &str) -> Option<String> {
    let re = Regex::new(&format!(r"(?s){}\s*\{{([^}}]*?)\}}", regex::escape(selector))).ok()?;
    re.captures_iter(css).last().map(|c| c[1].to_string())
}

fn capture(block: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern).ok()?.captures(block).map(|c| c[1].trim().to_string())
}

pub fn parse(css: &str, widget: &str) -> Values {
    let mut values = defaults(widget);
    for section in schema(widget).into_iter().flatten() {
        let Some(block) = last_block(css, &section.selector) else { continue };
        for prop in &section.props {
            let key = value_key(section, &prop.key);
            let parsed = match (prop.kind.as_str(), prop.key.as_str()) {
                ("toggle", "--user-color-bg") => Some(Value::Bool(block.contains("var(--user-color-soft)"))),
                (_, "animation-name") => {
                    if let Some(caps) = Regex::new(r"animation:\s*(\S+)\s+([\d.]+)s").unwrap().captures(&block) {
                        values.insert(value_key(section, "animation-duration"), serde_json::json!(caps[2].parse::<f64>().unwrap_or(0.3)));
                        Some(Value::String(caps[1].to_string()))
                    } else {
                        None
                    }
                }
                (_, "animation-duration") => continue,
                ("blur", _) => {
                    let property = if prop.key == "filter" { "filter" } else { "backdrop-filter" };
                    Some(serde_json::json!(capture(&block, &format!(r"{property}:\s*blur\((\d+)px\)")).and_then(|v| v.parse::<f64>().ok()).unwrap_or(0.0)))
                }
                ("gradient", _) => capture(&block, r"background:\s*(linear-gradient\([^;]+\))").map(Value::String),
                ("box-shadow", _) => Some(Value::String(capture(&block, r"box-shadow:\s*([^;]+)").unwrap_or_else(|| "none".into()))),
                ("text-shadow", _) => Some(Value::String(capture(&block, r"text-shadow:\s*([^;]+)").unwrap_or_else(|| "none".into()))),
                _ if prop.key == "color" && prop.use_user_color && block.contains("color: var(--user-color)") => {
                    values.insert(value_key(section, USER_COLOR_FLAG), Value::Bool(true));
                    None
                }
                _ => capture(&block, &format!(r"(?:^|[;\s]){}:\s*([^;]+)", regex::escape(&prop.key))).map(|raw| {
                    if prop.kind == "slider" {
                        serde_json::json!(raw.trim_end_matches(prop.unit.as_deref().unwrap_or("")).trim().parse::<f64>().unwrap_or(0.0))
                    } else {
                        Value::String(raw)
                    }
                }),
            };
            if let Some(value) = parsed {
                values.insert(key, value);
            }
        }
    }
    values
}

fn same(a: Option<&Value>, b: &Value) -> bool {
    a.map(|a| text(a) == text(b)).unwrap_or(false)
}

pub fn generate(widget: &str, values: &Values, base_css: &str, base_values: &Values) -> String {
    let Some(sections) = schema(widget) else { return base_css.to_string() };
    let mut css = if base_css.trim().is_empty() { String::new() } else { format!("{base_css}\n\n") };
    let mut animations: Vec<String> = Vec::new();

    for section in sections {
        let get = |key: &str| values.get(&value_key(section, key));
        let mut declarations: Vec<String> = Vec::new();

        for prop in &section.props {
            let key = value_key(section, &prop.key);
            let Some(value) = values.get(&key) else { continue };
            if value.is_null() {
                continue;
            }
            let unchanged = match base_values.get(&key) {
                Some(base) => text(base) == text(value),
                None => text(value) == text(&prop.default),
            };
            if !base_css.trim().is_empty() && unchanged {
                continue;
            }
            let v = text(value);
            match (prop.kind.as_str(), prop.key.as_str()) {
                ("toggle", "--user-color-bg") => {
                    if value == &Value::Bool(true) {
                        declarations.push("background: var(--user-color-soft)".into());
                    }
                }
                ("toggle", _) => {}
                ("blur", _) => {
                    if value.as_f64().unwrap_or(0.0) > 0.0 {
                        let property = if prop.key == "filter" { "filter" } else { "backdrop-filter" };
                        declarations.push(format!("{property}: blur({v}px)"));
                    }
                }
                ("gradient", _) => {
                    if !v.is_empty() {
                        declarations.push(format!("background: {v}"));
                    }
                }
                ("box-shadow" | "text-shadow", _) => {
                    if !v.is_empty() && v != "none" {
                        declarations.push(format!("{}: {v}", prop.kind));
                    }
                }
                (_, "animation-name") => {
                    if v != "none" && !v.is_empty() {
                        let duration = get("animation-duration").map(text).unwrap_or_else(|| "0.3".into());
                        declarations.push(format!("animation: {v} {duration}s ease-out forwards"));
                        if !animations.contains(&v) {
                            animations.push(v);
                        }
                    }
                }
                (_, "animation-duration") => {}
                (_, "border-width" | "border-color") if get("border-style").map(text).as_deref() == Some("none") => {}
                (_, "color") if prop.use_user_color && get(USER_COLOR_FLAG) == Some(&Value::Bool(true)) => {
                    declarations.push("color: var(--user-color)".into());
                }
                ("slider", _) => declarations.push(format!("{}: {v}{}", prop.key, prop.unit.as_deref().unwrap_or(""))),
                _ => {
                    if !v.is_empty() {
                        declarations.push(format!("{}: {v}", prop.key));
                    }
                }
            }
        }

        if section.selector == ".badge-img" {
            if let Some(width) = get("width").filter(|w| !same(base_values.get(&value_key(section, "width")), w)) {
                declarations.push(format!("height: {}px", text(width)));
            }
        }

        if !declarations.is_empty() {
            css.push_str(&format!("{} {{\n", section.selector));
            for declaration in declarations {
                css.push_str(&format!("    {declaration};\n"));
            }
            css.push_str("}\n\n");
        }
    }

    for name in animations {
        css.push_str(keyframes(&name));
    }
    css.trim_end().to_string() + "\n"
}

pub fn set_user_color(values: &mut Values, section: &Section, on: bool) {
    values.insert(value_key(section, USER_COLOR_FLAG), Value::Bool(on));
}

pub fn uses_user_color(values: &Values, section: &Section) -> bool {
    values.get(&value_key(section, USER_COLOR_FLAG)) == Some(&Value::Bool(true))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn every_widget_schema_loads() {
        for widget in ["chat", "spotify", "subgoals", "subgoals-list", "roulette"] {
            assert!(!schema(widget).unwrap().is_empty(), "{widget}");
        }
        assert!(schema("alerts").is_none());
    }

    #[test]
    fn generate_then_parse_round_trips() {
        let mut values = defaults("chat");
        values.insert("#chat-container|gap".into(), json!(18));
        values.insert(".msg-group|animation-name".into(), json!("fadeIn"));
        values.insert(".msg-group|animation-duration".into(), json!(0.5));
        let css = generate("chat", &values, "", &Values::new());
        assert!(css.contains("gap: 18px"));
        assert!(css.contains("animation: fadeIn 0.5s ease-out forwards"));
        assert!(css.contains("@keyframes fadeIn"));
        let parsed = parse(&css, "chat");
        assert_eq!(parsed["#chat-container|gap"], json!(18.0));
        assert_eq!(parsed[".msg-group|animation-name"], json!("fadeIn"));
        assert_eq!(parsed[".msg-group|animation-duration"], json!(0.5));
    }

    #[test]
    fn only_differences_from_the_base_theme_are_written() {
        let base = "#chat-container {\n    gap: 10px;\n}\n";
        let base_values = parse(base, "chat");
        let mut values = base_values.clone();
        assert_eq!(generate("chat", &values, base, &base_values).trim(), base.trim());
        values.insert("#chat-container|gap".into(), json!(25));
        let css = generate("chat", &values, base, &base_values);
        assert!(css.starts_with(base.trim_end()));
        assert!(css.contains("gap: 25px"));
    }

    #[test]
    fn border_details_are_skipped_without_a_border() {
        let mut values = defaults("chat");
        values.insert(".msg-group|border-style".into(), json!("none"));
        values.insert(".msg-group|border-width".into(), json!(4));
        let css = generate("chat", &values, "", &Values::new());
        assert!(!css.contains("border-width"));
    }
}
