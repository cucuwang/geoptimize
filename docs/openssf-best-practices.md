# OpenSSF Best Practices: Passing gap analysis

Assessment date: 2026-09-11; release evidence reviewed 2026-09-11. The repository
state under review is `e4580129e746110cdacf3b4644757c9575c56a93`. This is evidence
preparation, not a certification or completed questionnaire. [Official Passing
criteria](https://www.bestpractices.dev/en/criteria/0?details=true&rationale=true)
remain authoritative; review every applicable MUST/MUST NOT and justify SHOULD items
when registering. Silver and Gold are outside scope.

## Already satisfied (repository evidence)

| Criterion area | Evidence |
| --- | --- |
| Purpose, basic usage, supported environment | README quick start; package.json engines |
| Free/open-source license and source availability | Public Git repository, MIT LICENSE, npm repository metadata |
| Version control and uniquely identified releases | Git history; historical version tags; CHANGELOG and release runbooks |
| Contribution process and public issue reporting | CONTRIBUTING.md, GitHub issues, focused issue/PR templates |
| Reproducible build instructions and automated test entry point | npm ci, npm run check, lockfile, test sources and public fixtures |
| Interface and limitations documentation | README, methodology, versioned JSON contracts and tests |
| Vulnerability reporting process | SECURITY.md safe-reporting guidance and seven-day acknowledgement target |

These are observable artifacts, not a declaration that every criterion in an area
is met. Public source availability does not establish license compatibility of every
transitive dependency or the maintainer's historical response performance.

## Repository and evidence status

| Work | Status / evidence needed |
| --- | --- |
| Static analysis for application and workflow sources | CodeQL and Scorecard workflow runs for `e458012` completed successfully. Scorecard v5.3.0 still reports open findings, including SAST 7 with 8 of 23 sampled PR heads checked; the four CodeQL baseline findings were reproduced locally with CodeQL 2.27.0. A successful workflow or local reproduction is not alert closure. |
| Automated dependency review and updates | Dependency Review passed; Dependabot alerts, security updates and weekly version updates are enabled |
| Verifiable release integrity | v0.10.0 is public with npm OIDC provenance, an SSH-signed tag, checksums, an SPDX SBOM and a GitHub attestation; future releases must repeat the same gates |
| Document operational trust boundaries | Release/settings/Action decision documents added; the direct private-report link is a local working-tree change in this remediation and is not public evidence until merged |
| OpenSSF CII-Best-Practices check | Scorecard v5.3.0 reports score 0 because no badge is detected. Its evaluation maps InProgress to 2, Passing to 5, Silver to 7 and Gold to 10. This workflow has no custom policy input; the pinned action v2.4.3 template uses 5 as the default Passing threshold. Read the effective SARIF policy and the per-commit result before declaring an alert cleared. |
| Release notes for security fixes | Changelog process exists; describe actual fixes and identifiers when applicable |

The current repository administration readback reports private vulnerability
reporting `enabled: true`. The working-tree `SECURITY.md` now links the direct
[private report form](https://github.com/cucuwang/geoptimize/security/advisories/new);
the link becomes public evidence only after this change is merged and the next
Scorecard result is read back.

## Maintainer/manual verification required

- Register the canonical project URL `https://github.com/cucuwang/geoptimize` at
  [bestpractices.dev](https://www.bestpractices.dev/) and answer every applicable
  Passing criterion with public evidence links. The external questionnaire and
  its service-assigned project identity are required for the CII check.
- `know_secure_design` / `know_common_errors`: identify a primary developer who
  can substantiate both areas and complete the service's human attestations. A
  workflow, agent review or test count cannot provide these attestations.
- Private reporting is enabled; monitor acknowledgement/remediation performance
  rather than inferring historical responsiveness from a written target.
- Review outstanding static-analysis, dependency and reported vulnerability findings;
  document severity, disposition and timely fixes. Audit success is time-bound.
- Confirm test-policy enforcement for new functionality and fixes, and that important
  functionality is exercised. Test count alone cannot establish adequacy.
- Review distributed dependencies' license obligations and maintain appropriate notices.
- Verify secure transport for distribution, current cryptographic library use, entropy
  requirements where relevant, and absence of known unpatched exploitable vulnerabilities.
- Confirm English/public documentation and issue/release accessibility, user support
  expectations, and release-note practice against the complete live questionnaire.
- Only insert the Best Practices badge after the service awards Passing or higher.
  Read back the public project status and the [Scorecard API result](https://api.securityscorecards.dev/projects/github.com/cucuwang/geoptimize).
  Scorecard is a separate automated assessment and does not award this badge.

## Not applicable (bounded, requires maintainer confirmation)

- Project-owned encryption/signature algorithms or custom password storage: none are
  introduced here. HTTPS/TLS is delegated to runtime/platform implementations; assess
  applicable cryptographic-use criteria separately rather than marking all crypto N/A.
- Memory-unsafe implementation analysis: first-party code is TypeScript/JavaScript;
  this does not exempt dependencies, browser interaction or input validation.
- No specific N/A questionnaire answer is preselected. Use N/A only where the actual
  criterion allows it and the current code review supports the explanation.

The per-alert implementation, acceptance readback, rollback notes and remote gates
are tracked in [docs/code-scanning-remediation.md](code-scanning-remediation.md).
