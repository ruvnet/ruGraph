#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
manifest=crates/ruvector-language-wasm/Cargo.toml
package=npm/packages/graph-language-wasm
# Install with: cargo install wasm-bindgen-cli --version 0.2.105 --locked
# Install target with: rustup target add wasm32-unknown-unknown --toolchain 1.90.0
[[ "$(wasm-bindgen --version)" == "wasm-bindgen 0.2.105" ]] || { echo 'wasm-bindgen 0.2.105 required' >&2; exit 1; }
cargo +1.90.0 fmt --manifest-path "$manifest" -- --check
cargo +1.90.0 clippy --manifest-path "$manifest" --locked --all-targets --no-deps -- -D warnings
RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=--max-memory=268435456" cargo +1.90.0 build --manifest-path "$manifest" --target wasm32-unknown-unknown --release --locked
wasm="${CARGO_TARGET_DIR:-$project_root/crates/ruvector-language-wasm/target}/wasm32-unknown-unknown/release/ruvector_language_wasm.wasm"
wasm-bindgen "$wasm" --target nodejs --out-dir "$package/generated/node" --out-name runtime
wasm-bindgen "$wasm" --target web --out-dir "$package/generated/web" --out-name runtime
printf '%s\n' '{"type":"commonjs"}' > "$package/generated/node/package.json"
cargo +1.90.0 build --manifest-path crates/ruvector-language/Cargo.toml --locked --bin rvg-core
export RUGRAPH_REFERENCE_BIN="${CARGO_TARGET_DIR:-$project_root/crates/ruvector-language/target}/debug/rvg-core"
node --test "$package"/test/*.test.mjs
# Test the published layout in an isolated installation, without repo-relative imports.
smoke_dir="$(mktemp -d)"
trap 'rm -rf "$smoke_dir"' EXIT
(cd "$package" && npm pack --pack-destination "$smoke_dir" >/dev/null)
npm install --prefix "$smoke_dir" --ignore-scripts --no-audit --no-fund "$smoke_dir"/*.tgz >/dev/null
(cd "$smoke_dir" && node --input-type=module -e 'import {loadRuGraph} from "@ruvector/graph-language-wasm"; const graph=await loadRuGraph(); const result=graph.check("program p { effect graph.read; effect decision.emit; budget 1000; let n = select [\"api\"]; let e = observe n \"Failing\" within 300; let d = assess e; emit d; }"); if (!JSON.parse(result).valid) throw Error("package smoke failed"); console.log("Installed WASM package: PASS");')
