# Source provenance and dependency policy

RuGraph was extracted as a source snapshot from
[RuVector commit f017d5f10c78b95843614f040f5cf22bfc1b3ac8](https://github.com/ruvnet/RuVector/commit/f017d5f10c78b95843614f040f5cf22bfc1b3ac8)
and [PR 1225](https://github.com/ruvnet/RuVector/pull/1225).
The original commit history remains in RuVector; this repository starts a new
history and retains the upstream MIT license. Existing benchmark reports describe
the upstream measurements, not new measurements of the extracted repository.

The native adapter pins `ruvector-graph` and `ruvector-kge` to that exact commit.
Cargo resolves their transitive RuVector path dependencies within the Git checkout.
No sibling RuVector checkout or local path override is required. The language
core remains independent of RuVector infrastructure.

Future language development belongs here. RuVector continues to own graph and KGE
infrastructure. The earlier PR is historical context and has not been merged by
this migration. Its pinned commit must remain accessible for reproducible builds.

Update both dependency revisions together, regenerate the native lockfile, and run
the full acceptance, package smoke, and advisory gates before landing an update.
SDK and crate package identifiers remain unchanged for compatibility.
