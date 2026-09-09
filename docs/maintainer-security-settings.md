# Maintainer security settings

Snapshot: 2026-09-09. Configuration files do not prove account settings are enabled.
The connected API exposes ruleset reads, but no supported administration mutation.
No account settings, credentials, production tags or releases were changed by this PR.

## GitHub rulesets

Settings → Rules → Rulesets → `protect-main` (ID 22617494) currently blocks deletion
and force pushes only. It also targets two maintenance branches. Preserve that
coverage; create a separate **main-required-checks** branch ruleset targeting `main`
to avoid requiring new checks on historical maintenance branches.

Set enforcement Active, no routine bypass actors, and enable:

- Require a pull request before merging; required approvals **0** for the current
  single maintainer. Leave required CODEOWNER review and last-push approval off.
- Require conversation resolution before merging.
- Require status checks to pass; require branches to be up to date before merging.
- Block deletions and force pushes (already provided by protect-main).

After the PR checks have run, choose these exact GitHub Actions contexts:

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

The first five job identifiers and Node matrix values are preserved. Select the
observed context names in Settings after successful runs; do not select the nested
`validate / …` names from the manual release workflow. Avoid path filters on required
checks. Add further checks only after their real runs are healthy.

`protect-release-tags` (ID 22617499) is already Active for `v*.*.*`, blocking updates,
deletion and non-fast-forward changes with no bypass actors. Preserve it and v0.9.0.

## Security feature settings

Open repository Settings → Security → **Advanced Security** (older UI: Code security
and analysis). Enable/check each independently:

| Feature | Expected state / next action |
| --- | --- |
| Dependency graph | **Action required:** Dependency Review run 34342823536 failed: graph not enabled / review unsupported. Enable it and rerun the check. |
| Dependabot alerts | Enabled; triage high/critical findings |
| Dependabot security updates | Enabled; weekly version updates are configured in YAML |
| Secret Protection → Secret scanning | Enabled |
| Secret Protection → Push protection | Enabled |
| Private vulnerability reporting | Enabled; confirm Security → Advisories → Report a vulnerability appears |
| Code scanning → CodeQL | Use Advanced setup from this PR; disable conflicting Default setup if already enabled |

Public-repository availability does not prove a feature is configured. The connector
cannot read these sensitive endpoints, so verify in the UI and record the date.
Dependency Review specifically returned: "Dependency review is not supported on this
repository. Please ensure that Dependency graph is enabled". Direct settings path:
https://github.com/cucuwang/geoptimize/settings/security_analysis. This check is
intentionally left blocking until the setting is enabled; do not add continue-on-error.
Do not create a PAT solely to make these checks pass.

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
