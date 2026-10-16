import init, * as runtime from './generated/web/runtime.js';
import { wrap } from './boundary.mjs';
export { RuGraphError, MAX_BYTES } from './boundary.mjs';
/** Default asset URL is relative to the generated module, not the current page. */
export async function loadRuGraph(options) {
  await init(options);
  return wrap(runtime);
}
