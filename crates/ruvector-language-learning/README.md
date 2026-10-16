# RuGraph governed strategy learning

Optional host integration with the real pinned RuVector SONA engine. The learner records measured cold and prepared execution quality, updates MicroLoRA state, extracts ReasoningBank patterns, and uses learned pattern quality to recommend a strategy on separate evaluation requests.

```sh
bash scripts/test-graph-language-learning.sh
cargo run --manifest-path crates/ruvector-language-learning/Cargo.toml --locked --release --example strategy_learning > learning-report.json
```

The library entry point is `learn_and_evaluate(&train, &holdout, Config::default())`. Each `Case` contains an ID, a `RunRequest`, and a bounded number of repeated queries over the same immutable snapshot. No shell, network, external model or paid service is required. This is host Rust code; it does not add SONA to the browser runtime.

Promotion is advisory and requires every held out workload to improve by at least 10 percent after including preparation and recommendation time. Every receipt must match exactly. Invalid metrics, unchanged learned state, dropped trajectories or regressions prevent promotion. Rules, evidence, capabilities, clocks and budgets never evolve. `report.rollback()` restores the cold recommendation unconditionally.

The checked in [measurement report](reports/strategy-learning.json) contains all raw samples. On that synthetic run, SONA changed both MicroLoRA states and extracted two patterns per strategy, selecting prepared execution on all three held out workloads. Aggregate latency fell 79.44 percent relative to cold execution, including preparation and policy lookup. Static prepared execution achieved 79.46 percent, so this experiment does **not** demonstrate a performance benefit from learning over the static policy. Training took 231 milliseconds. The estimated five suite repetitions recover training cost only; evaluation experiment costs, process startup and deployment costs are additional.

Timing and SONA initialization are nondeterministic. The evaluator uses unseen graph sizes and reuse counts, but the same synthetic query family. Representative production workloads are needed before deploying this policy. Future repeated queries must still match the immutable snapshot reuse contract.

The JSON report can be attached to an RVF artifact. It contains hashes and measurements, not a complete restorable SONA checkpoint or authenticated source evidence. See [ADR GL 012](../../docs/adr/ADR-GL-012-governed-learning.md) for bounds, trust boundaries and limitations.
