# Security policy

## Supported versions

Security fixes are applied to the latest published minor release. Older releases may be asked to upgrade when a backport is not practical.

## Reporting a vulnerability

Private vulnerability reporting is enabled for `cucuwang/geoptimize`. Submit a report through [GitHub's private vulnerability reporting form](https://github.com/cucuwang/geoptimize/security/advisories/new). Do not include credentials or unnecessary personal data. Include sensitive reproduction details only in that private report.

Include the affected version, environment, reproduction preconditions, impact, and the smallest safe proof of concept. You should receive an acknowledgement within seven days. A remediation timeline depends on severity and reproducibility.

## Scope notes

`geoptimize` can fetch remote pages, invoke a local browser, read build output, and install a Git hook. Reports may contain URLs and excerpts from scanned content. Review artifacts before publishing them and never scan private systems without authorization.

## Release and dependency integrity

Release candidates retain the high/critical npm audit gate. Pull requests add
dependency review; weekly Dependabot and CodeQL/Scorecard workflows support ongoing
triage. Configuration alone does not establish a clean scan or certification.

Automated releases use npm OIDC, tarball attestations, checksums and a locked
production SBOM. Version 0.10.0 is the first release published through this path.
Follow [release verification](docs/release-v0.10.md) and [maintainer security
settings](docs/maintainer-security-settings.md). Earlier releases are not
retroactively signed or attested. No long-lived npm credential is required.
