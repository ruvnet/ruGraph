#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
manifest=crates/ruvector-language-wasm/Cargo.toml
[[ "$(wasm-bindgen --version)" == "wasm-bindgen 0.2.105" ]] || { echo 'wasm-bindgen 0.2.105 required' >&2; exit 1; }
RUSTFLAGS="${RUSTFLAGS:-} -C link-arg=--max-memory=268435456" cargo +1.90.0 build --manifest-path "$manifest" --target wasm32-unknown-unknown --release --locked
wasm="${CARGO_TARGET_DIR:-$PWD/crates/ruvector-language-wasm/target}/wasm32-unknown-unknown/release/ruvector_language_wasm.wasm"
rm -rf explorer/dist
mkdir -p explorer/dist/runtime/generated/web
cp explorer/*.html explorer/*.css explorer/*.mjs explorer/*.svg explorer/dist/
cp npm/packages/graph-language-wasm/{browser,boundary}.mjs explorer/dist/runtime/
wasm-bindgen "$wasm" --target web --out-dir explorer/dist/runtime/generated/web --out-name runtime
python3 - <<'PY'
import hashlib,json,subprocess
from pathlib import Path
p=Path('explorer/dist')
revision=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
assets={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file()}
(p/'build.json').write_text(json.dumps({'revision':revision,'wasm_bindgen':'0.2.105','assets':assets},indent=2)+'\n')
(p/'.nojekyll').touch()
print('Explorer built:',len(assets),'assets at',revision)
PY
