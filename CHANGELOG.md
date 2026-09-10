# Changelog

All notable user-visible changes will be documented here. The project follows Semantic Versioning after the v0.6 evidence baseline is released.

## 0.10.0

### Added

- Added `geo seo` commands for reviewable watchword, rank-history, and improvement ledgers.
- Added fixed query-segment evidence, one-experiment-at-a-time selection, and a seven-day post-publication review cooldown.
- Added a reusable SEO rank-watch skill and workflow documentation.

### Compatibility

- Kept the deterministic content-readiness score and existing audit JSON contracts unchanged.
- Kept Search Console authentication and search-result collection outside the CLI; observations remain explicit user-supplied evidence.

### Security

- Added a SHA-pinned, least-privilege CI and OIDC release pipeline.
- Added verified tarball export with checksums, an SPDX SBOM, and attestation support.
- Documented maintainer settings, release recovery, and current OpenSSF gaps.

## 0.9.0

### Added

- Added 19 site metrics with complete finding counts and bounded scan comparisons.
- Added offline HTML reports with the original five readiness dimensions, page and severity charts, rule drilldowns, searchable pages, and clickable site evidence.
- Added optional `scan --details` output containing all 17 original rule results, versioned scoring evidence, and bounded source excerpts with capture provenance.
- Added readiness baseline comparisons and matched before/after source excerpts, with score, scope, timestamp and evidence validation.
- Included interactive example reports and refreshed the terminal demonstration.

### Compatibility

- Preserved the scoring algorithm and default `scan --json` output. Detailed evidence is opt-in.
- Older site reports remain readable; unavailable counts and incompatible comparisons are labeled explicitly.
- Retained the security dependency updates from 0.8.0.

## 0.8.0

### Changed

- Renamed the npm package and repository to `geoptimize`, with `geoptimize`, `geo`, and `geo-cli` executables.
- Renamed framework APIs to `geoPlugin` and `withGeo`, bundled skills to `geo-*`, and generated schema output to `_geo`.
- Updated the GitHub Action to install `geoptimize@0.8.0`. Existing users should update package imports, CLI commands, and Action references.
- Preserved deterministic scoring and audit evidence contracts.
- Refreshed js-yaml and Vitest dependencies to address published security advisories.

## 0.7.0

### Added

- Added `audit-build` for local HTML directories with cross-page title/canonical review, syntax checks and optional `--expect-indexable --fail-on-error` CI gates.
- Added an evidence-backed `audit` command for one URL or HTML/Markdown file, with versioned `PASS`, `WARNING`, `FAIL`, and `N/A` checks.
- Added structured observations, remediation, validation guidance, and explicit limitations for HTTP, metadata, headings, canonical, robots directives, links, images, and JSON-LD.
- Added a bounded, same-origin `audit-site` command for robots-aware page discovery, sitemap comparison, HTTP failures, redirect chains, internal-link targets, canonical conflicts, orphan candidates, and duplicate titles.

### Compatibility

- Kept the v0.6 readiness score and existing `scan --json` contract unchanged.

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

- Added the `geoptimize` executable alias.
- Synchronized CLI, Action, and plugin version metadata.
