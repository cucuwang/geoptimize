# Trust-hardening validation record

2026-09-09, PR [#19](https://github.com/cucuwang/geoptimize/pull/19).

## Executed locally

| Command / check | Result |
| --- | --- |
| npm ci | Passed on Node 24.19.0 / npm 11.9.0 |
| npm test | Original 231 tests passed |
| npm test -- --run src/core/__tests__/release-publication.test.ts | 10 additional preflight tests passed |
| npm run build | Passed |
| npm run release:check | Passed with all 241 tests, Action contract, audit, package contents, clean consumer, aliases and report checks |
| npm audit --audit-level=high (inside release:check) | 0 vulnerabilities at test time |
| node scripts/prepare-release-artifacts.mjs /tmp/geoptimize-trust-artifacts | SPDX generated and root identity/hash validated |
| sha256sum --check SHA256SUMS | Tarball and SPDX both passed |
| npm pack <verified-tarball> --dry-run --ignore-scripts --json | Passed; geoptimize 0.9.0, 90 package files |
| actionlint 1.7.12 -shellcheck='' | All workflow syntax/expressions passed; ShellCheck was unavailable and was not claimed |
| Python yaml.safe_load on workflows, Dependabot and issue config | Passed; all external uses references are 40-character SHAs |
| node --check scripts/prepare-release-artifacts.mjs; bash -n scripts/verify-release-publication.sh | Passed |
| git diff --check | Passed |

Actionlint download SHA-256 was checked against the official GitHub release asset:
`8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.

The initial npm publish --dry-run correctly rejected already-published 0.9.0.
PR preview now uses npm pack --dry-run against the verified tarball, with no force
flag or weakened version/security gate. No package was published.

## GitHub evidence before the final documentation update

Commit `1f6d7de6b1a7c5164f12a445813c1f4224aab6e4`:

- [CI run 34342957970](https://github.com/cucuwang/geoptimize/actions/runs/34342957970):
  test-and-build (22), test-and-build (24), release-candidate-reproducibility,
  lint-readme-commands and action-contract all passed. Node 24 also generated release
  assets/SBOM/checksums and exercised the non-publishing tarball preview.
- [CodeQL run 34342957988](https://github.com/cucuwang/geoptimize/actions/runs/34342957988):
  JavaScript/TypeScript and GitHub Actions analyses both passed.
- [Dependency Review run 34342957977](https://github.com/cucuwang/geoptimize/actions/runs/34342957977):
  blocked because Dependency graph is not enabled/review is unsupported. Maintainer
  must enable the graph, then rerun; this failure has not been suppressed.

The PR checks panel is authoritative for the latest commit. Documentation changes
also affect the npm tarball, so require a fresh successful reproducibility run before
merging. Production source/scoring code and existing fixtures were not modified;
existing scoring contract tests pass. The only new src file is a preflight test.

## Not executed / not established

- Actual npm OIDC authentication, provenance and GitHub attestation issuance require
  the authorized release path and account setup; dry-run cannot prove these.
- The manual release dispatcher is available after merge to main. Its full reusable
  CI/non-publishing pipeline has been exercised by PR CI; publication steps have
  only static/preflight validation.
- Scorecard is configured for main pushes/schedule and awaits its first main run.
  Syntax and upstream pin were verified; no successful score or badge is asserted.
- Private reporting, secret scanning/push protection, immutable-release setting,
  OpenSSF registration and signing identity remain maintainer UI gates.

## Public issue reconciliation

#11 retains Marketplace live-listing verification. #16 replaces the stale npm 404
with verified 0.9.0 metadata and retains Mac/readback follow-ups. #9/#10 examples use
the current name/version; their feature/test scope stays open. Historical dogfood
reports were preserved. Bundling is tracked in [#20](https://github.com/cucuwang/geoptimize/issues/20).
