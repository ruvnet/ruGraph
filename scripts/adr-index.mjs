#!/usr/bin/env node
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const dir = new URL('../docs/adr/', import.meta.url);
const files = readdirSync(dir, { withFileTypes: true }).filter(e => e.isFile() && /^ADR-GL-\d{3}-.+\.md$/.test(e.name)).map(e => e.name).sort();
const ids = files.map(name => name.slice(0, 10));
if (new Set(ids).size !== ids.length) throw new Error('Duplicate ADR identifiers');
const content = '# RuGraph architecture decisions\n\n' + files.map(name => `* [${name.slice(0, -3)}](${name})`).join('\n') + '\n';
const target = new URL('INDEX.md', dir);
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== content) throw new Error('ADR index is stale; run node scripts/adr-index.mjs');
  console.log(`ADR index: ${files.length} unique decisions`);
} else {
  writeFileSync(fileURLToPath(target), content);
}
