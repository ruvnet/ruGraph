export declare const MAX_BYTES: number;
export declare class RuGraphError extends Error { code: string; position?: number; }
/** String inputs and outputs preserve full u64 integers. JSON.parse may lose precision. */
export interface RuGraph {
  compile(source: string): string;
  check(source: string): string;
  run(request: string): string;
  replay(request: string, receipt: string): string;
  audit(request: string, options: string): string;
  verify(receipt: string): string;
}
/** Browser only: supply module_or_path for custom asset loading. Node loads its bundled WASM. */
export declare function loadRuGraph(options?: {module_or_path: URL | Request | Response | BufferSource | WebAssembly.Module | Promise<Response>}): Promise<RuGraph>;
