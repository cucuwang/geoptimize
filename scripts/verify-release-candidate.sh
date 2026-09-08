#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

for command_name in git jq mktemp node npm; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "missing required command: $command_name" >&2
    exit 2
  fi
done

if [ "${ALLOW_DIRTY_RELEASE_CHECK:-0}" != "1" ] && [ -n "$(git status --porcelain)" ]; then
  echo "release candidate must be built from a clean worktree" >&2
  exit 1
fi

VERIFY_BASE=${TMPDIR:-/tmp}
VERIFY_BASE=${VERIFY_BASE%/}
VERIFY_ROOT=$(mktemp -d "$VERIFY_BASE/geoptimize-release-candidate.XXXXXX")
PACK_ROOT="$VERIFY_ROOT/pack"
CONSUMER_ROOT="$VERIFY_ROOT/consumer"
PACK_JSON="$VERIFY_ROOT/pack.json"

cleanup() {
  case "$VERIFY_ROOT" in
    "$VERIFY_BASE"/geoptimize-release-candidate.*)
      rm -rf -- "$VERIFY_ROOT"
      ;;
    *)
      echo "Refusing to remove unexpected verification path: $VERIFY_ROOT" >&2
      ;;
  esac
}

trap cleanup EXIT
mkdir -p "$PACK_ROOT"

npm run check
bash action/test-contract.sh
npm --cache "$VERIFY_ROOT/npm-cache" audit --audit-level=high
npm_config_dry_run=false npm --cache "$VERIFY_ROOT/npm-cache" \
  pack --json --pack-destination "$PACK_ROOT" > "$PACK_JSON"

PACKAGE_FILENAME=$(jq -er '.[0].filename' "$PACK_JSON")
PACKAGE_VERSION=$(jq -er '.[0].version' "$PACK_JSON")
PACKAGE_FILE_COUNT=$(jq -er '.[0].files | length' "$PACK_JSON")
PACKAGE_UNPACKED_SIZE=$(jq -er '.[0].unpackedSize' "$PACK_JSON")
PACKAGE_TARBALL="$PACK_ROOT/$PACKAGE_FILENAME"
PACKAGE_SHA256=$(node -e "const crypto=require('node:crypto');const fs=require('node:fs');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$PACKAGE_TARBALL")

jq -e '
  (.[0].files | map(.path) | index("dist/cli/index.js")) != null and
  (.[0].files | map(.path) | index("dist/core/audit.js")) != null and
  (.[0].files | map(.path) | index("dist/core/static-audit.js")) != null and
  (.[0].files | map(.path) | index("dist/core/site-audit.js")) != null and
  (.[0].files | map(.path) | index("docs/release-v0.7.md")) != null and
  (.[0].files | map(.path) | index("fixtures/v0.6/rule-corpus.ts")) != null and
  (.[0].files | map(.path) | index("examples/github-action-sample/.github/workflows/geoptimize.yml")) != null and
  (.[0].files | map(.path) | index("scripts/verify-release-candidate.sh")) != null and
  (.[0].files | map(.path) | index("scripts/verify-release-v0.6.sh")) != null
' "$PACK_JSON" >/dev/null

npm_config_dry_run=false npm --cache "$VERIFY_ROOT/npm-cache" install \
  --ignore-scripts --no-audit --no-fund \
  --prefix "$CONSUMER_ROOT" "$PACKAGE_TARBALL" >/dev/null

for binary in geoptimize aeo aeo-cli; do
  BINARY_VERSION=$("$CONSUMER_ROOT/node_modules/.bin/$binary" --version)
  if [ "$BINARY_VERSION" != "$PACKAGE_VERSION" ]; then
    echo "$binary returned $BINARY_VERSION; expected $PACKAGE_VERSION" >&2
    exit 1
  fi
done

for audit_command in audit audit-build audit-site; do
  "$CONSUMER_ROOT/node_modules/.bin/geoptimize" "$audit_command" --help >/dev/null
done

"$CONSUMER_ROOT/node_modules/.bin/geoptimize" audit \
  "$CONSUMER_ROOT/node_modules/geoptimize/examples/github-action-sample/site/index.html" \
  --json > "$VERIFY_ROOT/page-audit.json"
"$CONSUMER_ROOT/node_modules/.bin/geoptimize" audit-build \
  "$CONSUMER_ROOT/node_modules/geoptimize/examples/github-action-sample/site" \
  --json > "$VERIFY_ROOT/build-audit.json"
jq -e '.contractVersion == "1.0" and (.checks | length > 0)' "$VERIFY_ROOT/page-audit.json" >/dev/null
jq -e '.contractVersion == "1.0" and .source == "local-html" and (.pages | length == 1)' "$VERIFY_ROOT/build-audit.json" >/dev/null

MANIFEST=$(jq -n \
  --arg version "$PACKAGE_VERSION" \
  --arg filename "$PACKAGE_FILENAME" \
  --arg sha256 "$PACKAGE_SHA256" \
  --argjson fileCount "$PACKAGE_FILE_COUNT" \
  --argjson unpackedSize "$PACKAGE_UNPACKED_SIZE" \
  '{version: $version, filename: $filename, sha256: $sha256, fileCount: $fileCount, unpackedSize: $unpackedSize}')

if [ -n "${RELEASE_MANIFEST_OUT:-}" ]; then
  printf '%s\n' "$MANIFEST" > "$RELEASE_MANIFEST_OUT"
fi

printf '%s\n' "$MANIFEST"
echo "Release candidate checks passed."
