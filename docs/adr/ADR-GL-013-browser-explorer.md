# ADR-GL-013: Local WASM tutorial and graph explorer

Status: Accepted

## Context

RuGraph needs an accessible way to demonstrate graph programs and inspect evidence without installing a compiler or granting a service access to user input. The RuVector Explorer establishes the visual language: dark graph canvas, compact instruments, mint, orange and blue accents.

## Decision

Publish a buildless HTML, CSS and ES module application on GitHub Pages, built from this repository. Compile the existing pinned Rust WASM crate during CI and copy only the web bindings, wrapper and runtime into the distribution. `build.json` records the source revision and asset SHA256 hashes. Generated output remains untracked.

Six lessons cover graph traversal, contradiction, expiry, capability rejection, exact cosine candidate retrieval, and independent counterfactual audits. Programs, snapshots and host context remain editable. The UI preserves raw JSON across the Worker boundary so Rust performs strict duplicate-key and integer validation. Display parsing does not feed execution. After custom JSON edits, scenario controls are disabled until lesson restore to prevent lossy JSON rewriting.

Run each operation in a dedicated module Worker, with a single outstanding request, a 15 second initialization deadline and an 8 second execution deadline. Terminate and replace the Worker after timeout or explicit reset. The Rust build caps linear memory at 256 MiB; JavaScript allocations are additional. The public editors are limited to 1 MiB each. Display at most 200 nodes, 500 edges and 100 decision cards while retaining the full raw receipt for explicit export. The host latency measurement includes compilation, message transfer and runtime execution; it is not a benchmark of Rust alone.

All output uses text nodes. The content security policy restricts scripts, Workers and fetches to the same origin, with WASM compilation enabled. No analytics, third-party scripts, external fonts, persistence or runtime API calls are required. Source links navigate only when selected. The SVG graph is an illustrative dependency layout; evidence statuses come from actual receipts. Motion respects reduced-motion preferences and can be paused. Keyboard node selection and a searchable button list offer alternatives to the graph. Phones use a separate portrait coordinate layout with at least 44 px node hit areas, a native lesson picker and a persistent Run dock. Curved paths, orbital rings and a scanning beam animate through CSS without a frame loop. Motion can be paused globally, including the header and atmosphere; reduced motion disables scene animation. A CSS immersive mode provides an exit-capable fallback when the Fullscreen API is absent.

Deploy only after lesson contracts, Worker cancellation/recovery tests and actual Chrome UI acceptance pass. Pull requests build and test without deploying. A deployment rollback is a revert followed by the same workflow, or redeployment of the previous successful artifact.

## Alternatives

A server evaluator adds hosting cost and a data trust boundary without improving this tutorial. A second JavaScript interpreter risks divergent evidence semantics. A WebGL dependency increases initial size and compatibility cost for a twelve-node teaching graph. GitHub Pages keeps source, builds and public demo together and follows the existing RuVector deployment convention.

## Consequences and acceptance

The demo offers portable core behavior. SONA remains a native host experiment; RVF remains a data container. Neither is simulated as browser learning or trusted execution.

`node --test explorer/test/lessons.test.mjs` verifies real WASM lesson results, strict JSON, replay and Worker lifecycle. After `bash scripts/build-explorer.sh`, `python3 scripts/test-explorer-browser.py` checks the actual tutorial controls, edits, permissions, expiry, audits, mobile overflow and reset through the browser Worker.
