#!/usr/bin/env bash
set -euo pipefail
assets=${1:?artifact directory required}
: "${RELEASE_TAG:?existing signed tag required}"
: "${GITHUB_SHA:?workflow commit required}"
: "${GITHUB_REPOSITORY:?repository required}"
test "$GITHUB_REPOSITORY" = cucuwang/geoptimize
test -z "$(git status --porcelain)"
bash scripts/verify-publish-source.sh
test "$(gh api repos/cucuwang/geoptimize/git/ref/heads/main --jq .object.sha)" = "$GITHUB_SHA"
version=$(node -p "JSON.parse(require('fs').readFileSync('package.json')).version")
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]
test "$RELEASE_TAG" = "v$version"
# A lightweight tag or a signed commit alone does not satisfy the signed-tag policy.
ref=$(gh api "repos/cucuwang/geoptimize/git/ref/tags/$RELEASE_TAG")
test "$(jq -r .object.type <<< "$ref")" = tag
tag=$(gh api "repos/cucuwang/geoptimize/git/tags/$(jq -r .object.sha <<< "$ref")")
jq -e --arg sha "$GITHUB_SHA" '.verification.verified == true and .object.type == "commit" and .object.sha == $sha' <<< "$tag" >/dev/null
node - "$(npm --version)" <<'NODE'
const [major, minor, patch] = process.argv[2].split('.').map(Number);
if (major < 11 || (major === 11 && (minor < 5 || (minor === 5 && patch < 1)))) throw new Error('npm >=11.5.1 required for OIDC');
NODE
(cd "$assets" && sha256sum --check SHA256SUMS)
jq -e --arg version "$version" '.version == $version and .filename == ("geoptimize-" + $version + ".tgz")' "$assets/candidate.json" >/dev/null
test "$(sha256sum "$assets/geoptimize-$version.tgz" | cut -d ' ' -f1)" = "$(jq -r .sha256 "$assets/candidate.json")"
# Fail closed on registry errors other than an explicit version-not-found result.
lookup=$(mktemp)
trap 'rm -f "$lookup"' EXIT
if npm view "geoptimize@$version" version --json > "$lookup"; then
  echo 'Version already exists: stop and inspect; never overwrite a release.' >&2
  exit 1
fi
jq -e '.error.code == "E404"' "$lookup" >/dev/null
# Existing drafts require deliberate recovery; create cannot silently overwrite one.
echo "Publication preflight passed for $RELEASE_TAG at $GITHUB_SHA"
