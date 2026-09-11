#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$REPO_ROOT"

for command_name in git jq mktemp node npm tar; do
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
NORMALIZED_PACK_JSON="$VERIFY_ROOT/pack-normalized.json"

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
jq 'if type == "array" then . else [to_entries[0].value] end' \
  "$PACK_JSON" > "$NORMALIZED_PACK_JSON"
mv "$NORMALIZED_PACK_JSON" "$PACK_JSON"

PACKAGE_FILENAME=$(jq -er '.[0].filename' "$PACK_JSON")
PACKAGE_VERSION=$(jq -er '.[0].version' "$PACK_JSON")
PACKAGE_FILE_COUNT=$(jq -er '.[0].files | length' "$PACK_JSON")
PACKAGE_UNPACKED_SIZE=$(jq -er '.[0].unpackedSize' "$PACK_JSON")
PACKAGE_TARBALL="$PACK_ROOT/$PACKAGE_FILENAME"
PACKAGE_SHA256=$(node -e "const crypto=require('node:crypto');const fs=require('node:fs');console.log(crypto.createHash('sha256').update(fs.readFileSync(process.argv[1])).digest('hex'))" "$PACKAGE_TARBALL")

jq -e '
  (.[0].files | map(.path) | index("README.md")) != null and
  (.[0].files | map(.path) | index("dist/cli/index.js")) != null and
  (.[0].files | map(.path) | index("dist/core/audit.js")) != null and
  (.[0].files | map(.path) | index("dist/core/static-audit.js")) != null and
  (.[0].files | map(.path) | index("dist/core/site-audit.js")) != null and
  (.[0].files | map(.path) | index("dist/core/site-metrics.js")) != null and
  (.[0].files | map(.path) | index("dist/core/visual-report.js")) != null and
  (.[0].files | map(.path) | index("dist/core/readiness-comparison.js")) != null and
  (.[0].files | map(.path) | index("dist/core/seo-experiments.js")) != null and
  (.[0].files | map(.path) | index("docs/release-v0.9.md")) != null and
  (.[0].files | map(.path) | index("docs/release-v0.10.md")) != null and
  (.[0].files | map(.path) | index("docs/seo-experiment-ledger.md")) != null and
  (.[0].files | map(.path) | index("skills/seo-experiment-ledger/SKILL.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.zh-TW.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.zh-CN.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.ja.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.ko.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.es.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.fr.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.de.md")) != null and
  (.[0].files | map(.path) | index("docs/readme/README.pt-BR.md")) != null and
  (.[0].files | map(.path) | index("docs/assets/report-demo.html")) != null and
  (.[0].files | map(.path) | index("docs/assets/report-demo-after.html")) != null and
  (.[0].files | map(.path) | index("docs/release-v0.8.md")) != null and
  (.[0].files | map(.path) | index("fixtures/v0.6/rule-corpus.ts")) != null and
  (.[0].files | map(.path) | index("examples/github-action-sample/.github/workflows/geoptimize.yml")) != null and
  (.[0].files | map(.path) | index("scripts/verify-release-candidate.sh")) != null and
  (.[0].files | map(.path) | index("scripts/verify-release-v0.8.sh")) != null
' "$PACK_JSON" >/dev/null

if ! tar -xOf "$PACKAGE_TARBALL" package/README.md > "$VERIFY_ROOT/README.md" || \
   [ ! -s "$VERIFY_ROOT/README.md" ]; then
  echo "package README.md is missing or empty" >&2
  exit 1
fi

npm_config_dry_run=false npm --cache "$VERIFY_ROOT/npm-cache" install \
  --ignore-scripts --no-audit --no-fund \
  --prefix "$CONSUMER_ROOT" "$PACKAGE_TARBALL" >/dev/null

for binary in geoptimize geo geo-cli; do
  BINARY_VERSION=$("$CONSUMER_ROOT/node_modules/.bin/$binary" --version)
  if [ "$BINARY_VERSION" != "$PACKAGE_VERSION" ]; then
    echo "$binary returned $BINARY_VERSION; expected $PACKAGE_VERSION" >&2
    exit 1
  fi
done

for audit_command in audit audit-build audit-site metrics report; do
  "$CONSUMER_ROOT/node_modules/.bin/geoptimize" "$audit_command" --help >/dev/null
done

SEO_ROOT="$VERIFY_ROOT/seo-ledger"
GEO_BINARY="$CONSUMER_ROOT/node_modules/.bin/geo"
SEO_KEYWORD="release acceptance keyword"
mkdir -p "$SEO_ROOT"
"$GEO_BINARY" seo init "$SEO_ROOT" >/dev/null
"$GEO_BINARY" seo add "$SEO_ROOT" \
  --keyword "$SEO_KEYWORD" --page /services/ems/ --priority high >/dev/null
"$GEO_BINARY" seo record "$SEO_ROOT" \
  --keyword "$SEO_KEYWORD" --page /services/ems/ --source gsc \
  --start-date 2025-12-01 --end-date 2025-12-28 \
  --country TWN --device DESKTOP --position 9 --clicks 1 --impressions 20 \
  --observed-at 2025-12-29T00:00:00Z >/dev/null
"$GEO_BINARY" seo select "$SEO_ROOT" --json > "$VERIFY_ROOT/seo-candidate.json"
jq -e --arg keyword "$SEO_KEYWORD" '.query.keyword == $keyword' \
  "$VERIFY_ROOT/seo-candidate.json" >/dev/null
"$GEO_BINARY" seo start "$SEO_ROOT" \
  --keyword "$SEO_KEYWORD" --date 2026-01-01 \
  --intent "Compare an EMS integration scope" \
  --gap "The page lacks visible inputs and outputs" \
  --change "Added visible inputs and outputs" >/dev/null
"$GEO_BINARY" seo record "$SEO_ROOT" \
  --keyword "$SEO_KEYWORD" --page /services/ems/ --source gsc \
  --start-date 2026-01-02 --end-date 2026-01-08 \
  --country TWN --device DESKTOP --position 6 --clicks 2 --impressions 28 \
  --observed-at 2026-01-09T00:00:00Z > "$VERIFY_ROOT/seo-observation.json"
SEO_OBSERVATION_ID=$(jq -er '.id' "$VERIFY_ROOT/seo-observation.json")
"$GEO_BINARY" seo review "$SEO_ROOT" \
  --keyword "$SEO_KEYWORD" --outcome improved \
  --observation "$SEO_OBSERVATION_ID" --date 2026-01-08 \
  --note "Comparable release acceptance observation" >/dev/null
"$GEO_BINARY" seo status "$SEO_ROOT" --json > "$VERIFY_ROOT/seo-status.json"
jq -e --arg keyword "$SEO_KEYWORD" '
  .counts == {eligible: 1, monitoring: 0, completed: 0, observations: 2} and
  .candidate.query.keyword == $keyword
' "$VERIFY_ROOT/seo-status.json" >/dev/null

"$CONSUMER_ROOT/node_modules/.bin/geoptimize" audit \
  "$CONSUMER_ROOT/node_modules/geoptimize/examples/github-action-sample/site/index.html" \
  --json > "$VERIFY_ROOT/page-audit.json"
"$CONSUMER_ROOT/node_modules/.bin/geoptimize" audit-build \
  "$CONSUMER_ROOT/node_modules/geoptimize/examples/github-action-sample/site" \
  --json > "$VERIFY_ROOT/build-audit.json"
jq -e '.contractVersion == "1.0" and (.checks | length > 0)' "$VERIFY_ROOT/page-audit.json" >/dev/null
jq -e '.contractVersion == "1.0" and .source == "local-html" and (.pages | length == 1)' "$VERIFY_ROOT/build-audit.json" >/dev/null

"$CONSUMER_ROOT/node_modules/.bin/geo" scan \
  "$CONSUMER_ROOT/node_modules/geoptimize/examples/github-action-sample/site" \
  --dir --details --json > "$VERIFY_ROOT/readiness.json"
"$CONSUMER_ROOT/node_modules/.bin/geo" report "$VERIFY_ROOT/readiness.json" \
  --baseline "$VERIFY_ROOT/readiness.json" --output "$VERIFY_ROOT/report.html"
node - "$VERIFY_ROOT/readiness.json" "$VERIFY_ROOT/report.html" <<'NODE'
const fs = require('node:fs');
const report = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const html = fs.readFileSync(process.argv[3], 'utf8');
if (!report.scoringVersion || report.pages[0].ruleResults.length !== 17) throw new Error('Missing detailed rule evidence');
if ((html.match(/<meter /g) || []).length !== 5 || !html.includes('data-panel="sources"')) throw new Error('Visual report contract failed');
NODE

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

if [ -n "${RELEASE_TARBALL_OUT:-}" ]; then
  cp "$PACKAGE_TARBALL" "$RELEASE_TARBALL_OUT"
fi

printf '%s\n' "$MANIFEST"
echo "Release candidate checks passed."
