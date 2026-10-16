# Portable execution and learning validation

Validated 2026-10-16 with Rust 1.90.0, wasm-bindgen 0.2.105, Node 24.19 and Python 3.12.14. Upstream RuVector revision: `f017d5f10c78b95843614f040f5cf22bfc1b3ac8`.

| Check | Result |
| --- | --- |
| Existing core, native, JavaScript and Python suites | 90 passed |
| Actual WASM runtime and installed npm package | 11 passed plus installation smoke |
| RVF wire format, boundaries and CLI | 7 passed |
| SONA learning, promotion guards and RVF integration | 5 passed |
| Native/WASM replay, audit and learning report in RVF | Passed |
| Real Chrome web module execution | Passed |
| Rust formatting and strict Clippy | Passed |
| Three new Cargo lockfile advisory audits | No advisories reported |
| Ruflo 3.25.6 scoped deep source scan | No findings reported |

The browser was exercised on the Software Factory desktop using the generated web module and the checked-in browser harness. Its receipt hash was `e4e90e445cc6f17d438baeefd42309656d7909572ca53a649fa9d1071b4b26cd`, matching the native fixture and the portable pipeline. The remote bundle lacked the native executable; native comparison was performed by the local parity and pipeline tests. CI runs both in one checkout.

The generated Node WASM module measured 851,226 bytes. The build limits linear memory to 256 MiB, with 16 MiB string boundaries. Host JavaScript allocations are additional. A host Worker is needed for termination deadlines.

An integrated test exposed floating point drift in JSON learning attachments. RVF now enables serde_json float_roundtrip; a deterministic attachment regression covers 999 floating point values, and the actual learning report round trip passes.

## Optimization evidence

The checked-in [raw report](../../../crates/ruvector-language-learning/reports/strategy-learning.json) measured 79.44% lower batch latency for the learned policy versus cold execution. Static prepared execution measured 79.46%. Training took approximately 231 ms. These measurements demonstrate the value of prepared execution on this synthetic workload; they do not demonstrate an advantage from learning over a static prepared policy. All receipts matched, both SONA MicroLoRA states changed, and no trajectories were dropped. Timings vary between runs, so CI does not require a timing win.

Learning is host advisory, promotion requires all held-out cases to clear a 10% gate, and rollback remains explicit. The serialized report is not a resumable model checkpoint. RVF verifies container and receipt integrity; it neither authenticates the producer nor grants execution authority. Request/receipt binding requires independent replay with trusted host context.

The source scan covered the three new Rust boundaries and the WASM JavaScript package, excluding generated files and build outputs. Automated scan results are limited evidence, supplemented by rejection tests for malformed input, resource bounds, authority and corruption. The new SVG was rendered and visually inspected.

## Reproduce

Follow the toolchain setup in [CONTRIBUTING](../../../CONTRIBUTING.md), then run:

```bash
bash scripts/test-graph-language.sh
bash scripts/test-graph-language-wasm.sh
bash scripts/test-graph-language-rvf.sh
bash scripts/test-graph-language-learning.sh
bash scripts/test-graph-language-portable.sh
python3 scripts/test-graph-language-browser.py
```
