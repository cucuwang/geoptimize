# geoptimize 0.10.0

## Release integrity

- Publishes the exact tarball validated by CI on Node.js 22 and 24.
- Adds npm provenance and GitHub artifact attestation for the release tarball.
- Includes SHA-256 checksums and an SPDX 2.3 production-dependency SBOM.
- Pins GitHub Actions to reviewed upstream commits and applies least-privilege workflow permissions.

## Compatibility

Scoring, CLI, API, JSON output and composite Action contracts remain unchanged.

## Install

```bash
npm install --save-dev geoptimize@0.10.0
```

```bash
npx geoptimize scan ./dist --dir
```
