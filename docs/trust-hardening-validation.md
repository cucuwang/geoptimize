# Trust-hardening validation record

2026-09-09, PR [#19](https://github.com/cucuwang/geoptimize/pull/19).

## Executed locally

| Command / check | Result |
| --- | --- |
| npm ci | Passed on Node 24.19.0 / npm 11.9.0 |
| npm test | Original 231 tests plus 11 release-hardening tests passed; 242 total |
| npm test -- --run src/core/__tests__/release-publication.test.ts | 10 additional preflight tests passed |
| npm run build | Passed |
| npm run release:check | Passed with all 242 tests, Action contract, audit, package contents, non-empty packaged README, clean consumer, aliases and report checks |
| npm audit --audit-level=high (inside release:check) | 0 vulnerabilities at test time |
| node scripts/prepare-release-artifacts.mjs /tmp/geoptimize-trust-artifacts | SPDX generated and root identity/hash validated |
| sha256sum --check SHA256SUMS | Tarball and SPDX both passed |
| npm pack <verified-tarball> --dry-run --ignore-scripts --json | Passed; geoptimize 0.9.0, 90 package files |
| actionlint 1.7.12 -shellcheck='' | All workflow syntax/expressions passed; ShellCheck was unavailable and was not claimed |
| Python yaml.safe_load on workflows, Dependabot and issue config | Passed; all external uses references are 40-character SHAs |
| node --check scripts/prepare-release-artifacts.mjs; bash -n scripts/verify-release-publication.sh | Passed |
| git diff --check | Passed |

The release workflow uses a public release-notes file rather than publishing this
maintainer runbook. A contract test keeps the two paths separate.

Actionlint download SHA-256 was checked against the official GitHub release asset:
`8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.

The initial npm publish --dry-run correctly rejected already-published 0.9.0.
PR preview now uses npm pack --dry-run against the verified tarball, with no force
flag or weakened version/security gate. No package was published.

## GitHub evidence on the current PR head

Commit `17986f9258d38028e06e47265ffc36c0878e361d`:

- [CI run 34348461590](https://github.com/cucuwang/geoptimize/actions/runs/34348461590):
  test-and-build (22), test-and-build (24), release-candidate-reproducibility,
  lint-readme-commands and action-contract all passed. Node 24 also generated release
  assets/SBOM/checksums and exercised the non-publishing tarball preview.
- [CodeQL run 34348461591](https://github.com/cucuwang/geoptimize/actions/runs/34348461591):
  JavaScript/TypeScript and GitHub Actions analyses both passed.
- [Dependency Review run 34348461644](https://github.com/cucuwang/geoptimize/actions/runs/34348461644):
  passed after the dependency graph and vulnerability alerts were enabled. The failure
  was rerun without weakening its severity gate.
- `main-required-checks` ruleset 22637595 is Active with no bypass actors. It requires
  a pull request, resolved conversations, an up-to-date branch and all eight documented
  CI, Dependency Review and CodeQL contexts.
- Dependabot security updates and private vulnerability reporting were enabled and
  returned `enabled: true`. Secret scanning and push protection remain enabled.

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
- Immutable-release setting, npm Trusted Publisher/environment, OpenSSF registration
  and signing identity remain maintainer gates.

## Public issue reconciliation

#11's Marketplace listing was verified for owner cucuwang and version 0.9.0. #16's
Mac checkout now uses the geoptimize origin, and the original 0.9.0 candidate hash,
public tarball, three aliases, tag and Release were read back successfully. #9/#10
retain their feature scope. Bundling remains tracked in [#20](https://github.com/cucuwang/geoptimize/issues/20).
