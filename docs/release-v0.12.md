# v0.12 release runbook

Version 0.12.0 fixes readiness scoring false positives and site-audit evidence
handling. Scoring is now `readiness-v0.6.1-details-v1`, and audit metric evidence
uses `metricEvidenceVersion` `1.1`. Detailed reports from `readiness-v0.6.0-details-v1`
and metric evidence `1.0` remain readable. Previous scoring baselines are
non-comparable, and cross-version metric evidence produces no comparison deltas.
The previous stable release is 0.11.0. Public-facing changes belong in
[release notes](release-notes-v0.12.md).

## Candidate acceptance

Start from a committed, clean checkout. The release version must agree across the
package and lockfile, CLI, plugin metadata, both Action defaults, sample workflow,
and CI tarball paths. The reusable CI workflow runs on Node 22 and 24 and requires
byte-identical tarballs. It checks tests, TypeScript, Action behavior, npm audit,
package contents, clean consumer installation, all three CLI aliases, and report
and SEO ledger contracts.

Local candidate export on either supported runtime:

```bash
npm ci
release_dir=$(mktemp -d)
RELEASE_MANIFEST_OUT="$release_dir/candidate.json" \
RELEASE_TARBALL_OUT="$release_dir/geoptimize-0.12.0.tgz" npm run release:check
node scripts/prepare-release-artifacts.mjs "$release_dir"
(cd "$release_dir" && shasum -a 256 --check SHA256SUMS)
npm pack "$release_dir/geoptimize-0.12.0.tgz" --dry-run --ignore-scripts --json
```

PR CI exercises the same non-publishing path and retains the exact verified tarball,
its checksum manifest, and an SPDX 2.3 production-dependency SBOM. Publication uses
that artifact without rebuilding it. The interactive flow also needs a real TTY
smoke check, including cancellation and protection of existing output files.

## Publish v0.12.0

1. Confirm the [maintainer gates](maintainer-security-settings.md), the publication
   authorization, an unused npm version and tag, and green PR checks. Merge the
   release preparation and fetch the exact current `main` commit.
2. Create an annotated SSH-signed `v0.12.0` tag for that commit using the approved
   signing identity. Push the tag and verify GitHub reports a valid signature and
   the same target commit. Preserve existing tags and releases.
3. Dispatch `.github/workflows/release.yml` from `main` with `publish=true` and
   `tag=v0.12.0`. The `npm-release` environment and `RELEASE_ENABLED` gate apply.
4. The workflow revalidates both Node candidates, checks the signed tag and exact
   main SHA, rejects an existing npm version, and verifies artifact hashes.
5. It attests the tarball, stages a draft GitHub Release with all assets, publishes
   the verified tarball through npm OIDC, then finalizes the immutable release.

The default manual dispatch keeps `publish=false` for packaging checks. Tag pushes
alone do not publish. The workflow uses `npm publish --ignore-scripts` only for the
already-tested tarball; the candidate gates have executed explicitly. Never bypass the exact-main, signed-tag, or unused-version gates.

## Publication verification

Read back the release workflow, non-draft immutable GitHub Release, signed tag,
npm `latest`, and exact `geoptimize@0.12.0` package. Download the released tarball,
`SHA256SUMS`, and `geoptimize-0.12.0.spdx.json`, then check their actual bytes.
Verify the tarball attestation against this repository and the release source SHA.

```bash
bash scripts/verify-release-public.sh <verified-release-commit> <verified-package-sha256>
gh attestation verify geoptimize-0.12.0.tgz --repo cucuwang/geoptimize \
  --signer-workflow cucuwang/geoptimize/.github/workflows/release.yml
```

The public verifier archives the exact release source and uses its original lockfile.
It retries temporary registry visibility delays only. Identity, hash, tag, and CLI
mismatches fail immediately. Confirm the README renders on npm and run the installed
public package in a real TTY to create and inspect a new HTML report.

## Rollback and recovery

If npm publication fails, retain the staged draft and inspect the failure. If npm
succeeds but GitHub finalization or verification fails, verify the existing package
and draft assets before finishing that same release. Do not publish the version again.
An existing version, moved main, or mismatched source requires investigation.

Published versions, finalized assets, and signed tags remain immutable. With explicit
rollback authorization, restore the previous stable default and deprecate 0.12.0 while
preparing a corrective release:

```bash
npm dist-tag add geoptimize@0.11.0 latest
npm deprecate geoptimize@0.12.0 "Use 0.11.0 while a corrective release is prepared."
```

Preserve the failed release's evidence and fix forward; do not replace its artifacts.
