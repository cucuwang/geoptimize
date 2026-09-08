# v0.6 release and rollback guide

Version 0.6.2 is the provenance-corrective release for the v0.6 evidence-bounded scoring, packaging, and GitHub Action contracts. npm 0.6.1 contained the verified candidate bytes but exposed the pre-squash PR commit as `gitHead`, so no v0.6.1 Git tag or GitHub Release was created. Version 0.6.2 is not released until npm, the Git tag, and the GitHub Release are each created and read back independently.

## Release acceptance

Before publication, run `npm ci` and `npm run release:check` from the intended release commit. The candidate gate verifies all of the following:

1. `npm run check`, `npm audit --audit-level=high`, and `bash action/test-contract.sh` pass.
2. The public v0.6 rule corpus covers the positive, negative, and false-positive boundary for every scored rule.
3. An actual `npm pack` candidate contains the required public files, its SHA-256 is recorded, and a clean consumer can invoke `geoptimize`, `geo`, and `geo-cli` from that exact tarball.
4. CI succeeds on Node.js 22 and 24 for the release commit.
5. The JSON automation contract and Action sample tests pass.
6. The npm account is verified immediately before publishing, and the publish source gate confirms that `HEAD` is the exact fetched `origin/main` commit.

CI runs the same candidate gate on Node.js 22 and 24 and compares version, filename, SHA-256, file count, and unpacked size. `prepublishOnly` invokes the candidate gate again, refuses a dirty worktree, and refuses publication unless `HEAD` matches `origin/main` exactly. Run `git fetch origin main` immediately before the authorized publish so the remote-tracking ref is current.

Publishing, tagging, creating a GitHub Release, changing npm dist-tags, and deprecating a version are separate external mutations and require separate maintainer authorization.

## Release notes

### Artifact-bound release verification

- Build the candidate from a clean worktree and install all three CLI aliases from the exact tarball whose SHA-256 is recorded.
- Require byte-identical candidate manifests from Node.js 22 and 24 before the release can proceed.
- Bind the public verifier's CLI smoke checks to the downloaded, hash-verified npm tarball.
- Fail closed when a CLI alias, tag target, repository identity, or GitHub Release state does not match.
- Fail closed before publication when the checked-out commit differs from the fetched `origin/main` commit.
- Exercise every v0.6 rule fixture through the real HTML parser boundary.

No scoring rule, rule weight, JSON field, Action input, or Action output changes in this patch. No ranking, traffic, indexing, rich-result, AI Overview, or citation outcome is claimed by this release.

## Publication readback

After an authorized npm publication:

```bash
npm view geoptimize version dist-tags --json
npm view geoptimize@0.6.2 version gitHead repository homepage bugs dist --json
consumer_root=$(mktemp -d "${TMPDIR:-/tmp}/geoptimize-v0.6.2-consumer.XXXXXX")
npm install --prefix "$consumer_root" geoptimize@0.6.2
"$consumer_root/node_modules/.bin/geoptimize" --version
"$consumer_root/node_modules/.bin/geo" --version
"$consumer_root/node_modules/.bin/geo-cli" --version
rm -rf -- "$consumer_root"
```

After separately authorized tag and GitHub Release creation, verify that `v0.6.2` points to the tested release commit and that the Release is published rather than draft or prerelease.

The fail-closed public verifier checks npm `latest`, the exact version, public repository identity, the downloaded tarball SHA-256, all three installed CLI aliases, the tag target, and the published GitHub Release. The tarball hash is the required artifact-identity gate. If npm exposes `gitHead`, it must match the expected release commit; absence is reported as informational because npm's publish contract guarantees tarball integrity but does not guarantee that metadata field.

```bash
bash scripts/verify-release-v0.6.sh <verified-release-commit> <verified-package-sha256>
```

## Rollback

An npm dist-tag rollback changes what `npm install geoptimize` selects; it does not remove exact-version installs. Never silently move an existing Git tag to different code.

If npm 0.6.2 is unsuitable, request separate authorization for each mutation and restore `latest` to the last fully released version rather than the provenance-mismatched 0.6.1 artifact:

```bash
npm dist-tag add geoptimize@0.6.0 latest
npm deprecate geoptimize@0.6.2 "Use 0.6.0 until the corrective release is available."
```

Mark the GitHub Release with the same warning. Never create or retarget `v0.6.1` merely to mask its npm `gitHead` mismatch. Preserve immutable versions as evidence, fix forward in 0.6.3, rerun the complete release acceptance suite, and only then move npm `latest` to the corrective version.
