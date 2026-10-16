//! String-only WASM ABI: JSON integer precision and duplicate-key checks survive JS.
//! Every execution has explicit host context; there is no I/O or ambient clock.
use ruvector_language::{audit, compiler, parser, runtime, Error, Program, Receipt, Result};
use serde::{de::DeserializeOwned, Serialize};
use wasm_bindgen::prelude::*;

const MAX_BYTES: usize = 16 * 1024 * 1024;

fn bounded(text: &str) -> Result<()> {
    if text.len() > MAX_BYTES {
        return Err(Error::new("INPUT_LIMIT", "Input exceeds 16 MiB"));
    }
    Ok(())
}
fn decode<T: DeserializeOwned>(text: &str) -> Result<T> {
    bounded(text)?;
    serde_json::from_value(parser::strict_json(text)?)
        .map_err(|e| Error::new("INVALID_INPUT", e.to_string()))
}
fn program(text: &str) -> Result<Program> {
    bounded(text)?;
    if text.trim_start().starts_with('{') {
        parser::parse_json(text)
    } else {
        parser::parse(text)
    }
}
fn json<T: Serialize>(value: &T) -> Result<String> {
    let output =
        serde_json::to_string(value).map_err(|e| Error::new("SERIALIZATION", e.to_string()))?;
    if output.len() > MAX_BYTES {
        return Err(Error::new("OUTPUT_LIMIT", "Output exceeds 16 MiB"));
    }
    Ok(output)
}
fn exported(result: Result<String>) -> std::result::Result<String, JsValue> {
    result.map_err(|error| {
        JsValue::from_str(&serde_json::to_string(&error).expect("Error serializes"))
    })
}
fn compile_inner(source: &str) -> Result<String> {
    let parsed = program(source)?;
    compiler::check(&parsed)?;
    // Serialize through the same bounded boundary after canonical compilation.
    let output = compiler::canonical_json(&parsed)?;
    if output.len() > MAX_BYTES {
        return Err(Error::new("OUTPUT_LIMIT", "Output exceeds 16 MiB"));
    }
    Ok(output)
}
fn run_inner(request: &str) -> Result<String> {
    bounded(request)?;
    let request = parser::parse_request_json(request)?;
    json(&runtime::execute(
        &request.program,
        &request.snapshot,
        &request.context,
        None,
    )?)
}

/// Parse and type/effect check text or strict program JSON; return canonical JSON.
#[wasm_bindgen(js_name = compile)]
pub fn compile(source: &str) -> std::result::Result<String, JsValue> {
    exported(compile_inner(source))
}
/// Validate a program without executing it.
#[wasm_bindgen(js_name = check)]
pub fn check(source: &str) -> std::result::Result<String, JsValue> {
    exported((|| {
        let parsed = program(source)?;
        compiler::check(&parsed)?;
        json(&serde_json::json!({"valid":true,"name":parsed.name,"version":parsed.version}))
    })())
}
/// Execute a strict RunRequest JSON string and return a receipt JSON string.
/// No predictor is installed. Predict operations fail with PROVIDER_UNAVAILABLE.
#[wasm_bindgen(js_name = run)]
pub fn run(request: &str) -> std::result::Result<String, JsValue> {
    exported(run_inner(request))
}
/// Execute again and compare the entire verified receipt, including work and hashes.
#[wasm_bindgen(js_name = replay)]
pub fn replay(request: &str, receipt: &str) -> std::result::Result<String, JsValue> {
    exported((|| {
        let previous: Receipt = decode(receipt)?;
        runtime::verify_receipt(&previous)?;
        let output = run_inner(request)?;
        let current: Receipt = decode(&output)?;
        if previous != current {
            return Err(Error::new(
                "REPLAY_MISMATCH",
                "Inputs or output differ from the receipt",
            ));
        }
        Ok(output)
    })())
}
/// Run bounded independent counterfactual interventions without mutating input.
#[wasm_bindgen(js_name = audit)]
pub fn audit_request(request: &str, options: &str) -> std::result::Result<String, JsValue> {
    exported((|| {
        bounded(request)?;
        let request = parser::parse_request_json(request)?;
        let options: audit::AuditOptions = decode(options)?;
        json(&audit::run(&request, &options)?)
    })())
}
/// Check receipt integrity only. This does not authenticate its producer.
#[wasm_bindgen(js_name = verify)]
pub fn verify(receipt: &str) -> std::result::Result<String, JsValue> {
    exported((|| {
        let receipt: Receipt = decode(receipt)?;
        runtime::verify_receipt(&receipt)?;
        json(
            &serde_json::json!({"valid":true,"receipt_hash":receipt.receipt_hash,
            "scope":"integrity only; not authenticity or replay"}),
        )
    })())
}
