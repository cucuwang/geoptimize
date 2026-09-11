# Maintainer security settings

Snapshot: 2026-09-11. Configuration files do not prove account settings are enabled.
The states below were read back through the repository administration API, npm package
settings and the completed v0.10 release. No credential values are stored here.

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

`protect-release-tags` (ID 22617499) is Active for `v*.*.*`, blocking updates,
deletion and non-fast-forward changes with no bypass actors. Preserve the existing
v0.9.0 and signed v0.10.0 tags.

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
| Code scanning → CodeQL | Advanced workflow passes on current main and protected pull requests |

The initial Dependency Review failure reported that the dependency graph was disabled.
After enablement, the same head passed without suppressing the check or adding a PAT.
Recheck these settings through the API and UI after ownership or security-plan changes.

## Immutable releases

Release immutability is enabled for the repository. It applies to v0.10.0 and future
releases; historical v0.9.0 predates this setting. The workflow creates a draft,
uploads tarball/checksums/SBOM, publishes npm, then publishes the draft. A finalized
immutable release cannot have assets replaced; recover by fixing forward. Review all
assets and metadata before finalization.

## npm Trusted Publisher and release gate

Current state

- npm Trusted Publisher binds `cucuwang/geoptimize`, `release.yml` and the
  `npm-release` environment. It permits `npm publish` and `npm stage publish`.
- The GitHub `npm-release` environment accepts only `main` through a custom branch
  policy. Repository variable `RELEASE_ENABLED` is `true`.
- The publication job uses GitHub-hosted Node 24 and npm OIDC. No long-lived npm token
  is configured for this path.
- Publication still requires a separately authorized manual dispatch with
  `publish=true`; the default remains false. Tag pushes do not publish automatically.

For future releases, preserve the exact publisher owner, repository, workflow filename
and environment spelling. Review the signed tag, source SHA and release assets before
dispatching publication.

## Signing identity and OpenSSF

An approved existing SSH public key is registered with GitHub as a signing key. The
repository-local signing configuration uses that public-key path, while the private key
remains local. GitHub verified the annotated v0.10.0 tag as valid and linked it to the
release commit. Future release tags require the same explicit signing and readback;
a verified commit with an unsigned or lightweight tag is insufficient.

At https://www.bestpractices.dev/ sign in and register
`https://github.com/cucuwang/geoptimize`. Complete the Passing questionnaire using
[the gap analysis](openssf-best-practices.md). Only add its badge after the service
actually awards Passing. Scorecard workflows now succeed on main; add a result badge
only after its public score page and repository identity are read back.

References: [npm OIDC](https://docs.npmjs.com/trusted-publishers/),
[immutable releases](https://docs.github.com/en/code-security/how-tos/secure-your-supply-chain/establish-provenance-and-integrity/prevent-release-changes),
[signing tags](https://docs.github.com/en/authentication/managing-commit-signature-verification/signing-tags).
