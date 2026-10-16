//! Host-side advisory SONA learning. Evidence and capability semantics never evolve.
use ruvector_language::{runtime, RunRequest};
use ruvector_sona::{
    darwin_guard::{assert_train_eval_disjoint, Guard, Verdict},
    SonaConfig, SonaEngine,
};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::{collections::BTreeSet, hint::black_box, io::Write, time::Instant};

pub type Result<T> = std::result::Result<T, String>;
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Strategy {
    Cold,
    Prepared,
}
/// Callers own data, grants and clock. Each case reuses its immutable snapshot.
pub struct Case {
    pub id: String,
    pub request: RunRequest,
    pub queries: usize,
}
#[derive(Clone, Copy)]
pub struct Config {
    pub rounds: usize,
    pub buffer_capacity: usize,
}
impl Default for Config {
    fn default() -> Self {
        Self {
            rounds: 5,
            buffer_capacity: 64,
        }
    }
}
#[derive(Debug, Serialize)]
pub struct Measurement {
    pub id: String,
    pub request_sha256: String,
    pub queries: usize,
    pub cold_ns: Vec<u64>,
    pub prepared_ns: Vec<u64>,
    pub cold_median_ns: u64,
    pub prepared_median_ns: u64,
    pub all_receipts_equal: bool,
    pub receipt_hash: String,
}
#[derive(Debug, Serialize)]
pub struct Evaluation {
    pub measurement: Measurement,
    pub recommendation: Strategy,
    pub cold_pattern_quality: Option<f32>,
    pub prepared_pattern_quality: Option<f32>,
    pub candidate_benefit: f64,
    pub inference_ns: u64,
}
#[derive(Debug, Serialize)]
pub struct Report {
    pub schema_version: u32,
    pub upstream_revision: &'static str,
    pub training: Vec<Measurement>,
    pub evaluation: Vec<Evaluation>,
    pub micro_lora_changed: [bool; 2],
    pub patterns_stored: [usize; 2],
    pub trajectories_dropped: [u64; 2],
    pub training_elapsed_ns: u64,
    pub reserved_execution_work: u64,
    pub training_break_even_evaluation_suites: Option<u64>,
    pub inference_elapsed_ns: u64,
    pub promoted: bool,
    pub active_strategy: Strategy,
    pub rollback_strategy: Strategy,
    pub static_prepared_benefit: f64,
    pub learned_policy_benefit: f64,
    pub limitations: &'static str,
}
impl Report {
    /// Immediate explicit rollback; no learned parameter can veto this operation.
    pub fn rollback(&mut self) {
        self.active_strategy = Strategy::Cold;
        self.promoted = false;
    }
}
struct CappedHash {
    hash: Sha256,
    bytes: usize,
}
impl Write for CappedHash {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        if buf.len() > 8 * 1024 * 1024 - self.bytes {
            return Err(std::io::Error::other("case exceeds 8 MiB"));
        }
        self.bytes += buf.len();
        self.hash.update(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}
fn fingerprint(case: &Case) -> Result<String> {
    let mut writer = CappedHash {
        hash: Sha256::new(),
        bytes: 0,
    };
    serde_json::to_writer(&mut writer, &case.request).map_err(|e| e.to_string())?;
    Ok(format!("{:x}", writer.hash.finalize()))
}
fn validate(cases: &[Case]) -> Result<Vec<String>> {
    let mut ids = BTreeSet::new();
    cases
        .iter()
        .map(|case| {
            if case.id.is_empty()
                || case.id.len() > 128
                || !ids.insert(&case.id)
                || !(1..=16).contains(&case.queries)
                || case.request.program.budget > 10_000_000
            {
                return Err("invalid ID, duplicate ID, query count or program budget".into());
            }
            fingerprint(case)
        })
        .collect()
}
fn embedding(case: &Case) -> Vec<f32> {
    let s = &case.request.snapshot;
    vec![
        1.0,
        (s.nodes.len() as f32 + 1.0).ln() / 16.0,
        (s.edges.len() as f32 + 1.0).ln() / 16.0,
        (s.observations.len() as f32 + 1.0).ln() / 16.0,
        case.queries as f32 / 16.0,
        s.rules.len() as f32 / (s.rules.len() as f32 + 1.0),
        case.request.program.steps.len() as f32 / (case.request.program.steps.len() as f32 + 1.0),
        0.5,
    ]
}
fn nanos(start: Instant) -> u64 {
    start.elapsed().as_nanos().min(u64::MAX as u128) as u64
}
fn median(samples: &[u64]) -> u64 {
    let mut v = samples.to_vec();
    v.sort_unstable();
    v[v.len() / 2]
}
fn measure(case: &Case, hash: String, rounds: usize) -> Result<Measurement> {
    let r = &case.request;
    let expected =
        runtime::execute(&r.program, &r.snapshot, &r.context, None).map_err(|e| e.to_string())?;
    let mut cold = Vec::new();
    let mut prepared = Vec::new();
    let mut equal = true;
    for round in 0..rounds {
        // Alternate order. Preparation, execution and receipt storage are timed;
        // equality verification is performed outside both timing regions.
        for strategy in if round % 2 == 0 {
            [Strategy::Cold, Strategy::Prepared]
        } else {
            [Strategy::Prepared, Strategy::Cold]
        } {
            let start = Instant::now();
            let mut receipts = Vec::with_capacity(case.queries);
            match strategy {
                Strategy::Cold => {
                    for _ in 0..case.queries {
                        receipts.push(black_box(
                            runtime::execute(&r.program, &r.snapshot, &r.context, None)
                                .map_err(|e| e.to_string())?,
                        ));
                    }
                }
                Strategy::Prepared => {
                    let snapshot =
                        runtime::PreparedSnapshot::new(&r.snapshot).map_err(|e| e.to_string())?;
                    for _ in 0..case.queries {
                        receipts.push(black_box(
                            snapshot
                                .execute(&r.program, &r.context, None)
                                .map_err(|e| e.to_string())?,
                        ));
                    }
                }
            }
            let elapsed = nanos(start).max(1);
            match strategy {
                Strategy::Cold => cold.push(elapsed),
                Strategy::Prepared => prepared.push(elapsed),
            }
            equal &= receipts.iter().all(|receipt| *receipt == expected);
        }
    }
    Ok(Measurement {
        id: case.id.clone(),
        request_sha256: hash,
        queries: case.queries,
        cold_median_ns: median(&cold),
        prepared_median_ns: median(&prepared),
        cold_ns: cold,
        prepared_ns: prepared,
        all_receipts_equal: equal,
        receipt_hash: expected.receipt_hash,
    })
}
/// Immutable evaluator gate. Caller-supplied reports are not proof of execution.
pub fn promotion_allowed(benefits: &[f64], all_receipts_equal: bool, state_changed: bool) -> bool {
    !benefits.is_empty()
        && state_changed
        && all_receipts_equal
        && benefits.iter().all(|b| {
            matches!(
                Guard::deterministic().screen(
                    *b as f32,
                    b.is_finite(),
                    (-1.0..=1.0).contains(b),
                    *b < 0.10
                ),
                Verdict::Accepted(_)
            )
        })
}
/// One bounded experiment. Evaluation requests are never submitted to SONA.
/// Success is advisory: applications must explicitly use the reported strategy.
pub fn learn_and_evaluate(train: &[Case], holdout: &[Case], config: Config) -> Result<Report> {
    if !(10..=32).contains(&train.len())
        || !(1..=16).contains(&holdout.len())
        || !(3..=9).contains(&config.rounds)
        || config.rounds.is_multiple_of(2)
        || !(32..=128).contains(&config.buffer_capacity)
        || config.buffer_capacity < train.len()
    {
        return Err(
            "bounded config requires 10..32 train, 1..16 holdout, odd 3..9 rounds, buffer 32..128"
                .into(),
        );
    }
    let train_hashes = validate(train)?;
    let eval_hashes = validate(holdout)?;
    assert_train_eval_disjoint(
        &train.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
        &holdout.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
    )
    .map_err(|_| "train/eval IDs overlap")?;
    assert_train_eval_disjoint(
        &train_hashes.iter().map(String::as_str).collect::<Vec<_>>(),
        &eval_hashes.iter().map(String::as_str).collect::<Vec<_>>(),
    )
    .map_err(|_| "train/eval request content overlaps")?;
    let reserved_execution_work = train.iter().chain(holdout).try_fold(0u64, |total, case| {
        let executions = (2 * config.rounds * case.queries + 1) as u64;
        let work = executions
            .checked_mul(
                case.request
                    .program
                    .budget
                    .min(case.request.context.max_steps),
            )
            .and_then(|work| total.checked_add(work))
            .filter(|work| *work <= 1_000_000_000)
            .ok_or("aggregate reserved execution work exceeds one billion")?;
        Ok::<u64, String>(work)
    })?;
    let training_start = Instant::now();
    let engines = [0, 1].map(|_| {
        SonaEngine::with_config(SonaConfig {
            hidden_dim: 8,
            embedding_dim: 8,
            micro_lora_rank: 2,
            base_lora_rank: 2,
            pattern_clusters: 2,
            trajectory_capacity: config.buffer_capacity,
            quality_threshold: 0.0,
            ..SonaConfig::default()
        })
    });
    let before = engines
        .each_ref()
        .map(|e| e.coordinator().get_micro_lora_weights());
    let mut training = Vec::new();
    for (case, hash) in train.iter().zip(train_hashes) {
        let m = measure(case, hash, config.rounds)?;
        if !m.all_receipts_equal {
            return Err("training semantic regression".into());
        }
        let fastest = m.cold_median_ns.min(m.prepared_median_ns) as f32;
        for (i, latency) in [m.cold_median_ns, m.prepared_median_ns]
            .into_iter()
            .enumerate()
        {
            let quality = fastest / latency as f32;
            if !quality.is_finite() || !(0.0..=1.0).contains(&quality) {
                return Err("invalid measured quality".into());
            }
            let features = embedding(case);
            let mut t = engines[i].begin_trajectory(features.clone());
            t.add_step(features, vec![1.0; 8], quality);
            engines[i].submit_trajectory(t.build_with_latency(quality, latency / 1000));
        }
        training.push(m);
    }
    for engine in &engines {
        engine.flush();
        engine.force_learn();
    }
    let training_elapsed_ns = nanos(training_start);
    let after = engines
        .each_ref()
        .map(|e| e.coordinator().get_micro_lora_weights());
    if after
        .iter()
        .any(|(a, b)| a.iter().chain(b).any(|x| !x.is_finite()))
    {
        return Err("nonfinite learned state".into());
    }
    let changed = [0, 1].map(|i| before[i] != after[i]);
    let patterns = engines.each_ref().map(|e| e.stats().patterns_stored);
    let dropped = engines.each_ref().map(|e| e.stats().trajectories_dropped);
    let mut evaluation = Vec::new();
    let mut inference_elapsed_ns = 0;
    for (case, hash) in holdout.iter().zip(eval_hashes) {
        let start = Instant::now();
        let quality = engines.each_ref().map(|e| {
            e.find_patterns(&embedding(case), 1)
                .first()
                .map(|p| p.avg_quality)
                .filter(|q| q.is_finite() && (0.0..=1.0).contains(q))
        });
        let recommendation = match quality {
            [Some(a), Some(b)] if b > a => Strategy::Prepared,
            _ => Strategy::Cold,
        };
        let inference_ns = nanos(start);
        inference_elapsed_ns += inference_ns;
        let m = measure(case, hash, config.rounds)?;
        let candidate_benefit = if recommendation == Strategy::Prepared {
            1.0 - (m.prepared_median_ns as f64 + inference_ns as f64) / m.cold_median_ns as f64
        } else {
            -(inference_ns as f64) / m.cold_median_ns as f64
        };
        evaluation.push(Evaluation {
            measurement: m,
            recommendation,
            cold_pattern_quality: quality[0],
            prepared_pattern_quality: quality[1],
            candidate_benefit,
            inference_ns,
        });
    }
    let benefits = evaluation
        .iter()
        .map(|e| e.candidate_benefit)
        .collect::<Vec<_>>();
    let promoted = promotion_allowed(
        &benefits,
        evaluation.iter().all(|e| e.measurement.all_receipts_equal),
        changed.iter().all(|c| *c),
    ) && dropped == [0, 0];
    let cold_total: u64 = evaluation
        .iter()
        .map(|e| e.measurement.cold_median_ns)
        .sum();
    let static_total: u64 = evaluation
        .iter()
        .map(|e| e.measurement.prepared_median_ns)
        .sum();
    let learned_total: u64 = evaluation
        .iter()
        .map(|e| {
            if e.recommendation == Strategy::Prepared {
                e.measurement.prepared_median_ns
            } else {
                e.measurement.cold_median_ns
            }
        })
        .sum();
    let savings = cold_total as f64 - learned_total as f64 - inference_elapsed_ns as f64;
    let training_break_even_evaluation_suites =
        (savings > 0.0).then(|| (training_elapsed_ns as f64 / savings).ceil() as u64);
    Ok(Report { schema_version: 1, upstream_revision: "f017d5f10c78b95843614f040f5cf22bfc1b3ac8", training, evaluation,
      micro_lora_changed: changed, patterns_stored: patterns, trajectories_dropped: dropped, training_elapsed_ns, inference_elapsed_ns, reserved_execution_work, training_break_even_evaluation_suites,
      promoted, active_strategy: if promoted { Strategy::Prepared } else { Strategy::Cold }, rollback_strategy: Strategy::Cold,
      static_prepared_benefit: 1.0 - static_total as f64 / cold_total as f64,
      learned_policy_benefit: 1.0 - (learned_total + inference_elapsed_ns) as f64 / cold_total as f64,
      limitations: "Synthetic host experiment; no universal self-improvement, predictive accuracy or learned advantage over static prepared claimed. SONA initialization/clustering and wall clocks are nondeterministic. Training cost is reported separately, not amortized away. Timings include snapshot preparation and all batch queries; parsing/process startup excluded. All receipts checked exactly. ID/content disjointness cannot establish real-world distribution independence. MicroLoRA changes are diagnostics; ReasoningBank average quality drives strategy selection. Patterns advise strategy only; source truth, rules, grants and budgets never change. Report is JSON evidence for RVF attachment, not an authenticated learning checkpoint." })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::memory;
    fn fixture(n: usize, seed: u64) -> RunRequest {
        let mut r = memory::request(n, seed);
        r.context.max_steps = 100_000;
        r
    }
    fn cases() -> Vec<Case> {
        (0..10)
            .map(|i| Case {
                id: format!("train{i}"),
                request: fixture(16, i),
                queries: 2,
            })
            .collect()
    }
    #[test]
    fn immutable_gate_rejects_invalid_or_regressing_candidates() {
        assert!(promotion_allowed(&[0.1, 0.2], true, true));
        for benefits in [
            vec![],
            vec![f64::NAN],
            vec![f64::INFINITY],
            vec![0.099],
            vec![0.2, -0.1],
        ] {
            assert!(!promotion_allowed(&benefits, true, true));
        }
        assert!(!promotion_allowed(&[0.5], false, true));
        assert!(!promotion_allowed(&[0.5], true, false));
    }
    #[test]
    fn rejects_contamination_and_invalid_bounds_before_learning() {
        let train = cases();
        let eval = vec![Case {
            id: "renamed".into(),
            request: fixture(16, 0),
            queries: 3,
        }];
        assert!(learn_and_evaluate(&train, &eval, Config::default())
            .unwrap_err()
            .contains("content overlaps"));
        assert!(learn_and_evaluate(
            &train,
            &eval,
            Config {
                rounds: 0,
                buffer_capacity: 0
            }
        )
        .is_err());
        let mut excessive = cases();
        for c in &mut excessive {
            c.request.context.max_steps = 10_000_000;
            c.queries = 16;
        }
        let fresh = vec![Case {
            id: "holdout".into(),
            request: fixture(24, 100),
            queries: 2,
        }];
        assert!(learn_and_evaluate(&excessive, &fresh, Config::default())
            .unwrap_err()
            .contains("aggregate reserved"));
        let mut invalid = cases();
        invalid[0].queries = 17;
        assert!(validate(&invalid).is_err());
    }
    #[test]
    fn nonfinite_vectors_and_oversized_requests_fail_closed() {
        let mut train = cases();
        train[0].request.snapshot.nodes[0].vector = Some(vec![f32::NAN, 0.0]);
        let eval = vec![Case {
            id: "holdout".into(),
            request: fixture(24, 100),
            queries: 3,
        }];
        assert!(learn_and_evaluate(&train, &eval, Config::default()).is_err());
        let mut oversized = cases();
        oversized[0].request.snapshot.nodes[0].id = "x".repeat(8 * 1024 * 1024);
        assert!(validate(&oversized).is_err());
    }
    #[test]
    fn actual_sona_learning_and_explicit_rollback() {
        let train = cases();
        let eval = vec![Case {
            id: "holdout".into(),
            request: fixture(24, 100),
            queries: 3,
        }];
        let mut report = learn_and_evaluate(
            &train,
            &eval,
            Config {
                rounds: 3,
                ..Config::default()
            },
        )
        .unwrap();
        assert_eq!(report.micro_lora_changed, [true, true]);
        assert!(report.patterns_stored.iter().all(|n| *n > 0));
        assert_eq!(report.trajectories_dropped, [0, 0]);
        assert!(report
            .evaluation
            .iter()
            .all(|e| e.measurement.all_receipts_equal));
        assert!(report.evaluation[0].cold_pattern_quality.is_some());
        assert!(report.evaluation[0].prepared_pattern_quality.is_some());
        report.rollback();
        assert_eq!(report.active_strategy, Strategy::Cold);
        assert!(!report.promoted);
        assert!(serde_json::to_vec(&report).unwrap().len() < 1024 * 1024);
    }
}

#[cfg(test)]
#[path = "../../ruvector-language/examples/support/memory.rs"]
mod memory;
