# ADR GL 012: Bounded SONA strategy learning with immutable evaluation

Status: Accepted

## Context

RuGraph can reuse a validated immutable snapshot for repeated queries. Reuse is not free: constructing the prepared snapshot must be included when comparing execution strategies. Training a policy is also not automatically worthwhile when an always prepared policy already works. Learned confidence must never become evidence or alter host authority.

## Decision

Add the optional host crate `ruvector-language-learning`, using real `ruvector-sona` at immutable RuVector revision `f017d5f10c78b95843614f040f5cf22bfc1b3ac8`. No SONA code is copied or reimplemented. Two SonaEngine instances learn measured quality for cold and prepared execution. Each records bounded trajectories, flushes actual MicroLoRA updates, extracts ReasoningBank patterns and uses the nearest learned pattern quality to recommend a strategy. The report verifies that MicroLoRA weights changed and records learned pattern counts. MicroLoRA updates establish actual adaptation but are not themselves the strategy selector; ReasoningBank quality is the selector.

The only candidate surface is `Cold` versus `Prepared`. Both run the unchanged RuGraph evaluator with identical program, graph, clock, grants and budgets. No rules, graph facts, capability grants, model weights used for predictions or evidence statuses can be changed by this learner. The library has no network, subprocess or background scheduling surface.

The frozen evaluator measures both candidates using alternating execution order. Each timed prepared batch includes constructing and dropping its prepared snapshot and all queries. Every returned receipt is compared exactly with the cold reference, outside timing. The gate uses actual upstream Darwin Guard screening and requires at least 10 percent reduction on every holdout case, including strategy recommendation overhead, zero receipt differences, finite metrics, actual learned state changes and zero dropped trajectories. The active recommendation remains cold if any condition fails. `Report::rollback` always resets it to cold. Promotion is advisory and requires application integration; this crate does not silently install a production policy.

Train and evaluation IDs must be disjoint using upstream `assert_train_eval_disjoint`. Serialized request SHA256 values must also be disjoint, preventing relabelled identical inputs. This cannot prove distribution independence. The runnable example trains on 128 and 256 node synthetic graphs with four queries per batch, then evaluates 384, 768 and 1536 node graphs with six through eight queries. It does not establish generalization to production data or other query families.

## Bounds and reproducibility

One experiment accepts 10 through 32 training cases and 1 through 16 evaluation cases, one through 16 queries per case and odd three through nine timing rounds. SONA dimensions and ranks are fixed at eight and two; its buffers accept 32 through 128 trajectories, with a minimum sufficient for the training corpus. IDs are unique within each split and at most 128 bytes. Requests are capped at 8 MiB through a streaming hash writer before executing; program work budgets cannot exceed ten million. Before learning, checked arithmetic reserves all reference and timed executions at the lesser of the program and host work limits, rejecting an aggregate above one billion logical work units. The demo sets its host maximum to 500,000 units per execution. The core evaluator retains its own validation and work limits. Finite measured rewards and finite learned MicroLoRA weights are checked. The bounded experiment owns and drops all learning state on return, so repeated API calls do not create an unbounded persistent bank.

Cargo.lock fixes dependency versions. SONA initialization and clustering use upstream randomness, and timings depend on the host. Results are deliberately not bit reproducible. Receipt equality remains deterministic for the fixed request. Timing improvements must never be required for CI success. Tests check real state changes and valid patterns, content contamination rejection, bounds, deterministic promotion failures and rollback.

The serializable JSON report includes raw paired samples, request hashes, reference receipt hashes, learned recommendation and pattern quality, training time including SONA initialization, inference time, aggregate work reservation, estimated evaluation suite repetitions to recover training cost, and a static always prepared comparison. Training cost is separate and must be amortized against the caller's actual future workload. An apparent gain over cold does not show a gain from learning over the static prepared policy. JSON can be attached to an RVF artifact by the independent artifact layer. It is not a complete SONA checkpoint, signature, trust claim or authenticated evidence source.

## Run

```sh
bash scripts/test-graph-language-learning.sh
cargo run --manifest-path crates/ruvector-language-learning/Cargo.toml --locked --release --example strategy_learning > learning-report.json
```

## Consequences

This is a concrete, bounded feedback and evaluation loop rather than autonomous recursive self modification. The immediate cost includes training runs and SONA processing, which may exceed any savings on small workloads. Retain the static baseline and refuse production activation without representative independent workloads. The supported rollback is cold execution; immutable program and evidence semantics are retained throughout.
