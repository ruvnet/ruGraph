# RuGraph RVF capsules

Carry a RuGraph request, receipt and optional learning reports in a deterministic RVF segment stream. Uses real upstream `rvf-wire` and `rvf-types`, pinned to a specific RuVector commit. No embedded code is loaded or executed.

```sh
cargo +1.90.0 build --manifest-path crates/ruvector-language-rvf/Cargo.toml --locked
crates/ruvector-language-rvf/target/debug/rvg-capsule pack request.json receipt.json run.rvf \
  --attachment learning-report.json=report.json
crates/ruvector-language-rvf/target/debug/rvg-capsule inspect run.rvf
crates/ruvector-language-rvf/target/debug/rvg-capsule verify run.rvf
```

`pack` requires an existing runtime receipt with a valid checksum. The output must be a new file. `inspect` and `verify` perform the same complete validation, then print JSON metadata. Failure exits with code 2 and a JSON error on stderr.

```rust,ignore
use ruvector_language_rvf::{pack, unpack};
use std::collections::BTreeMap;
let bytes = pack(request_json, receipt_json, BTreeMap::new())?;
let capsule = unpack(&bytes)?;
assert_eq!(capsule.manifest.profile, "rugraph.data-capsule");
```

The profile permits only RVF metadata segments. Each uses SHAKE256 integrity checking. The application manifest additionally stores SHA256 and byte length per payload. All JSON is parsed strictly. Bounds are 64 MiB per capsule, 16 MiB per payload and 16 optional attachments. CLI reads and serialization are bounded; decoded JSON uses additional memory.

Verification means internal integrity, not source authentication. Recomputed hashes can accompany forged content. A receipt checksum does not prove that it belongs to the packaged request. An independent, host authorized replay is necessary to check that relationship. Recorded request capabilities are data and must never be adopted as host grants. Attachments cannot install a model or promote a policy. Capsules do not encrypt sensitive snapshot data.

This is an application profile over valid RVF segments, not an RVF vector database or a bootable container. It does not expose an RVF root index manifest.

Run `scripts/test-graph-language-rvf.sh` from the repository root for format, strict Clippy, roundtrip, CLI and adversarial validation.
