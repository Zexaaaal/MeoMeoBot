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

pub fn image_source(event: &PlanningEvent) -> String {
    if !event.image_url.is_empty() {
        return event.image_url.clone();
    }
    event.category.box_art_url.replace("{width}", "600").replace("{height}", "800")
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

fn draw_event(ctx: &CanvasRenderingContext2d, images: &Images, event: &PlanningEvent, x: f64, y: f64, w: f64, h: f64) {
    ctx.save();
    rounded(ctx, x, y, w, h, 8.0);
    ctx.set_fill_style_str("#1a1a1b");
    ctx.fill();
    ctx.clip();

    let picture = event.use_miniature.then(|| images.get(&image_source(event))).flatten();
    if let Some(image) = picture {
        cover(ctx, image, x, y, w, h);
    }
    ctx.set_fill_style_str("#7c3aed");
    ctx.fill_rect(x, y, 5.0, h);

    let title_size = (h * 0.12).clamp(16.0, 30.0);
    let time_size = (h * 0.1).clamp(14.0, 24.0);
    let game_size = (h * 0.08).clamp(12.0, 18.0);
    let lines = if event.show_game_title { title_size + time_size + game_size + 20.0 } else { title_size + time_size + 14.0 };
    let info_y = if picture.is_some() { y + h - lines - 16.0 } else { y + 12.0 };
    if picture.is_some() {
        ctx.set_fill_style_str("rgba(0, 0, 0, 0.75)");
        ctx.fill_rect(x, info_y - 8.0, w, lines + 24.0);
    }

    let text_x = x + 16.0;
    let max = w - 26.0;
    ctx.set_text_baseline("top");
    ctx.set_fill_style_str("#ffffff");
    ctx.set_font(&format!("800 {title_size}px {FONT}"));
    ctx.fill_text(&fit(ctx, &event.title.to_uppercase(), max), text_x, info_y).ok();
    ctx.set_fill_style_str("#fbbf24");
    ctx.set_font(&format!("600 {time_size}px {FONT}"));
    let time = match &event.end_time {
        Some(end) => format!("{} - {end}", event.start_time),
        None => event.start_time.clone(),
    };
    ctx.fill_text(&time, text_x, info_y + title_size + 6.0).ok();
    if event.show_game_title && !event.category.name.is_empty() {
        ctx.set_fill_style_str("#cccccc");
        ctx.set_font(&format!("600 {game_size}px {FONT}"));
        ctx.fill_text(&fit(ctx, &event.category.name, max), text_x, info_y + title_size + time_size + 12.0).ok();
    }
    ctx.restore();
}

pub fn render(canvas: &HtmlCanvasElement, state: &PlanningState, monday: NaiveDate, images: &Images) {
    canvas.set_width(WIDTH as u32);
    canvas.set_height(HEIGHT as u32);
    let Some(ctx) = canvas.get_context("2d").ok().flatten().and_then(|c| c.dyn_into::<CanvasRenderingContext2d>().ok()) else { return };

    match images.get(&state.background) {
        Some(background) => cover(&ctx, background, 0.0, 0.0, WIDTH, HEIGHT),
        None => {
            let gradient = ctx.create_linear_gradient(0.0, 0.0, WIDTH, HEIGHT);
            let _ = gradient.add_color_stop(0.0, "#1a1a1a");
            let _ = gradient.add_color_stop(1.0, "#2a2a2a");
            ctx.set_fill_style_canvas_gradient(&gradient);
            ctx.fill_rect(0.0, 0.0, WIDTH, HEIGHT);
        }
    }
    ctx.set_fill_style_str("rgba(0, 0, 0, 0.35)");
    ctx.fill_rect(0.0, 0.0, WIDTH, HEIGHT);

    ctx.set_text_baseline("middle");
    ctx.set_fill_style_str("#ffffff");
    ctx.set_font(&format!("800 80px {FONT}"));
    ctx.fill_text(&fit(&ctx, &state.title.to_uppercase(), WIDTH - 600.0), 60.0, 90.0).ok();

    let range = date_range(monday, state.start_sunday);
    ctx.set_font(&format!("600 32px {FONT}"));
    let pill_w = ctx.measure_text(&range).map(|m| m.width()).unwrap_or(200.0) + 50.0;
    rounded(&ctx, WIDTH - 60.0 - pill_w, 62.0, pill_w, 56.0, 28.0);
    ctx.set_fill_style_str("rgba(255, 255, 255, 0.15)");
    ctx.fill();
    ctx.set_fill_style_str("#ffffff");
    ctx.fill_text(&range, WIDTH - 60.0 - pill_w + 25.0, 90.0).ok();

    let labels_w = if state.compact { 0.0 } else { 50.0 };
    let (grid_x, grid_y, gap) = (60.0 + labels_w, 170.0, 8.0);
    let grid_w = WIDTH - 60.0 - grid_x;
    let col_w = (grid_w - gap * 6.0) / 7.0;
    let header_h = 36.0;
    let body_y = grid_y + header_h + 6.0;
    let body_h = HEIGHT - 40.0 - body_y;

    if !state.compact {
        ctx.set_font(&format!("600 16px {FONT}"));
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.7)");
        for hour in (0..=24).step_by(3) {
            ctx.fill_text(&format!("{hour}h"), 60.0, body_y + body_h * hour as f64 / 24.0).ok();
        }
    }

    for (column, day) in day_order(state.start_sunday).into_iter().enumerate() {
        let x = grid_x + column as f64 * (col_w + gap);
        rounded(&ctx, x, grid_y, col_w, header_h, 6.0);
        ctx.set_fill_style_str("rgba(255, 255, 255, 0.12)");
        ctx.fill();
        ctx.set_fill_style_str("#ffffff");
        ctx.set_font(&format!("700 18px {FONT}"));
        ctx.set_text_align("center");
        ctx.fill_text(DAYS[day], x + col_w / 2.0, grid_y + header_h / 2.0).ok();
        ctx.set_text_align("start");

        rounded(&ctx, x, body_y, col_w, body_h, 6.0);
        ctx.set_fill_style_str("rgba(0, 0, 0, 0.25)");
        ctx.fill();

        let date = (monday + Duration::days(day as i64)).to_string();
        let events = state.events.get(&date).cloned().unwrap_or_default();
        let placed = spans(&events);
        if state.compact {
            let card_h = ((body_h - 8.0) / placed.len().max(4) as f64 - 8.0).min(200.0);
            for (i, (event, _, _)) in placed.iter().enumerate() {
                draw_event(&ctx, images, event, x + 4.0, body_y + 4.0 + i as f64 * (card_h + 8.0), col_w - 8.0, card_h);
            }
        } else {
            for (event, start, end) in &placed {
                let top = body_y + body_h * *start as f64 / 1440.0;
                let height = (body_h * (*end - *start) as f64 / 1440.0).max(40.0);
                draw_event(&ctx, images, event, x + 2.0, top, col_w - 4.0, height);
            }
        }
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
        assert_eq!(image_source(&e), "https://static-cdn.jtvnw.net/ttv-boxart/1-600x800.jpg");
        e.image_url = "https://cdn.steamgriddb.com/x.png".into();
        assert_eq!(image_source(&e), "https://cdn.steamgriddb.com/x.png");
    }
}
