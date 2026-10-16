# ADR GL 010: deterministic WebAssembly runtime

Status: Accepted

## Context

The subprocess SDK requires a native binary and cannot run in a browser. RuGraph core already separates deterministic execution from filesystem and model providers. Browser and Node callers need the exact same evidence semantics, bounded authority and reproducible receipts.

## Decision

Compile the existing core to `wasm32-unknown-unknown` through a small standalone `wasm-bindgen` crate. Export compile, check, run, replay, audit and verify. Use JSON strings across the ABI so strict duplicate key rejection and full u64 values survive JavaScript. Keep exact Rust wire types and receipt comparisons. The JS facade performs UTF8 size and Unicode validation before copying to WASM and exposes structured errors.

Pin Rust 1.90.0, wasm-bindgen 0.2.105 and its lockfile. Build both Node and web targets. Cap each input and output at 16 MiB and the linked module's linear memory at 256 MiB. Test the binary's declared memory maximum and imports. Generated assets are npm package build artifacts, with prepack checks against incomplete packaging.

No model provider is linked. Predict fails explicitly with PROVIDER_UNAVAILABLE. No persistent learning or model changes may be smuggled through evidence or receipts. Prepared snapshots remain a native Rust optimization for this revision; safe ownership across the WASM boundary should be designed independently if repeated query benchmarks justify it.

## Security and execution contract

WASM does not provide wall clock control or authenticate supplied grants. Hosts construct capability context and isolate untrusted execution in workers they can terminate. Linear memory limits exclude JS allocations. OOM may trap and requires instance replacement. The module imports only wasm-bindgen runtime helpers, without WASI, filesystem or network authority. Browser loader fetches the static module asset as a host action.

## Acceptance

Build the real wasm target and execute it in Node. Compare complete canonical receipts and audit reports byte for byte with the native core for the incident fixture and raw u64 timestamps. Verify duplicate keys, unknown fields, grants, work exhaustion, expiry, tampering, Unicode, input bounds, missing predictors and deterministic replay. Execute the web binding using explicit module bytes as an additional target check. A browser smoke page is used where Chrome is available; Node execution of web bindings alone must not be described as browser validation.

## Consequences

Browser users receive deterministic local evidence evaluation without a service dependency. Native model loading remains separate. Size limits avoid unbounded transfer but are not a universal allocation or latency guarantee. This introduces a pinned build tool and a new npm artifact; publication remains a release operation after acceptance.
