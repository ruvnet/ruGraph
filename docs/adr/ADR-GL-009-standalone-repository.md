# ADR-GL-009: Standalone RuGraph repository

Status: Accepted

## Context

The bounded language, SDKs, and release lifecycle need a focused repository while
continuing to execute real RuVector graph and KGE implementations.

## Decision

Extract a source snapshot into `ruvnet/ruGraph` with source provenance in
`UPSTREAM.md`. Retain the existing internal directory layout and package names.
Pin graph and KGE Git dependencies to one immutable upstream revision and commit
both standalone lockfiles. Copy the specification, ADRs, raw benchmark reports,
examples, animated assets, and full validation scripts. Run CI for every PR and
main push. Keep the core crate independent of the native dependencies.

## Consequences

A fresh clone can build without a sibling monorepo checkout. Git dependency
fetching needs network access initially and retains reliance on upstream commit
availability. Prior benchmark evidence retains its original scope. This migration
does not publish crates, npm packages, or Python packages. Upstream history remains
linked rather than rewritten into this repository.

## Validation

Run locked builds, formatting, strict Clippy, core and native tests, both SDK test
suites, installed package checks, and the ADR index check in the extracted tree.
