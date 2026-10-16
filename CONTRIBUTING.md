# Contributing to RuGraph

Use Rust 1.90.0 with rustfmt and Clippy, Node.js 24, and Python 3.12.
Install the package verification tools with:

```sh
rustup toolchain install 1.90.0 --profile minimal --component rustfmt --component clippy
python3 -m pip install setuptools==84.0.0 wheel==0.48.0
```

Run the full validation from the repository root:

```sh
bash scripts/test-graph-language.sh
bash scripts/smoke-graph-language-packages.sh
```

The first native build fetches the pinned RuVector Git repository. Allow disk
space and network access for that checkout and Rust dependencies. Package smoke
checks fetch TypeScript 5.9.3 and install the locally built npm and Python packages.
They do not publish packages.

Record changes to semantics, bounds, provenance, and runtime architecture in
`docs/adr`. Regenerate the index with `node scripts/adr-index.mjs`. Keep exact
reference tests for ranking and receipt behavior. Performance claims need paired
measurements with identical fixtures, budgets, and receipts; record raw samples
and disclose preparation costs and workload dimensions.

See `UPSTREAM.md` before updating native dependencies. Registry releases and
changes to package identifiers require separate release decisions.

## Portable extensions

Install the WASM target and binding generator, then validate each boundary:

```sh
rustup target add wasm32-unknown-unknown --toolchain 1.90.0
cargo +1.90.0 install wasm-bindgen-cli --version 0.2.105 --locked
bash scripts/test-graph-language-wasm.sh
bash scripts/test-graph-language-rvf.sh
bash scripts/test-graph-language-learning.sh
bash scripts/test-graph-language-portable.sh
python3 scripts/test-graph-language-browser.py
```

The browser check requires Chrome (`CHROME_BIN` can select the executable).
It serves the generated browser module on a local ephemeral port and exercises
compile, execution, replay, integrity, and audit before comparing with the native
receipt when the reference binary is present. The CI job requires both.
Generated WASM assets are ignored by Git but included by `npm pack` after building.
Learning timings are diagnostic; CI does not require a timing candidate to win.
