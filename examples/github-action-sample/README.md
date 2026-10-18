# geoptimize GitHub Action sample

This directory is a copyable end-to-end sample for the v0.6 Action contract.

- `.github/workflows/geoptimize.yml` checks the static site on pull requests and manual runs.
- `site/index.html` is a deterministic public input.
- The Action is advisory by default. The sample does not block a pull request on an unreviewed score threshold.
- [VitePress workflow example](vitepress/README.md) adapts the check for an existing npm-based VitePress project.

The workflow pins `geoptimize@0.12.0` through the immutable `v0.12.0` Git tag.
Change this exact version only when deliberately adopting another release.
