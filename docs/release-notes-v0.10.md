# geoptimize 0.10.0

## SEO rank watch

- Adds `geo seo` commands for reviewable watchword, rank-history, and improvement ledgers.
- Keeps one page experiment observing at a time and starts its seven-day cooldown only after public deployment.
- Preserves fixed query, page, country, device, search type, and date-window evidence for later review.
- Includes the reusable `/seo-rank-watch` skill and workflow guide.

## Release integrity

- Publishes the exact tarball validated by CI on Node.js 22 and 24.
- Adds npm provenance and GitHub artifact attestation for the release tarball.
- Includes SHA-256 checksums and an SPDX 2.3 production-dependency SBOM.
- Pins GitHub Actions to reviewed upstream commits and applies least-privilege workflow permissions.

## Compatibility

The readiness score, existing audit JSON output, and composite Action scoring contracts remain unchanged.

## Install

```bash
npm install --save-dev geoptimize@0.10.0
```

```bash
npx geoptimize scan ./dist --dir
```
