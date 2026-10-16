# RuGraph WebAssembly

Run RuGraph graph queries, evidence rules, replay and sensitivity audits inside Node or a browser. This package runs the same Rust parser, compiler and deterministic runtime as `rvg-core`. There is no subprocess, server call, filesystem access or model provider in the WASM module.

## Build from this repository

Requires Rust 1.90.0 and Node 20 or newer. This package is source ready; a registry release is a separate step.

```sh
rustup target add wasm32-unknown-unknown --toolchain 1.90.0
cargo install wasm-bindgen-cli --version 0.2.105 --locked
bash scripts/test-graph-language-wasm.sh
cd npm/packages/graph-language-wasm
npm pack
```

The script builds both Node and browser bindings and compares native and WASM receipts. Generated assets are included in the npm archive, not committed to Git. `npm pack` refuses to run without those assets.

## Node

```js
import { loadRuGraph } from '@ruvector/graph-language-wasm';
import { readFile } from 'node:fs/promises';

const graph = await loadRuGraph();
const request = await readFile('request.json', 'utf8');
const receipt = graph.run(request);
console.log(graph.replay(request, receipt) === receipt); // true
```

## Browser

```js
import { loadRuGraph } from '@ruvector/graph-language-wasm/browser';
const graph = await loadRuGraph();
const source = `program example {
  effect graph.read;
  effect decision.emit;
  budget 1000;
  let n = nodes "Service";
  let evidence = observe n "Failing" within 300;
  let decisions = assess evidence;
  emit decisions;
}`;
console.log(graph.compile(source));
```

Use a bundler with support for WebAssembly asset URLs or serve the package directory and import `browser.mjs` directly. The generated browser loader fetches `generated/web/runtime_bg.wasm` relative to its module URL. Serve WASM as `application/wasm`. A custom asset can be supplied with `loadRuGraph({module_or_path: urlOrBytes})`.

## String API

| Method | Input | Output |
| :--- | :--- | :--- |
| `compile(source)` | DSL text or strict program JSON | Canonical program JSON |
| `check(source)` | DSL text or strict program JSON | Validation JSON |
| `run(request)` | Strict RunRequest JSON | Receipt JSON |
| `replay(request, receipt)` | Original request and receipt JSON | Matching receipt or error |
| `audit(request, options)` | Request and AuditOptions JSON | Counterfactual report JSON |
| `verify(receipt)` | Receipt JSON | Integrity result JSON |

All arguments and results are strings. The ABI preserves full unsigned 64 bit timestamps and work limits. Do not `JSON.parse` and then `JSON.stringify` data containing integers above `Number.MAX_SAFE_INTEGER`; use raw JSON or a lossless JSON library. JavaScript object input is deliberately rejected. Errors are `RuGraphError` with `code`, `message` and optional `position`.

## Limits and authority

Every request includes explicit host supplied capabilities, clock and budgets. Each input and output is limited to 16 MiB of UTF8. The reproducible build sets a maximum of 256 MiB of WASM linear memory. JS strings, buffers and module compilation consume additional host memory. Allocation exhaustion may trap instead of producing a structured error; discard the instance after a trap.

The host controls the inputs. If untrusted users submit programs, the host must construct and constrain the context itself. WASM memory isolation does not turn caller supplied capability claims into authorization. Runtime logical work limits do not provide a wall clock deadline, and parsing and serialization also consume time. Use a dedicated Web Worker or Node worker for untrusted workloads and terminate it at the host deadline. Do not run large queries on the browser UI thread.

Prediction operations return `PROVIDER_UNAVAILABLE`. This version does not bundle KGE models, train models, persist RVF files or expose a prepared snapshot handle. Use the native runtime for model backed execution. Receipt integrity is not producer authentication. Audit reports measure sensitivity to supplied interventions, not real world causality.
