import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRuGraph, MAX_BYTES } from '../index.mjs';
const api = await loadRuGraph();
const root = new URL('../../../../', import.meta.url);
const examples = new URL('crates/ruvector-language/examples/', root);
const source = await readFile(new URL('incident.rvg', examples), 'utf8');
const snapshot = await readFile(new URL('snapshot.json', examples), 'utf8');
const context = await readFile(new URL('context.json', examples), 'utf8');
const options = await readFile(new URL('audit-options.json', examples), 'utf8');
const program = api.compile(source);
const request = `{"program":${program},"snapshot":${snapshot},"context":${context}}`;
const receipt = api.run(request);
function throwsCode(fn, code) { assert.throws(fn, e => e.code === code); }

test('compile, check, run, verify and replay use actual WASM', () => {
  assert.equal(JSON.parse(api.check(source)).valid, true);
  assert.equal(api.compile(program), program);
  assert.equal(JSON.parse(api.verify(receipt)).valid, true);
  assert.equal(api.replay(request, receipt), receipt);
});
test('strict JSON rejects duplicate keys and unknown fields', () => {
  assert.throws(() => api.run(request.replace('"program":', '"program":null,"program":')));
  assert.throws(() => api.run(request.replace('{', '{"unexpected":true,')));
  assert.throws(() => api.audit(request, '{"interventions":[],"interventions":[]}'));
});
test('explicit grants, bounded work and expiry are enforced', () => {
  assert.throws(() => api.run(request.replace('"graph.read"', '"model.predict"')));
  assert.throws(() => api.run(request.replace('"max_steps":100000', '"max_steps":1')));
  const expired = request.replace('"now":1000', '"now":1200');
  assert.notEqual(api.run(expired), receipt);
  throwsCode(() => api.replay(expired, receipt), 'REPLAY_MISMATCH');
});
test('tampered receipts fail verification', () => {
  const modified = JSON.parse(receipt);
  modified.receipt_hash = '0'.repeat(64);
  assert.throws(() => api.verify(JSON.stringify(modified)));
});
test('string boundary rejects objects, arity, oversized UTF8 and malformed Unicode', () => {
  throwsCode(() => api.run({}), 'INVALID_INPUT');
  throwsCode(() => api.run(), 'INVALID_INPUT');
  throwsCode(() => api.run('{}', '{}'), 'INVALID_INPUT');
  throwsCode(() => api.run(' '.repeat(MAX_BYTES + 1)), 'INPUT_LIMIT');
  throwsCode(() => api.run('é'.repeat(MAX_BYTES / 2 + 1)), 'INPUT_LIMIT');
  throwsCode(() => api.compile('\ud800'), 'INVALID_INPUT');
});
test('raw u64 timestamps survive WASM without Number roundtrip', () => {
  const raw = request.replace('"now":1000', '"now":18446744073709551614');
  const result = api.run(raw);
  assert.equal(api.replay(raw, result), result);
  assert.notEqual(result, api.run(request.replace('"now":1000', '"now":18446744073709551613')));
  assert.throws(() => api.run(request.replace('"now":1000', '"now":18446744073709551616')));
});
test('audit is deterministic and does not mutate the baseline', () => {
  assert.equal(api.audit(request, options), api.audit(request, options));
  assert.equal(api.run(request), receipt);
  assert.throws(() => api.audit(request, '{"interventions":[],"max_execution_work":1}'));
});
test('web target runs the same binary contract with explicit byte loading', async () => {
  const { loadRuGraph: loadBrowser } = await import('../browser.mjs');
  const browser = await loadBrowser({module_or_path: await readFile(new URL('../generated/web/runtime_bg.wasm', import.meta.url))});
  assert.equal(browser.run(request), receipt);
  assert.equal(browser.audit(request, options), api.audit(request, options));
});
test('module has no filesystem or network imports and bounded linear memory', async () => {
  const bytes = await readFile(new URL('../generated/node/runtime_bg.wasm', import.meta.url));
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  assert.ok(imports.every(x => x.module === '__wbindgen_placeholder__' && ['__wbindgen_init_externref_table', '__wbindgen_cast_2241b6af4c4b2941'].includes(x.name)),
    JSON.stringify(imports));
  // Parse the memory section to verify the actual binary maximum, not a build flag.
  let pos = 8;
  const uint = () => { let n = 0, shift = 0, b; do { b=bytes[pos++]; n |= (b & 127) << shift; shift += 7; } while (b & 128); return n; };
  let checked = false;
  while (pos < bytes.length) {
    const section = bytes[pos++], length = uint(), end = pos + length;
    if (section === 5) {
      assert.equal(uint(), 1);
      const flags = uint(); uint();
      assert.equal(flags & 1, 1, 'memory must declare a maximum');
      assert.equal(uint(), 4096, 'maximum is 256 MiB');
      checked = true;
    }
    pos = end;
  }
  assert.equal(checked, true);
});
test('native core and WASM produce byte-identical receipts and audit reports', async () => {
  assert.ok(process.env.RUGRAPH_REFERENCE_BIN, 'Run scripts/test-graph-language-wasm.sh for native reference');
  const dir = await mkdtemp(join(tmpdir(), 'rugraph-wasm-'));
  try {
    await writeFile(join(dir, 'request.json'), request);
    await writeFile(join(dir, 'options.json'), options);
    const native = args => {
      const p = spawnSync(process.env.RUGRAPH_REFERENCE_BIN, args, {encoding:'utf8'});
      assert.equal(p.status, 0, p.stderr);
      return p.stdout.trimEnd();
    };
    assert.equal(native(['compile', fileURLToPath(new URL('incident.rvg', examples))]), program);
    assert.equal(native(['run', '--request', join(dir, 'request.json')]), receipt);
    assert.equal(native(['audit', '--request', join(dir, 'request.json'), '--audit-options', join(dir, 'options.json')]), api.audit(request, options));
    // Cover floating point cosine ranking and tie order, beyond the traversal fixture.
    const ranked = api.compile('program ranked { effect graph.read; effect decision.emit; budget 100000; let n = nodes "Service"; let s = similar n [0.70710677,0.70710677] top 2; let e = observe s "Failing" within 300; let d = assess e; emit d; }');
    const rankedRequest = `{"program":${ranked},"snapshot":${snapshot},"context":${context}}`;
    await writeFile(join(dir, 'request.json'), rankedRequest);
    assert.equal(native(['run', '--request', join(dir, 'request.json')]), api.run(rankedRequest));
    await writeFile(join(dir, 'request.json'), request.replace('"now":1000', '"now":18446744073709551614'));
    assert.equal(native(['run', '--request', join(dir, 'request.json')]), api.run(request.replace('"now":1000', '"now":18446744073709551614')));
  } finally { await rm(dir, {recursive:true, force:true}); }
});

test('model operations explicitly fail without a provider', () => {
  const p = api.compile('program p { effect graph.read; effect model.predict; effect decision.emit; budget 100000; let n = select ["api"]; let p = predict n "Cause" model "m1" top 1; emit p; }');
  const c = context.replace('"graph.read"', '"graph.read","model.predict"');
  throwsCode(() => api.run(`{"program":${p},"snapshot":${snapshot},"context":${c}}`), 'PROVIDER_UNAVAILABLE');
});
