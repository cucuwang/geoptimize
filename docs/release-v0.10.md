# v0.10 trust-hardening release runbook

Status: release candidate preparation; package version 0.10.0 is under review.
Nothing in this document asserts that 0.10.0 has been published. This release
adds the `geo seo` CLI, API, data contract, and skill while preserving the
readiness score, existing audit JSON, and composite Action scoring contracts.

## Candidate and dry run

The reusable CI workflow remains the single acceptance pipeline. On both Node 22
and 24 it runs `npm ci` and `npm run release:check`: clean worktree, tests, TypeScript,
Action shell contract, high/critical npm audit gate, package contents, clean consumer
installation, all three aliases, report contracts, and the clean-install SEO
workflow. Separate jobs exercise the actual composite Action, README commands,
and byte-identical Node candidate manifests.

The verifier can export its already-tested tarball via `RELEASE_TARBALL_OUT`; it never
re-packs for publication. Node 24 prepares a production SPDX 2.3 SBOM, SHA256SUMS and
previews the exact tarball with `npm pack <tarball> --dry-run --ignore-scripts`.
PR CI exercises this non-publishing path. npm publish --dry-run rejects an already
published version, so ordinary PRs use pack preview without bypassing that safeguard.
`--ignore-scripts` applies to publishing the existing tarball only; all acceptance
checks have already executed explicitly. Existing prepublishOnly remains intact.

Local reproduction from a committed, clean checkout:

```bash
npm ci
npm test
npm run build
release_dir=$(mktemp -d)
version=$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")
RELEASE_MANIFEST_OUT="$release_dir/candidate.json" RELEASE_TARBALL_OUT="$release_dir/geoptimize-$version.tgz" npm run release:check
node scripts/prepare-release-artifacts.mjs "$release_dir"
(cd "$release_dir" && sha256sum --check SHA256SUMS)
npm pack "$release_dir/geoptimize-$version.tgz" --dry-run --ignore-scripts --json
```

The candidate gate extracts `package/README.md` from the verified tarball and requires
it to be non-empty. After publication, open the npm package page and confirm that the
README renders. The registry metadata `readme` field can be empty while npm still
renders the packaged README, so that field alone is not a publication failure.

On GitHub, Actions → Release → Run workflow → branch main → leave publish false.
All CI gates run and release-assets is retained; no signing, OIDC publication,
attestation or GitHub Release writes occur. A successful dry run proves packaging,
not external npm authorization or immutable-release settings.

## Authorized next release

1. Complete [maintainer settings](maintainer-security-settings.md), including npm
   environment binding, main required checks, immutable releases and signing identity.
2. Review the version-bump PR that updates package/lock, CLI and plugin metadata,
   both Action defaults, sample pins, hard-coded CI tarball fixtures, changelog,
   the SEO workflow, and release-contract expectations. Run all gates. Preserve v0.9.0.
3. Merge the approved release commit, fetch origin/main, and ensure it is still main's
   exact HEAD. With explicit release authorization, create an annotated signed tag
   (`git tag -s v0.10.0 <commit> -m 'geoptimize 0.10.0'`) and push only that tag.
   Verify it locally and on GitHub. Do not create or move tags as part of hardening.
4. Dispatch Release on main with tag `v0.10.0`, publish true. Confirm the run commit
   matches the tag. Approve npm-release after reviewing the CI results and artifacts.
5. Preflight rejects unsigned/lightweight tags, wrong SHA/version/repository, dirty
   source, changed main HEAD, corrupted artifacts and already-published npm versions.
6. Attest the tarball; create a draft with all assets; publish that exact tarball with
   npm OIDC/provenance; finalize the draft; run the existing public readback verifier.

The GitHub Release uses [public release notes](release-notes-v0.10.md). Keep setup,
approval and recovery instructions in this runbook rather than publishing them as the
release description.

Expected assets: `geoptimize-0.10.0.tgz`, `geoptimize-0.10.0.spdx.json`, `SHA256SUMS`.
The Actions artifact also retains candidate.json. Filenames are version-derived.
Checksums are calculated from actual artifact bytes, including the SBOM.

## What the evidence establishes

- npm provenance links the registry package to its GitHub build/publish workflow and
  source identity. Inspect npm's provenance UI or `npm audit signatures` in a clean
  consumer installation.
- GitHub Artifact Attestation lets a downloader verify the release tarball directly:
  `gh attestation verify geoptimize-0.10.0.tgz --repo cucuwang/geoptimize`.
- SHA256SUMS detects byte changes; trust it through the attested tarball and the
  immutable release. Hashes alone do not authenticate an author.
- SPDX describes the release commit's locked production dependency resolution and
  binds its root package to the exact tarball hash. Dev tools are omitted. Dependencies
  are not bundled: downstream npm installs can resolve different compatible versions.
  It is not a promise of byte-identical consumer dependency trees. SBOM metadata may
  contain generation timestamps; tarball reproducibility is the enforced invariant.

References: [npm SBOM](https://docs.npmjs.com/cli/v11/commands/npm-sbom/),
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/),
[GitHub attestations](https://docs.github.com/en/actions/concepts/security/artifact-attestations),
[immutable releases](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases).

## Rollback and recovery

Publication crosses two services and cannot be atomic. If draft staging succeeds but
npm fails, leave the draft and inspect logs; do not finalize it. If npm succeeds and
GitHub finalization/readback fails, do not rerun npm publication: verify npm tarball
hash/provenance, uploaded assets and signed tag, then finalize the existing draft with
explicit authorization. A normal rerun fails closed on an existing version or draft.
Never overwrite assets on a finalized release or retag an existing version. Deprecate
or adjust dist-tags only with authorization, preserving audit evidence and fixing
forward. An advanced main branch requires a new release decision, not bypassing the
exact-main source gate.

Public readback requires the release commit and verified candidate hash:

```bash
bash scripts/verify-release-v0.8.sh <verified-release-commit> <verified-package-sha256>
```

If rollback is authorized, preserve the published version and protected tag,
restore 0.9.0 as the default, and deprecate 0.10.0 while preparing a corrective release:

```bash
npm dist-tag add geoptimize@0.9.0 latest
npm deprecate geoptimize@0.10.0 "Use 0.9.0 while a corrective release is prepared."
```
