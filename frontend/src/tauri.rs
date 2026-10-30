use serde::de::DeserializeOwned;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = ["window", "__TAURI__", "core"], js_name = invoke, catch)]
    async fn tauri_invoke(cmd: &str, args: JsValue) -> Result<JsValue, JsValue>;

    #[wasm_bindgen(js_namespace = ["window", "__TAURI__", "event"], js_name = listen)]
    async fn tauri_listen(event: &str, handler: &Closure<dyn FnMut(JsValue)>) -> JsValue;
}

fn to_js<T: Serialize>(value: &T) -> JsValue {
    value.serialize(&serde_wasm_bindgen::Serializer::json_compatible()).unwrap_or(JsValue::NULL)
}

pub async fn call<R: DeserializeOwned>(cmd: &str, args: impl Serialize) -> Result<R, String> {
    match tauri_invoke(cmd, to_js(&args)).await {
        Ok(value) => serde_wasm_bindgen::from_value(value).map_err(|e| e.to_string()),
        Err(error) => Err(error.as_string().unwrap_or_else(|| format!("{error:?}"))),
    }
}

pub async fn call0<R: DeserializeOwned>(cmd: &str) -> Result<R, String> {
    call(cmd, serde_json::json!({})).await
}

pub fn listen<T: DeserializeOwned + 'static>(event: &'static str, handler: impl Fn(T) + 'static) {
    let closure = Closure::<dyn FnMut(JsValue)>::new(move |raw: JsValue| {
        let payload = js_sys::Reflect::get(&raw, &JsValue::from_str("payload")).unwrap_or(JsValue::NULL);
        if let Ok(value) = serde_wasm_bindgen::from_value::<T>(payload) {
            handler(value);
        }
    });
    wasm_bindgen_futures::spawn_local(async move {
        tauri_listen(event, &closure).await;
        closure.forget();
    });
}
