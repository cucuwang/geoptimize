# Changelog

All notable user-visible changes will be documented here. The project follows Semantic Versioning after the v0.6 evidence baseline is released.

## 0.6.3

### Changed

- Added a concise install path, terminal demo, comparison table, and first-contribution guidance to the public documentation.
- Documented immutable Action pins and cross-agent skill discovery.
- Prepared the existing root composite Action for its first GitHub Marketplace release without changing scoring, runtime behavior, inputs, or outputs.

## 0.6.2

### Fixed

- Added a fail-closed publish source gate that requires `HEAD` to match the fetched `origin/main` commit before npm publication.
- Prepared a corrective release after npm 0.6.1 exposed the pre-squash PR commit as `gitHead`; the verified package contents were correct, but the release provenance did not match the merged commit.
- Kept scoring rules, output contracts, and runtime behavior unchanged.

## 0.6.1

### Fixed

- Bound public CLI verification to the downloaded tarball that passed SHA-256 verification.
- Added an executable clean-worktree release candidate gate and cross-Node package reproducibility check.
- Exercised the public rule corpus across the HTML parser boundary and strengthened release verifier failure tests.

## 0.6.0

### Changed

- Reframed the score as deterministic content readiness rather than a prediction of ranking or AI citation.
- Classified FAQ and `llms.txt` as optional, zero-point signals.
- Removed the exact-one-H1 and fixed meta-description-length assumptions.
- Changed quantitative-content guidance to flag unsourced claims instead of rewarding more numbers.
- Stopped inferring `FAQPage` structured data from question headings.
- Limited CI support to maintained Node.js LTS lines and refreshed dependencies.
- Added methodology, contribution, security, roadmap, and root GitHub Action files.
- Made the GitHub Action advisory by default, with explicit blocking mode, version-matched package installation, stable outputs, and contract fixtures.
- Added a public positive, negative, and false-positive boundary corpus for every scored rule.
- Added a copyable end-to-end GitHub Action sample plus release and rollback instructions.

### Security

- Updated runtime and development dependencies to remove known npm audit findings present in the previous lockfile.

## 0.5.3 — 2026-04-15

- Added the `aeoptimize` executable alias.
- Synchronized CLI, Action, and plugin version metadata.
