#[path = "../../ruvector-language/examples/support/memory.rs"]
mod memory;
use ruvector_language::{runtime, Receipt, RunRequest};
use ruvector_language_learning::{learn_and_evaluate, Case, Config, Strategy};
use ruvector_language_rvf::{pack, unpack};
use std::collections::BTreeMap;

fn execute(strategy: Strategy, request: &RunRequest) -> Receipt {
    match strategy {
        Strategy::Cold => {
            runtime::execute(&request.program, &request.snapshot, &request.context, None)
        }
        Strategy::Prepared => runtime::PreparedSnapshot::new(&request.snapshot)
            .unwrap()
            .execute(&request.program, &request.context, None),
    }
    .unwrap()
}

#[test]
fn learned_policy_capsule_and_explicit_host_rollback_preserve_receipts() {
    let case = |id: String, size, seed| {
        let mut request = memory::request(size, seed);
        request.context.max_steps = 100_000;
        Case {
            id,
            request,
            queries: 4,
        }
    };
    let training = (0..12)
        .map(|i| case(format!("train-{i}"), 24 + i as usize, i))
        .collect::<Vec<_>>();
    let holdout = [case("heldout".into(), 64, 100)];
    let mut report = learn_and_evaluate(
        &training,
        &holdout,
        Config {
            rounds: 3,
            ..Config::default()
        },
    )
    .unwrap();
    let request = &holdout[0].request;
    let baseline = execute(Strategy::Cold, request);
    assert_eq!(execute(report.active_strategy, request), baseline);
    let report_json = serde_json::to_value(&report).unwrap();
    let bytes = pack(
        &serde_json::to_vec(request).unwrap(),
        &serde_json::to_vec(&baseline).unwrap(),
        BTreeMap::from([("learning-report.json".into(), report_json.clone())]),
    )
    .unwrap();
    let capsule = unpack(&bytes).unwrap();
    assert_eq!(capsule.receipt, baseline);
    assert_eq!(capsule.attachments["learning-report.json"], report_json);
    // Explicit host authority comes from the caller, never from the capsule's context.
    let replay = runtime::execute(
        &capsule.request.program,
        &capsule.request.snapshot,
        &request.context,
        None,
    )
    .unwrap();
    assert_eq!(replay, capsule.receipt);
    let mut denied = request.context.clone();
    denied.capabilities.clear();
    assert!(runtime::execute(
        &capsule.request.program,
        &capsule.request.snapshot,
        &denied,
        None
    )
    .is_err());
    report.rollback();
    assert_eq!(report.active_strategy, Strategy::Cold);
    assert_eq!(execute(report.active_strategy, request), baseline);
}
