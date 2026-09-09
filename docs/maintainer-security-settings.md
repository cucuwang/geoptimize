# Maintainer security settings

Snapshot: 2026-09-09. Configuration files do not prove account settings are enabled.
The states below were read back through the repository administration API after an
authorized settings update. No credentials, production tags or releases were changed.

## GitHub rulesets

Settings → Rules → Rulesets → `protect-main` (ID 22617494) currently blocks deletion
and force pushes only. It also targets two maintenance branches. Preserve that
coverage. `main-required-checks` (ID 22637595) is Active with no bypass actors and
targets the default branch without affecting historical maintenance branches.

It enforces:

- Require a pull request before merging; required approvals **0** for the current
  single maintainer. Leave required CODEOWNER review and last-push approval off.
- Require conversation resolution before merging.
- Require status checks to pass; require branches to be up to date before merging.
- Block deletions and force pushes (already provided by protect-main).

These exact GitHub Actions contexts are required:

| Required context | Source |
| --- | --- |
| `test-and-build (22)` | CI |
| `test-and-build (24)` | CI |
| `release-candidate-reproducibility` | CI |
| `lint-readme-commands` | CI |
| `action-contract` | CI |
| `dependency-review` | Dependency Review |
| `CodeQL (javascript-typescript)` | CodeQL |
| `CodeQL (actions)` | CodeQL |

The first five job identifiers and Node matrix values are preserved. The ruleset uses
the observed PR context names rather than nested `validate / …` names from the manual
release workflow. It requires branches to be up to date and has no path filters.

`protect-release-tags` (ID 22617499) is already Active for `v*.*.*`, blocking updates,
deletion and non-fast-forward changes with no bypass actors. Preserve it and v0.9.0.

## Security feature settings

Open repository Settings → Security → **Advanced Security** (older UI: Code security
and analysis). Enable/check each independently:

| Feature | Expected state / next action |
| --- | --- |
| Dependency graph | Enabled with vulnerability alerts; Dependency Review run 34348461644 passed after enablement |
| Dependabot alerts | Enabled; triage high/critical findings |
| Dependabot security updates | Enabled; weekly version updates are configured in YAML |
| Secret Protection → Secret scanning | Enabled |
| Secret Protection → Push protection | Enabled |
| Private vulnerability reporting | Enabled; the repository API returned `enabled: true` |
| Code scanning → CodeQL | Advanced workflow passed on PR #19; first main execution remains pending |

The initial Dependency Review failure reported that the dependency graph was disabled.
After enablement, the same head passed without suppressing the check or adding a PAT.
Recheck these settings through the API and UI after ownership or security-plan changes.

## Immutable releases (state not confirmed)

Settings → General → Releases → **Enable release immutability**. This applies to
future releases, not existing v0.9.0. Save before the next publication.
The workflow creates a draft, uploads tarball/checksums/SBOM, publishes npm, then
publishes the draft. A finalized immutable release cannot have assets replaced;
recover by fixing forward. Review Marketplace metadata/terms before dispatch because
finalization must happen only after all desired assets and metadata are in place.

## npm Trusted Publisher and release gate

1. npmjs.com → package **geoptimize** → Settings → Trusted Publisher → GitHub Actions.
2. Organization/user: `cucuwang`; repository: `geoptimize`; workflow filename:
   `release.yml`; environment: `npm-release` (exact spelling; no directory prefix).
3. GitHub Settings → Environments → New environment `npm-release`. Restrict deployment
   branches to `main`. Configure cucuwang as reviewer if available; allow self-review
   for a single maintainer, otherwise the workflow cannot be approved.
4. After all checklist items and a successful dry run, Settings → Secrets and
   variables → Actions → Variables: set `RELEASE_ENABLED` to `true`.
5. Do not add an npm token. The publication job uses GitHub-hosted Node 24 and checks
   npm >=11.5.1; npm OIDC supplies short-lived authorization.
6. Actual publication requires a separate authorization and manual dispatch with
   `publish=true`; the default remains false. No tag-push auto-publication exists.

## Signing identity and OpenSSF

GitHub account Settings → SSH and GPG keys: register an existing approved public
signing key (SSH key type: Signing key, or GPG public key). Configure signing locally
following GitHub's signing guide. This PR does not create or manage keys. Verify a
new annotated signed tag with `git tag -v` and GitHub's Verified indicator; a verified
commit with an unsigned/lightweight tag is insufficient.

At https://www.bestpractices.dev/ sign in and register
`https://github.com/cucuwang/geoptimize`. Complete the Passing questionnaire using
[the gap analysis](openssf-best-practices.md). Only add its badge after the service
actually awards Passing. Scorecard's result badge is likewise deferred until a
successful main-branch upload is visible at scorecard.dev.

References: [npm OIDC](https://docs.npmjs.com/trusted-publishers/),
[immutable releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes),
[signing tags](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-tags).
