use wasm_bindgen::prelude::*;
use zeta_prompt::{Zeta2PromptInput, ZetaFormat};

const FORMAT: ZetaFormat = ZetaFormat::V0318SeedMultiRegions;

fn error(value: impl std::fmt::Display) -> JsValue {
    JsValue::from_str(&value.to_string())
}

#[wasm_bindgen]
pub fn prepare(json: &str) -> Result<String, JsValue> {
    let mut value: serde_json::Value = serde_json::from_str(json).map_err(error)?;
    let text = value["cursor_excerpt"].as_str().ok_or_else(|| error("Missing text"))?;
    let cursor = value["cursor_offset_in_excerpt"].as_u64().ok_or_else(|| error("Missing cursor"))? as usize;
    if !text.is_char_boundary(cursor) {
        return Err(error("Invalid UTF-8 cursor offset"));
    }
    let ranges = zeta_prompt::compute_legacy_excerpt_ranges(text, cursor, &[]);
    value["excerpt_ranges"] = serde_json::to_value(ranges).map_err(error)?;
    let input: Zeta2PromptInput = serde_json::from_value(value).map_err(error)?;
    let prompt = zeta_prompt::format_zeta_prompt(&input, FORMAT).ok_or_else(|| error("Editor context exceeds Zeta prompt budget"))?;
    serde_json::to_string(&serde_json::json!({
        "prompt": prompt,
        "input": serde_json::to_string(&input).map_err(error)?,
        "stop": zeta_prompt::stop_tokens_for_format(FORMAT),
    })).map_err(error)
}

#[wasm_bindgen]
pub fn parse(output: &str, input: &str) -> Result<String, JsValue> {
    let input: Zeta2PromptInput = serde_json::from_str(input).map_err(error)?;
    let parsed = zeta_prompt::parse_zeta2_model_output(output, FORMAT, &input).map_err(error)?;
    serde_json::to_string(&parsed).map_err(error)
}
