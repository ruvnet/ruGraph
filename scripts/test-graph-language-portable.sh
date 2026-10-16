#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
output_dir="$(mktemp -d)"
trap 'rm -rf "$output_dir"' EXIT
export RUGRAPH_PORTABLE_OUTPUT="$output_dir"
# Run the actual learner and persist its report; timing promotion is not required.
cargo +1.90.0 run --manifest-path crates/ruvector-language-learning/Cargo.toml \
  --locked --release --example strategy_learning > "$output_dir/learning-report.json"
node --input-type=module <<'JS'
import {readFile,writeFile} from 'node:fs/promises';
import {loadRuGraph} from './npm/packages/graph-language-wasm/index.mjs';
const graph = await loadRuGraph();
const base = 'crates/ruvector-language/examples/';
const [source,snapshot,context,options] = await Promise.all(
  ['incident.rvg','snapshot.json','context.json','audit-options.json'].map(n=>readFile(base+n,'utf8')));
const request = `{"program":${graph.compile(source)},"snapshot":${snapshot},"context":${context}}`;
const receipt = graph.run(request);
if(graph.replay(request,receipt)!==receipt) throw Error('WASM replay mismatch');
const out=process.env.RUGRAPH_PORTABLE_OUTPUT;
await writeFile(out+'/request.json',request+'\n');
await writeFile(out+'/receipt.json',receipt+'\n');
await writeFile(out+'/audit-report.json',graph.audit(request,options)+'\n');
JS
core="${CARGO_TARGET_DIR:-$project_root/crates/ruvector-language/target}/debug/rvg-core"
rvf="${CARGO_TARGET_DIR:-$project_root/crates/ruvector-language-rvf/target}/debug/rvg-capsule"
"$core" replay --request "$output_dir/request.json" --receipt "$output_dir/receipt.json" > "$output_dir/native.json"
cmp "$output_dir/receipt.json" "$output_dir/native.json"
"$rvf" pack "$output_dir/request.json" "$output_dir/receipt.json" "$output_dir/decision.rvf" \
  --attachment "learning-report.json=$output_dir/learning-report.json" \
  --attachment "audit-report.json=$output_dir/audit-report.json" > "$output_dir/packed.json"
"$rvf" verify "$output_dir/decision.rvf" > "$output_dir/verified.json"
python3 - <<'PY'
import json,os
from pathlib import Path
p=Path(os.environ['RUGRAPH_PORTABLE_OUTPUT'])
verified=json.loads((p/'verified.json').read_text())
receipt=json.loads((p/'receipt.json').read_text())
report=json.loads((p/'learning-report.json').read_text())
assert verified['valid'] and not verified['executed'] and not verified['source_authenticated']
assert verified['receipt_hash']==receipt['receipt_hash']
assert len(verified['manifest']['entries'])==4
assert all(c['measurement']['all_receipts_equal'] for c in report['evaluation'])
assert report['micro_lora_changed']==[True,True]
assert report['trajectories_dropped']==[0,0]
print(json.dumps({'portable_pipeline':'PASS','receipt_hash':receipt['receipt_hash'],
                  'capsule_bytes':(p/'decision.rvf').stat().st_size,
                  'learned_state_changed':report['micro_lora_changed'],
                  'promotion':report['promoted']}))
PY
