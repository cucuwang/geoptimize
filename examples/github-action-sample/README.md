# geoptimize GitHub Action sample

This directory is a copyable end-to-end sample for the v0.6 Action contract.

- `.github/workflows/geoptimize.yml` checks the static site on pull requests and manual runs.
- `site/index.html` is a deterministic public input.
- The Action is advisory by default. The sample does not block a pull request on an unreviewed score threshold.

The workflow pins the published `geoptimize@0.10.0` package through the immutable
`v0.10.0` Git tag. Both artifacts were verified against the same release commit.
