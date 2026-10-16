#[path = "../../ruvector-language/examples/support/memory.rs"]
mod memory;
use ruvector_language_learning::{learn_and_evaluate, Case, Config};
fn fixture(n: usize, seed: u64) -> ruvector_language::RunRequest {
    let mut request = memory::request(n, seed);
    request.context.max_steps = 500_000;
    request
}
fn main() -> Result<(), String> {
    let train = (0..12)
        .map(|i| Case {
            id: format!("train-{i}"),
            request: fixture(if i % 2 == 0 { 128 } else { 256 }, i),
            queries: 4,
        })
        .collect::<Vec<_>>();
    let holdout = [384, 768, 1536]
        .into_iter()
        .enumerate()
        .map(|(i, n)| Case {
            id: format!("holdout-{i}"),
            request: fixture(n, 100 + i as u64),
            queries: 6 + i,
        })
        .collect::<Vec<_>>();
    let report = learn_and_evaluate(&train, &holdout, Config::default())?;
    println!(
        "{}",
        serde_json::to_string_pretty(&report).map_err(|e| e.to_string())?
    );
    Ok(())
}
