import { createRequire } from 'node:module';
import { wrap } from './boundary.mjs';
export { RuGraphError, MAX_BYTES } from './boundary.mjs';
const require = createRequire(import.meta.url);
/** Load the local WebAssembly binary without spawning a process. */
export async function loadRuGraph() {
  return wrap(require('./generated/node/runtime.js'));
}
