export const MAX_BYTES = 16 * 1024 * 1024;
const encoder = new TextEncoder();
export class RuGraphError extends Error {
  constructor(code, message, position) {
    super(message);
    this.name = 'RuGraphError';
    this.code = code;
    if (position !== undefined) this.position = position;
  }
}
function input(value) {
  if (typeof value !== 'string') throw new RuGraphError('INVALID_INPUT', 'Pass a JSON or source string, not a JavaScript object');
  if (value.length > MAX_BYTES || encoder.encode(value).length > MAX_BYTES) {
    throw new RuGraphError('INPUT_LIMIT', 'Input exceeds 16 MiB');
  }
  // TextEncoder replaces lone surrogates. Reject rather than silently modify IDs.
  if (!value.isWellFormed()) throw new RuGraphError('INVALID_INPUT', 'Input must contain valid Unicode');
  return value;
}
export function wrap(runtime) {
  const result = {};
  for (const [name, arity] of Object.entries({compile:1, check:1, run:1, replay:2, audit:2, verify:1})) {
    result[name] = (...args) => {
      if (args.length !== arity) throw new RuGraphError('INVALID_INPUT', `${name} requires ${arity} string argument(s)`);
      const values = args.map(input);
      try {
        const output = runtime[name](...values);
        if (output.length > MAX_BYTES || encoder.encode(output).length > MAX_BYTES) throw new RuGraphError('OUTPUT_LIMIT', 'Output exceeds 16 MiB');
        return output;
      } catch (error) {
        if (typeof error === 'string') {
          let details;
          try { details = JSON.parse(error); } catch { /* Preserve nonprotocol errors. */ }
          if (details && typeof details.code === 'string') throw new RuGraphError(details.code, details.message, details.position);
        }
        throw error;
      }
    };
  }
  return Object.freeze(result);
}
