# v0.10 trust-hardening release runbook

Status: published and verified on 2026-09-11.
Version 0.10.0 was published from commit
`01ac0f19e2a7f8f8854b3304ecd0193a6a9d2b63` with an SSH-signed tag, npm OIDC
provenance and a GitHub artifact attestation. This release adds the `geo seo`
CLI, API, data contract, and skill while preserving the readiness score,
existing audit JSON, and composite Action scoring contracts.

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

## Executed release procedure

1. Maintainer settings were completed, including the npm environment binding, main
   required checks, immutable releases and an approved signing identity.
2. The version update aligned package/lock, CLI and plugin metadata, both Action
   defaults, sample pins, CI tarball fixtures, changelog, the SEO workflow and release
   contract expectations. All release gates passed before publication.
3. The approved release commit was merged and re-fetched as the exact main HEAD. The
   annotated SSH-signed `v0.10.0` tag was created for that commit and verified on GitHub.
4. Release was dispatched from main with tag `v0.10.0` and `publish=true`. The
   npm-release environment admitted the job after the source and artifact checks passed.
5. Preflight rejected wrong or previously published versions and required the signed
   tag, exact main SHA, expected repository and byte-identical candidate.
6. The workflow attested the tarball, staged a draft with all assets, published the
   verified tarball through npm OIDC, and finalized the GitHub Release.

The GitHub Release uses [public release notes](release-notes-v0.10.md). Keep setup,
approval and recovery instructions in this runbook rather than publishing them as the
release description.

Published assets: `geoptimize-0.10.0.tgz`, `geoptimize-0.10.0.spdx.json`, `SHA256SUMS`.
The Actions artifact also retains candidate.json. Filenames are version-derived.
Checksums are calculated from actual artifact bytes, including the SBOM.

## Publication receipt

| Evidence | Verified value |
| --- | --- |
| Release commit | `01ac0f19e2a7f8f8854b3304ecd0193a6a9d2b63` |
| Signed tag | `v0.10.0`, GitHub verification `valid` |
| npm package | `geoptimize@0.10.0`, dist-tag `latest` |
| Tarball SHA-256 | `dbe2d0702020875a1cbef60a52c82cf3415c5f75ee2b44ff88dacb021e023d7c` |
| GitHub Release | [geoptimize 0.10.0](https://github.com/cucuwang/geoptimize/releases/tag/v0.10.0) |
| Publication workflow | [Release run 34567150571](https://github.com/cucuwang/geoptimize/actions/runs/34567150571) |
| Provenance signer | `.github/workflows/release.yml` on `refs/heads/main` |

The npm publish command succeeded at 05:46:10Z and reported that registry processing
could take a few minutes. The same workflow ran its public verifier one second later,
before npm exposed the new packument, so the run retained a failed final check. npm
published the version at 05:49:19Z. After propagation, the same verifier passed the npm
version, repository identity, tarball hash, all three CLI aliases, tag target and
non-draft GitHub Release. Publication must not be rerun for this immutable version.

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
