# Portable execution and governed learning

## Outcome

Run the same bounded RuGraph program in a browser or Node without spawning a
native process. Preserve requests, receipts, and learning reports in a portable
RVF capsule. Use actual RuVector SONA learning to propose host execution policies,
then evaluate the proposal before selecting it.

The business target is lower deployment friction and lower repeated query cost
while preserving the ability to explain and reproduce every evidence decision.
No improvement in application accuracy is implied by changing an execution policy.

## Contracts

| Requirement | Invariant | Acceptance evidence |
|---|---|---|
| WASM execution | Same program, snapshot and context retain core semantics | Native versus WASM receipt comparison; permissions, expiry, replay and audit tests |
| Portable artifacts | RVF contains bounded data with validated hashes | Upstream RVF wire roundtrip; corruption, truncation, duplicate and size rejection |
| Host authority | Artifact content never grants execution permissions | Capsule verification does not execute programs or load executable segments |
| Learning | Actual SONA consumes bounded execution trajectories | Learned state changes and pattern retrieval are recorded |
| Promotion | Candidate must pass a frozen evaluation | At least 10% measured benefit and zero receipt differences on held out workloads |
| Rollback | Baseline remains available | Rejected or unsuitable candidates retain the ordinary execution strategy |
| Honest cost | Preparation belongs to the candidate's cost | Compare complete batches, including snapshot preparation, using paired timings |
| Data separation | Evaluation data does not train the proposer | Disjoint workload identifiers and distinct synthetic evaluation cases |

## Control flow

1. Parse and validate the program, immutable snapshot and host context.
2. Execute through the native or WASM core, preserving the normal work charges.
3. Measure bounded training batches under explicitly allowed host strategies.
4. Feed training trajectories to SONA. Treat its learned pattern as a proposal.
5. Freeze the candidate. Measure it on separate evaluation workloads and compare
   every result with ordinary execution. Include preparation in the candidate cost.
6. Reject nonfinite metrics, contamination, changed receipts and insufficient gains.
7. Retain the baseline for rollback. Store the report as data in an RVF capsule
   alongside a request and receipt, with no implied source authentication.

On a malformed capsule, return an error before interpreting its contents. On a
failed optimization gate, keep the baseline. Learning cannot rewrite the program,
its evidence, capabilities, resource limits, or the promotion checks.

## Architecture and scope

The deterministic language core stays independent of SONA and RVF. WASM is an
adapter to that core. RVF is a data transport boundary. Learning is a native host
activity that proposes strategies outside program evaluation. This separation
prevents adaptive state from silently changing a replayed decision.

WASM is not automatically faster than native Rust. Its deployment benefit is
running locally without a native subprocess. String transfer and JSON parsing
still cost time and allocations. Browser hosts should use a Worker when executing
untrusted or long running requests so the host can terminate work independently.

The optimization experiment compares ordinary execution with prepared immutable
snapshots. A static always prepared policy is an important alternative. Showing
that prepared execution beats cold execution does not prove that SONA beats that
static policy, generalizes to production, or improves model accuracy. SONA's
learned patterns are proposals; the frozen evaluator determines acceptance.

RVF integrity checks detect inconsistent or corrupted contents. A party able to
rewrite the data and recompute checksums can produce a new valid capsule. Source
authentication requires a separate trusted signature policy. This integration
never treats a capsule as authorization to execute its contents.

## Upstream sources

All RuVector integration dependencies use commit
`f017d5f10c78b95843614f040f5cf22bfc1b3ac8`.

* [SONA engine and learning components](https://github.com/ruvnet/RuVector/tree/f017d5f10c78b95843614f040f5cf22bfc1b3ac8/crates/sona)
* [Darwin candidate and contamination guards](https://github.com/ruvnet/RuVector/blob/f017d5f10c78b95843614f040f5cf22bfc1b3ac8/crates/sona/src/darwin_guard.rs)
* [RVF wire and segment types](https://github.com/ruvnet/RuVector/tree/f017d5f10c78b95843614f040f5cf22bfc1b3ac8/crates/rvf)
* [WebAssembly security model](https://webassembly.org/docs/security/)
* [WebAssembly host imports and portability](https://webassembly.org/docs/portability/)
* [wasm-bindgen string boundary](https://wasm-bindgen.github.io/wasm-bindgen/reference/types/str.html)

Implementation ADRs and executable scripts are the detailed contracts. Measured
results must identify the workload, environment, artifact revisions, timing scope,
and any rejected candidates. No general self improvement or research novelty claim
follows from these integrations.
