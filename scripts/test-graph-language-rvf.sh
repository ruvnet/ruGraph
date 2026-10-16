#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
manifest=crates/ruvector-language-rvf/Cargo.toml
cargo +1.90.0 fmt --manifest-path "$manifest" -- --check
cargo +1.90.0 clippy --manifest-path "$manifest" --locked --all-targets --no-deps -- -D warnings
cargo +1.90.0 test --manifest-path "$manifest" --locked
