# VitePress GitHub Action sample

This is a copyable advisory-mode workflow for an existing npm-based VitePress project. It is not a standalone runnable site fixture.

Copy the [sample workflow](.github/workflows/geoptimize.yml) to `.github/workflows/geoptimize.yml` at the repository root of your project.

## Prerequisites

- `package.json` at the repository root and a committed `package-lock.json`.
- VitePress installed as a local dependency.
- A `docs:build` script that runs `vitepress build docs`.
- VitePress sources in `docs/`, with the default output at `docs/.vitepress/dist`.

The workflow runs `npm ci`, builds the site, and scans `docs/.vitepress/dist` with `cucuwang/geoptimize@v0.12.0`. Advisory mode lets a low score pass; installation, build, and scan errors still fail the job.

For another site root or a custom `outDir`, adjust the `docs:build` command and the Action `path` together so they point to the same build output. See the [official VitePress deployment guide](https://vitepress.dev/guide/deploy) for deployment details.
