# v0.7 release and rollback guide

Version 0.7.0 adds three evidence-backed audit workflows while retaining the v0.6.0 scoring methodology and existing `scan --json` contract.

- `audit` inspects one URL or a local HTML/Markdown file.
- `audit-build` checks built HTML with cross-page review and optional CI failure gates.
- `audit-site` performs a bounded, same-origin crawl and compares discovered links, canonical declarations and sitemap entries.

Audit statuses describe the evidence collected. Unavailable evidence remains unassessed. Actual search indexing, rankings, traffic and AI citation outcomes are outside these contracts.

## Release acceptance

1. Build from a clean release commit after `npm ci` and run `npm run release:check`.
2. Require passing Node.js 22 and 24 CI, package reproducibility, and Action contract checks on the exact merged `main` commit.
3. Preserve the candidate manifest and SHA-256. Confirm all three CLI aliases and audit commands work from that exact packed artifact in a clean consumer.
4. Verify the npm account immediately before publication, fetch `origin/main`, and require the publish source gate to confirm the exact commit.
5. Publish npm 0.7.0, then create the immutable `v0.7.0` tag and GitHub Release at that same commit. These external steps require maintainer authorization.

`prepublishOnly` runs the candidate and source gates. The source gate requires `HEAD` to equal the freshly fetched `origin/main` commit. Do not bypass it or publish a pre-merge feature commit.

## Publication readback

Verify npm metadata and the exact version, download its tarball, compare its SHA-256 with the candidate, and install all CLI aliases from those verified bytes. Confirm the immutable tag and published GitHub Release independently.

```bash
npm view aeoptimize version dist-tags --json
npm view aeoptimize@0.7.0 version gitHead dist --json
bash scripts/verify-release-v0.6.sh <verified-release-commit> <verified-package-sha256>
```

The public verifier keeps its historical filename and reads the expected version from package.json. When npm supplies `gitHead`, it must match the release commit. The tarball hash is required even when that optional metadata field is absent.

## Rollback

With explicit rollback authorization, restore `latest` to the last fully published release and deprecate the problematic version.

```bash
npm dist-tag add aeoptimize@0.6.2 latest
npm deprecate aeoptimize@0.7.0 "Use 0.6.2 while an audit regression is corrected."
```

Update the GitHub Release with the same warning. Preserve existing tags and exact-version artifacts, then fix forward with a new version and repeat the release gates.

## Legacy 0.7.1 publication

Version 0.7.1 adds the geoptimize migration notice while retaining aeoptimize interfaces. Publish from the exact freshly fetched `origin/maintenance/aeoptimize-0.7` commit; this branch's source gate and CI target that maintenance branch. Main carries the geoptimize package.
