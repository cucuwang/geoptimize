# OpenSSF Best Practices: Passing gap analysis

Assessment date: 2026-09-09. This is evidence preparation, not a certification or
completed questionnaire. [Official Passing criteria](https://www.bestpractices.dev/en/criteria/0?details=true&rationale=true)
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

## Repository changes required

| Work | Status / evidence needed |
| --- | --- |
| Static analysis for application and workflow sources | CodeQL passed on PR #19; first main run and ongoing finding triage remain |
| Automated dependency review and updates | Dependency Review passed; Dependabot alerts, security updates and weekly version updates are enabled |
| Verifiable release integrity | OIDC workflow, SBOM, checksums and attestation prepared; next authorized release supplies public evidence |
| Document operational trust boundaries | Release/settings/Action decision documents added |
| Release notes for security fixes | Changelog process exists; describe actual fixes and identifiers when applicable |

## Maintainer/manual verification required

- Register the project and answer all Passing criteria with public evidence links.
- `know_secure_design` / `know_common_errors`: identify a primary developer who can
  substantiate secure-design and common-error knowledge. A workflow cannot prove this.
- Private reporting is enabled; monitor acknowledgement/remediation performance rather
  than inferring historical responsiveness from a written target.
- Review outstanding static-analysis, dependency and reported vulnerability findings;
  document severity, disposition and timely fixes. Audit success is time-bound.
- Confirm test-policy enforcement for new functionality and fixes, and that important
  functionality is exercised. Test count alone cannot establish adequacy.
- Review distributed dependencies' license obligations and maintain appropriate notices.
- Verify secure transport for distribution, current cryptographic library use, entropy
  requirements where relevant, and absence of known unpatched exploitable vulnerabilities.
- Confirm English/public documentation and issue/release accessibility, user support
  expectations, and release-note practice against the complete live questionnaire.
- Only insert the Best Practices badge after the service awards Passing. Scorecard is
  a separate automated assessment and does not award this badge.

## Not applicable (bounded, requires maintainer confirmation)

- Project-owned encryption/signature algorithms or custom password storage: none are
  introduced here. HTTPS/TLS is delegated to runtime/platform implementations; assess
  applicable cryptographic-use criteria separately rather than marking all crypto N/A.
- Memory-unsafe implementation analysis: first-party code is TypeScript/JavaScript;
  this does not exempt dependencies, browser interaction or input validation.
- No specific N/A questionnaire answer is preselected. Use N/A only where the actual
  criterion allows it and the current code review supports the explanation.
