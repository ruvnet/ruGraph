# ADR GL 014: Portable browser projects and execution comparison

Status: Accepted

## Context

The explorer needs a reusable programming workflow beyond tutorials. JavaScript JSON normalization can lose u64 precision or erase duplicate keys before the strict Rust boundary. Results can also become misleading when an editor changes during execution.

## Decision

Use a versioned `rugraph.project` JSON envelope containing source, snapshot and context as raw strings. Cap file input at 8 MiB and each editor at 1 MiB. Validate envelope and field types before replacing editor contents. Never execute imported projects automatically. Imported capabilities remain explicit host inputs reviewed before execution, within the existing browser sandbox.

Retain only the last two successful runs in session memory with immutable input strings and runtime receipts. Compare decisions by subject and predicate, including witness lineage. Restore and export captured inputs independently of current edits. Imported files cannot install a trusted receipt. Users reproduce a receipt by running its saved inputs.

Expose the real WASM compile operation. Associate execution responses with an input revision and discard successful responses if inputs changed during execution. All imported display values use textContent; there is no eval, HTML insertion, persistence, or external upload.

## Consequences and limits

Downloads can contain sensitive graph observations. Saving is explicit and browser local. Receipt hashes establish integrity, not source authentication. Only two runs are retained; comparisons display at most 100 changes. The envelope uses standard JSON parsing, while runtime input strings retain their original bytes. No filesystem paths from imports are used. Browser heap allocations remain outside the WASM linear memory limit.

## Validation and rollback

Node tests cover version and size rejection, raw input preservation, and decision differences. Chrome acceptance covers file import without automatic execution, WASM compilation and execution, history restoration, comparison, paired delimiter insertion, mobile layout, and reduced motion. Real iPhone Safari remains a manual acceptance gap. Revert this feature commit to remove the project UI without changing the language or runtime ABI.
