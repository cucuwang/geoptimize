# v0.9 release and rollback guide

Version 0.9.0 adds metrics, interactive offline reports, detailed rule evidence,
readiness baseline comparisons and source excerpts. Default scoring and scan JSON
remain compatible; `--details` opts into captured evidence and source content.

## Release acceptance

1. Integrate onto the latest `origin/main` without dropping its dependency fixes.
2. Run `npm ci` and `npm run release:check` from a clean release candidate.
3. Require passing Node.js 22 and 24 CI, byte-identical package manifests and the Action contract.
4. Merge the approved release PR, fetch main again and require HEAD to equal origin/main before publishing.
5. Preserve the verified candidate manifest and tarball SHA-256. Publish `geoptimize@0.9.0`, then create `v0.9.0` and a GitHub Release at that same main commit.

## Publication readback

The existing version-driven verifier reads the current package version despite its historical filename.

```bash
npm view geoptimize@0.9.0 version gitHead repository dist --json
bash scripts/verify-release-v0.8.sh <verified-release-commit> <verified-package-sha256>
```

Require npm latest 0.9.0, exact tarball identity, all three CLI aliases, the matching
Git tag and a published non-prerelease GitHub Release. Also generate an offline report
from a clean install using `scan --details --json` and `report --baseline`.

## Rollback

If 0.9.0 must be withdrawn, preserve its immutable version and tag. With rollback
authorization, restore the previous latest version and deprecate the new version.

```bash
npm dist-tag add geoptimize@0.8.0 latest
npm deprecate geoptimize@0.9.0 "Use 0.8.0 while a corrective release is prepared."
```

Add the same notice to the GitHub Release and fix forward with a new version.
