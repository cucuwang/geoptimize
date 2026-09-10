# geoptimize GitHub Action sample

This directory is a copyable end-to-end sample for the v0.6 Action contract.

- `.github/workflows/geoptimize.yml` checks the static site on pull requests and manual runs.
- `site/index.html` is a deterministic public input.
- The Action is advisory by default. The sample does not block a pull request on an unreviewed score threshold.

The workflow becomes reproducible only after both `geoptimize@0.10.0` exists on npm and the immutable `v0.10.0` Git tag points to the matching release commit. Until both artifacts exist, use the local CLI or the release-candidate package during controlled verification.
