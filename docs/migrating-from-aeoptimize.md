# Migrating from aeoptimize to geoptimize

`geoptimize` continues the same project previously published as `aeoptimize`. Version 0.7.0 was released under the old npm name; version 0.8.0 is the first release under the new name. The GitHub repository retains the project history, issues, releases, and stars.

[geoptimize on npm](https://www.npmjs.com/package/geoptimize) · [aeoptimize on npm](https://www.npmjs.com/package/aeoptimize) · [v0.7.0 release](https://github.com/cucuwang/geoptimize/releases/tag/v0.7.0) · [current release](https://github.com/cucuwang/geoptimize/releases/tag/v0.10.0)

## Update an existing project

If the old package installed a pre-commit hook, remove that hook before uninstalling the package, using the hook instructions below. For a development dependency, replace the package and update the commands and imports below. If the package is a runtime dependency, keep it in `dependencies` instead of using `--save-dev`.

```bash
npm uninstall aeoptimize
npm install --save-dev geoptimize@0.10.0
```

| Integration | aeoptimize 0.7.0 | geoptimize 0.8.0 and later |
| --- | --- | --- |
| npm package and core imports | `aeoptimize` | `geoptimize` |
| CLI commands | `aeoptimize`, `aeo`, `aeo-cli` | `geoptimize`, `geo`, `geo-cli` |
| Vite import | `aeoPlugin` from `aeoptimize/vite` | `geoPlugin` from `geoptimize/vite` |
| Next.js import | `withAeo` from `aeoptimize/next` | `withGeo` from `geoptimize/next` |
| GitHub Action | `cucuwang/aeoptimize@v0.7.0` | `cucuwang/geoptimize@v0.10.0` |
| Bundled skills | `aeo-scan`, `aeo-generate`, `aeo-transform` | `geo-scan`, `geo-generate`, `geo-transform` |
| Generated schema directory | `_aeo` | `_geo` |

Update package scripts, CI commands, and links to generated schema files. The old executable and framework export names are not aliases in the new package. Existing projects pinned to `aeoptimize` stay on that package until their dependency is changed.

For an installed pre-commit hook, run `npx --no-install aeoptimize hook uninstall` while the old package is still installed, then replace the dependency and run `npx --no-install geoptimize hook install`. Review the hook diff and retain any project-specific threshold. The two versions use different hook block markers.

## Verify the migration

```bash
npx --no-install geoptimize --version
npx --no-install geoptimize audit-build ./dist --json
```

The installed version should be `0.10.0`. Build the consuming project and review its output after updating Vite or Next.js imports. Deterministic scoring and audit evidence contracts are preserved across the rename.

## Package history and download counts

npm treats the two names as separate packages. Historical downloads remain attached to `aeoptimize`; new downloads accumulate under `geoptimize`. A normal `npm update` of `aeoptimize` does not switch the dependency to the new name. When reporting adoption, label the two download series separately; download counts are not unique users.

The legacy package remains available for existing installations. Use `geoptimize` for new integrations.
