# ADR GL 011: Data only RVF capsules

Status: Accepted

## Context

RuGraph needs portable request, receipt and learning report artifacts. RVF also supports executable WASM, kernels, eBPF and dashboards. Accepting arbitrary RVF features would expand the authority and execution surface of an artifact inspection operation.

## Decision

Add the standalone `ruvector-language-rvf` crate and `rvg-capsule` CLI. Pin upstream `rvf-wire` and `rvf-types` to RuVector revision `f017d5f10c78b95843614f040f5cf22bfc1b3ac8`. Use those crates directly for segment serialization, parsing and SHAKE256 checksum verification. The capsule is an RVF segment stream with an application metadata profile, not a complete RVF vector database or bootable container.

All segments use the upstream `Meta` type, checksum algorithm 2, sequential ordinals beginning at zero, no compression or flags, zero timestamps and reserved fields. RVF alignment padding is checked for exact length and zero contents. No custom binary wrapper or invented RVF segment type is introduced.

The first segment contains a strict JSON manifest with profile `rugraph.data-capsule`, version 1 and ordered entries. Each entry names a payload and records its byte length and SHA256. The next two segments contain typed `request.json` and `receipt.json`. Optional JSON attachments follow in lexical name order. Example names are `learning-report.json` and `model-metadata.json`. These contain inert JSON; model metadata is not a loadable model. Attachment names are ASCII basenames ending in `.json`, maximum 96 bytes, without leading dots, path separators or consecutive dots. Reserved payload names cannot be reused.

Limits are 64 MiB for a complete capsule, 16 MiB per payload, 16 KiB for the manifest and 16 attachments. Segment lengths and count are checked before conversion to platform sizes, slice arithmetic, allocation or JSON decoding. Serialization uses a bounded writer. CLI reads use a bounded reader. JSON parsing rejects duplicate keys and excessive nesting through the core strict parser. Unknown manifest, entry, request and receipt fields are rejected by their typed decoders.

`pack` verifies the receipt's existing canonical checksum. `unpack` verifies every RVF segment, manifest length and SHA256, strict JSON and the receipt checksum before returning any data. `inspect` and `verify` both fully validate and return metadata. All executable and unknown segment types are rejected, including WASM, kernels, eBPF and dashboards.

## Trust boundary

Verification proves internal integrity only. Anyone able to rewrite an artifact can recompute all hashes. No source identity, signature, trusted author or evidence authenticity is claimed. The capsule manifest is application metadata, not the native RVF vector index root manifest.

The recorded request context is data. It cannot authorize execution, expand host grants or promote a learned policy. APIs never execute requests or attachments. A host choosing replay must independently authorize capabilities and budgets and supply trusted model adapters. A valid receipt checksum alone also does not establish that the receipt was produced by the packaged request: callers must perform a separately authorized replay for that assertion. CLI output explicitly reports `source_authenticated: false`, `executed: false` and, on inspection, `request_receipt_replayed: false`.

The CLI accepts explicit output paths only and creates new files without overwriting existing files. It never extracts named attachments to filesystem paths. Capsules may contain sensitive snapshots; integrity checking does not encrypt or redact them.

## Acceptance

Run `scripts/test-graph-language-rvf.sh`. Tests package an actual core runtime receipt, reopen it using the real upstream RVF parser, unpack and compare a caller initiated replay. Adversarial cases cover every truncation, payload corruption, forged lengths including u64 maximum, executable segment substitutions, header flags and reserved fields, duplicate keys and names, altered manifest digests, invalid receipt checksums, excessive total size and invalid attachment names. Packaging is deterministic for identical input values.

## Consequences

This provides real RVF interoperability at the segment layer while preserving a small data only boundary. It does not add cryptographic source authentication, an RVF database index, automatic policy promotion, embedded execution, encryption or a learned model loader. Those require separate contracts and acceptance gates. The pure byte API is suitable for later WASM exposure; this ADR does not claim WASM artifact verification was delivered.
