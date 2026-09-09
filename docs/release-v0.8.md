# v0.8 release and rollback guide

Version 0.8.0 moves the project to the `geoptimize` npm package, the `cucuwang/geoptimize` repository, and the `geoptimize`, `geo`, and `geo-cli` executables. It also renames the framework APIs to `geoPlugin` and `withGeo`, the bundled skills to `geo-*`, and the generated schema directory to `_geo`.

The deterministic readiness score and audit evidence boundaries remain unchanged. The package does not predict search ranking, indexing, traffic, AI visibility, or citation.

See the [aeoptimize migration guide](https://github.com/cucuwang/geoptimize/blob/main/docs/migrating-from-aeoptimize.md) for exact command, import, and hook changes.

## Release acceptance

1. Rename the GitHub repository to `cucuwang/geoptimize` and update the local remote before preparing the release commit.
2. Run `npm ci` and `npm run release:check` from a clean commit whose `HEAD` matches the freshly fetched `origin/main`.
3. Require passing Node.js 22 and 24 CI, package reproducibility, and Action contract checks on that exact commit.
4. Preserve the candidate manifest and SHA-256. Confirm `geoptimize`, `geo`, and `geo-cli` from the packed artifact in a clean consumer.
5. Verify npm publication access for `geoptimize`, publish 0.8.0, then create the immutable `v0.8.0` tag and GitHub Release at the same commit.

Repository rename, npm publication, tagging, and GitHub Release creation are separate maintainer-authorized operations.

## Publication readback

Verify registry metadata, repository metadata, the exact tarball hash, every CLI alias, the immutable tag, and the non-draft GitHub Release.

```bash
npm view geoptimize version dist-tags --json
npm view geoptimize@0.8.0 version gitHead repository homepage bugs dist --json
bash scripts/verify-release-v0.8.sh <verified-release-commit> <verified-package-sha256>
consumer_root=$(mktemp -d "${TMPDIR:-/tmp}/geoptimize-v0.8.0-consumer.XXXXXX")
npm install --prefix "$consumer_root" geoptimize@0.8.0
"$consumer_root/node_modules/.bin/geoptimize" --version
"$consumer_root/node_modules/.bin/geo" --version
"$consumer_root/node_modules/.bin/geo-cli" --version
```

Compare the downloaded tarball SHA-256 with `<verified-package-sha256>`. When npm returns `gitHead`, it must equal the release commit.

## Rollback

The first `geoptimize` release has no earlier version under the new npm name. With explicit rollback authorization, deprecate the problematic version and remove the `latest` tag until a corrective release is ready.

```bash
npm deprecate geoptimize@0.8.0 "This release is withdrawn while a corrective version is prepared."
npm dist-tag rm geoptimize latest
```

Update the GitHub Release with the same warning. Preserve the immutable tag and exact-version artifact, then fix forward with a new version and repeat the release gates.

## Repository protection

The active `protect-main` branch ruleset targets the default branch, blocks force pushes and deletion, and has no bypass actors. Normal fast-forward pushes and PR merges remain available. Short-lived development branches may still be rebased.

The active `protect-release-tags` tag ruleset targets `v*.*.*`, blocks updates and deletion, and has no bypass actors. Create each release tag only after verifying the exact publication commit. Major aliases such as `v0` are outside this pattern. Fix published versions forward with a new version.
