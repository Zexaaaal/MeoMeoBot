use chrono::{Duration, NaiveDate};
use shared::{PlanningEvent, PlanningState};
use std::collections::HashMap;
use wasm_bindgen::JsCast;
use web_sys::{CanvasRenderingContext2d, HtmlCanvasElement, HtmlImageElement};

pub const WIDTH: f64 = 1800.0;
pub const HEIGHT: f64 = 940.0;
const DAYS: [&str; 7] = ["LUNDI", "MARDI", "MERCREDI", "JEUDI", "VENDREDI", "SAMEDI", "DIMANCHE"];
const FONT: &str = "'Segoe UI', sans-serif";

pub type Images = HashMap<String, HtmlImageElement>;

pub fn day_order(start_sunday: bool) -> [usize; 7] {
    if start_sunday { [6, 0, 1, 2, 3, 4, 5] } else { [0, 1, 2, 3, 4, 5, 6] }
}

pub fn date_range(monday: NaiveDate, start_sunday: bool) -> String {
    let start = if start_sunday { monday - Duration::days(1) } else { monday };
    format!("{} - {}", start.format("%d.%m"), (start + Duration::days(6)).format("%d.%m"))
}

fn minutes(time: &str) -> Option<i64> {
    let (h, m) = time.split_once(':')?;
    Some(h.parse::<i64>().ok()? * 60 + m.parse::<i64>().ok()?)
}

pub fn spans(events: &[PlanningEvent]) -> Vec<(PlanningEvent, i64, i64)> {
    let mut sorted: Vec<PlanningEvent> = events.to_vec();
    sorted.sort_by(|a, b| a.start_time.cmp(&b.start_time));
    let mut result = Vec::new();
    for (i, event) in sorted.iter().enumerate() {
        let Some(start) = minutes(&event.start_time) else { continue };
        let end = match event.end_time.as_deref().and_then(minutes) {
            Some(end) if end > start => end,
            Some(_) => 24 * 60,
            None => sorted.get(i + 1).and_then(|n| minutes(&n.start_time)).filter(|n| *n > start).unwrap_or(24 * 60),
        };
        result.push((event.clone(), start, end.min(24 * 60)));
    }
    result
}

pub fn box_art(url: &str, width: u32, height: u32) -> String {
    let filled = url.replace("{width}", &width.to_string()).replace("{height}", &height.to_string());
    if !filled.contains("ttv-boxart") {
        return filled;
    }
    let sized = regex::Regex::new(r"-\d+x\d+\.(jpg|png|jpeg)").unwrap();
    sized.replace(&filled, format!("-{width}x{height}.$1").as_str()).into_owned()
}

pub fn image_source(event: &PlanningEvent) -> String {
    if !event.image_url.is_empty() {
        return event.image_url.clone();
    }
    box_art(&event.category.box_art_url, 1080, 1440)
}

fn rounded(ctx: &CanvasRenderingContext2d, x: f64, y: f64, w: f64, h: f64, r: f64) {
    let r = r.min(w / 2.0).min(h / 2.0);
    ctx.begin_path();
    ctx.move_to(x + r, y);
    ctx.arc_to(x + w, y, x + w, y + h, r).ok();
    ctx.arc_to(x + w, y + h, x, y + h, r).ok();
    ctx.arc_to(x, y + h, x, y, r).ok();
    ctx.arc_to(x, y, x + w, y, r).ok();
    ctx.close_path();
}

fn cover(ctx: &CanvasRenderingContext2d, image: &HtmlImageElement, x: f64, y: f64, w: f64, h: f64) {
    let (iw, ih) = (image.natural_width() as f64, image.natural_height() as f64);
    if iw <= 0.0 || ih <= 0.0 {
        return;
    }
    let scale = (w / iw).max(h / ih);
    let (sw, sh) = (w / scale, h / scale);
    let _ = ctx.draw_image_with_html_image_element_and_sw_and_sh_and_dx_and_dy_and_dw_and_dh(image, (iw - sw) / 2.0, (ih - sh) / 2.0, sw, sh, x, y, w, h);
}

fn fit(ctx: &CanvasRenderingContext2d, text: &str, max: f64) -> String {
    let width = |s: &str| ctx.measure_text(s).map(|m| m.width()).unwrap_or(0.0);
    if width(text) <= max {
        return text.to_string();
    }
    let mut chars: Vec<char> = text.chars().collect();
    while !chars.is_empty() && width(&format!("{}…", chars.iter().collect::<String>())) > max {
        chars.pop();
    }
    format!("{}…", chars.iter().collect::<String>())
}

fn wrap(ctx: &CanvasRenderingContext2d, text: &str, max: f64, lines: usize) -> Vec<String> {
    let width = |s: &str| ctx.measure_text(s).map(|m| m.width()).unwrap_or(0.0);
    let mut result: Vec<String> = Vec::new();
    let mut current = String::new();
    for word in text.split_whitespace() {
        let candidate = if current.is_empty() { word.to_string() } else { format!("{current} {word}") };
        if width(&candidate) <= max || current.is_empty() {
            current = candidate;
        } else {
            result.push(std::mem::take(&mut current));
            current = word.to_string();
        }
    }
    if !current.is_empty() {
        result.push(current);
    }
    if result.len() > lines {
        let rest = result[lines - 1..].join(" ");
        result.truncate(lines - 1);
        result.push(rest);
    }
    result.into_iter().map(|line| fit(ctx, &line, max)).collect()
}

struct Grid {
    x: f64,
    y: f64,
    col_w: f64,
    gap: f64,
    header_h: f64,
    body_y: f64,
    body_h: f64,
}

fn grid(state: &PlanningState) -> Grid {
    let x = if !state.align_hours { 20.0 } else { 20.0 + 60.0 + 10.0 + 15.0 };
    let y = 170.0;
    let gap = 8.0;
    let col_w = (WIDTH - 20.0 - x - gap * 6.0) / 7.0;
    let header_h = 30.0;
    let body_y = y + header_h;
    Grid { x, y, col_w, gap, header_h, body_y, body_h: HEIGHT - 20.0 - body_y }
}

fn draw_event(ctx: &CanvasRenderingContext2d, images: &Images, event: &PlanningEvent, x: f64, y: f64, w: f64, h: f64) {
    ctx.save();
    ctx.set_shadow_color("rgba(0, 0, 0, 0.5)");
    ctx.set_shadow_blur(5.0);
    ctx.set_shadow_offset_y(2.0);
    rounded(ctx, x, y, w, h, 6.0);
    ctx.set_fill_style_str("#1a1a1b");
    ctx.fill();
    ctx.restore();

    ctx.save();
    rounded(ctx, x, y, w, h, 6.0);
    ctx.clip();
    let picture = event.use_miniature.then(|| images.get(&image_source(event))).flatten();
    if let Some(image) = picture {
        cover(ctx, image, x, y, w, h);
        ctx.set_fill_style_str("rgba(0, 0, 0, 0.75)");
        ctx.fill_rect(x, y, w, h);
    }

    let title_size = (h * 0.12).clamp(14.0, 32.0);
    let time_size = (h * 0.10).clamp(12.0, 26.0);
    let game_size = (h * 0.07).clamp(10.0, 18.0);
    let max = w * 0.95 - 20.0;
    ctx.set_font(&format!("800 {title_size}px {FONT}"));
    let title = wrap(ctx, &event.title.to_uppercase(), max, 2);
    let show_game = event.show_game_title && !event.category.name.is_empty();
    let title_block = if title.is_empty() { 0.0 } else { title.len() as f64 * title_size * 1.1 + 6.0 };
    let block = title_block + time_size + if show_game { game_size + 6.0 } else { 0.0 };
    let mut cursor = y + (h - block) / 2.0;

    ctx.set_text_align("center");
    ctx.set_text_baseline("top");
    let center = x + w / 2.0;
    ctx.set_fill_style_str("#ffffff");
    for line in &title {
        ctx.fill_text(line, center, cursor).ok();
        cursor += title_size * 1.1;
    }
    if !title.is_empty() {
        cursor += 6.0;
    }
    ctx.set_fill_style_str("#fbbf24");
    ctx.set_font(&format!("500 {time_size}px {FONT}"));
    let time = match &event.end_time {
        Some(end) => format!("{} - {end}", event.start_time),
        None => event.start_time.clone(),
    };
    ctx.fill_text(&time, center, cursor).ok();
    cursor += time_size + 6.0;
    if show_game {
        ctx.set_fill_style_str("#cccccc");
        ctx.set_font(&format!("600 {game_size}px {FONT}"));
        ctx.fill_text(&fit(ctx, &event.category.name, max), center, cursor).ok();
    }
    ctx.restore();
}

pub fn hit(state: &PlanningState, x: f64, y: f64) -> Option<(usize, i64)> {
    let g = grid(state);
    if x < g.x || y < g.y || y > g.body_y + g.body_h {
        return None;
    }
    let column = ((x - g.x) / (g.col_w + g.gap)) as usize;
    if column > 6 {
        return None;
    }
    let minutes = (((y - g.body_y).max(0.0) / g.body_h * 1440.0) / 30.0).floor() as i64 * 30;
    Some((day_order(state.start_sunday)[column], minutes.min(1410)))
}

pub fn render(canvas: &HtmlCanvasElement, state: &PlanningState, monday: NaiveDate, images: &Images) {
    canvas.set_width(WIDTH as u32);
    canvas.set_height(HEIGHT as u32);
    let Some(ctx) = canvas.get_context("2d").ok().flatten().and_then(|c| c.dyn_into::<CanvasRenderingContext2d>().ok()) else { return };
    let _ = js_sys::Reflect::set(&ctx, &"imageSmoothingQuality".into(), &"high".into());

    ctx.set_fill_style_str("#000000");
    ctx.fill_rect(0.0, 0.0, WIDTH, HEIGHT);
    if let Some(background) = images.get(&state.background) {
        ctx.set_global_alpha(0.4);
        cover(&ctx, background, 0.0, 0.0, WIDTH, HEIGHT);
        ctx.set_global_alpha(1.0);
    }
    let fade = ctx.create_linear_gradient(0.0, 0.0, 0.0, 160.0);
    let _ = fade.add_color_stop(0.0, "rgba(0, 0, 0, 0.9)");
    let _ = fade.add_color_stop(1.0, "rgba(0, 0, 0, 0)");
    ctx.set_fill_style_canvas_gradient(&fade);
    ctx.fill_rect(0.0, 0.0, WIDTH, 160.0);

    ctx.set_text_baseline("middle");
    ctx.save();
    ctx.set_shadow_color("rgba(0, 0, 0, 0.4)");
    ctx.set_shadow_blur(8.0);
    ctx.set_shadow_offset_y(4.0);
    ctx.set_fill_style_str("#ffffff");
    ctx.set_font(&format!("800 80px {FONT}"));
    ctx.fill_text(&fit(&ctx, &state.title.to_uppercase(), WIDTH - 600.0), 40.0, 80.0).ok();
    ctx.restore();

    let range = date_range(monday, state.start_sunday);
    ctx.set_font(&format!("600 32px {FONT}"));
    let pill_w = ctx.measure_text(&range).map(|m| m.width()).unwrap_or(200.0) + 50.0;
    let pill_x = WIDTH - 40.0 - pill_w;
    rounded(&ctx, pill_x, 52.0, pill_w, 56.0, 28.0);
    ctx.set_fill_style_str("rgba(255, 255, 255, 0.15)");
    ctx.fill();
    ctx.set_stroke_style_str("rgba(255, 255, 255, 0.2)");
    ctx.set_line_width(1.0);
    ctx.stroke();
    ctx.set_fill_style_str("#ffffff");
    ctx.fill_text(&range, pill_x + 25.0, 80.0).ok();

    let g = grid(state);
    if state.align_hours {
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.2)");
        ctx.fill_rect(80.0, g.body_y, 1.0, g.body_h);
        ctx.set_font(&format!("600 14px {FONT}"));
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.9)");
        ctx.set_text_align("right");
        for hour in (0..=24).step_by(3) {
            ctx.fill_text(&format!("{hour}h"), 70.0, g.body_y + g.body_h * hour as f64 / 24.0).ok();
        }
        ctx.set_text_align("start");
    }

    for (column, day) in day_order(state.start_sunday).into_iter().enumerate() {
        let x = g.x + column as f64 * (g.col_w + g.gap);
        ctx.save();
        rounded(&ctx, x, g.y, g.col_w, g.header_h + g.body_h, 6.0);
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.05)");
        ctx.fill();
        ctx.set_stroke_style_str("rgba(255, 255, 255, 0.1)");
        ctx.stroke();
        ctx.clip();
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.1)");
        ctx.fill_rect(x, g.y, g.col_w, g.header_h);
        ctx.set_fill_style_str("#ffffff");
        ctx.set_font(&format!("700 14px {FONT}"));
        ctx.set_text_align("center");
        ctx.set_text_baseline("middle");
        ctx.fill_text(DAYS[day], x + g.col_w / 2.0, g.y + g.header_h / 2.0).ok();
        ctx.set_text_align("start");

        let date = (monday + Duration::days(day as i64)).to_string();
        let events = state.events.get(&date).cloned().unwrap_or_default();
        let placed = spans(&events);
        let (ex, ew) = (x + 2.0, g.col_w - 4.0);
        if !state.align_hours && !placed.is_empty() {
            let gap = 4.0;
            let available = g.body_h - 8.0;
            let natural = ew * 4.0 / 3.0;
            let card_h = natural.min((available - gap * (placed.len() as f64 - 1.0)) / placed.len() as f64);
            let total = card_h * placed.len() as f64 + gap * (placed.len() as f64 - 1.0);
            let mut top = g.body_y + (g.body_h - total) / 2.0;
            for (event, _, _) in &placed {
                draw_event(&ctx, images, event, ex, top, ew, card_h);
                top += card_h + gap;
            }
        } else {
            for (event, start, end) in &placed {
                let top = g.body_y + g.body_h * *start as f64 / 1440.0;
                let height = g.body_h * (*end - *start) as f64 / 1440.0;
                draw_event(&ctx, images, event, ex, top, ew, height);
            }
        }
        ctx.restore();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn event(start: &str, end: Option<&str>) -> PlanningEvent {
        PlanningEvent { start_time: start.into(), end_time: end.map(str::to_string), ..Default::default() }
    }

    #[test]
    fn spans_use_end_time_next_event_or_midnight() {
        let placed = spans(&[event("21:00", None), event("14:00", Some("18:30")), event("10:00", None)]);
        let ranges: Vec<(i64, i64)> = placed.iter().map(|(_, s, e)| (*s, *e)).collect();
        assert_eq!(ranges, vec![(600, 840), (840, 1110), (1260, 1440)]);
    }

    #[test]
    fn events_past_midnight_stop_at_midnight() {
        let placed = spans(&[event("22:00", Some("02:00"))]);
        assert_eq!((placed[0].1, placed[0].2), (1320, 1440));
    }

    #[test]
    fn sunday_start_changes_order_and_range() {
        let monday = NaiveDate::from_ymd_opt(2026, 10, 26).unwrap();
        assert_eq!(day_order(true)[0], 6);
        assert_eq!(date_range(monday, false), "26.10 - 01.11");
        assert_eq!(date_range(monday, true), "25.10 - 31.10");
    }

    #[test]
    fn twitch_box_art_placeholders_are_filled() {
        let mut e = event("20:00", None);
        e.category.box_art_url = "https://static-cdn.jtvnw.net/ttv-boxart/1-{width}x{height}.jpg".into();
        assert_eq!(image_source(&e), "https://static-cdn.jtvnw.net/ttv-boxart/1-1080x1440.jpg");
        e.category.box_art_url = "https://static-cdn.jtvnw.net/ttv-boxart/32982_IGDB-52x72.jpg".into();
        assert_eq!(image_source(&e), "https://static-cdn.jtvnw.net/ttv-boxart/32982_IGDB-1080x1440.jpg");
        e.image_url = "https://cdn.steamgriddb.com/x.png".into();
        assert_eq!(image_source(&e), "https://cdn.steamgriddb.com/x.png");
    }
}
