#!/usr/bin/env bash
set -u

PACKAGE_NAME=geoptimize
REPOSITORY=cucuwang/geoptimize
EXPECTED_COMMIT=${1:-}
EXPECTED_PACKAGE_SHA256=${2:-}
EXPECTED_REPOSITORY_URL=git+https://github.com/cucuwang/geoptimize.git
EXPECTED_HOMEPAGE=https://github.com/cucuwang/geoptimize
EXPECTED_BUGS_URL=https://github.com/cucuwang/geoptimize/issues
SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
PACKAGE_JSON="$SCRIPT_DIR/../package.json"

if ! command -v node >/dev/null 2>&1; then
  echo "missing required command: node" >&2
  exit 2
fi

EXPECTED_VERSION=$(node -e "const fs=require('node:fs');const packageJson=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(packageJson.version)" "$PACKAGE_JSON")
EXPECTED_TAG="v$EXPECTED_VERSION"

if [ -z "$EXPECTED_COMMIT" ] || [ -z "$EXPECTED_PACKAGE_SHA256" ]; then
  echo "usage: $0 <expected-release-commit> <expected-package-sha256>" >&2
  exit 2
fi

if ! [[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]]; then
  echo "expected-release-commit must be a lowercase 40-character Git SHA" >&2
  exit 2
fi

if ! [[ "$EXPECTED_PACKAGE_SHA256" =~ ^[0-9a-f]{64}$ ]]; then
  echo "expected-package-sha256 must be a lowercase 64-character SHA-256" >&2
  exit 2
fi

for command_name in awk curl jq npm git mktemp tar; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "missing required command: $command_name" >&2
    exit 2
  fi
done

VERIFY_BASE=${TMPDIR:-/tmp}
VERIFY_BASE=${VERIFY_BASE%/}
if ! VERIFY_BASE=$(cd -- "$VERIFY_BASE" 2>/dev/null && pwd -P); then
  echo "temporary directory is unavailable: ${TMPDIR:-/tmp}" >&2
  exit 2
fi
VERIFY_ROOT=$(mktemp -d "$VERIFY_BASE/geoptimize-release-verify.XXXXXX")
REGISTRY_JSON="$VERIFY_ROOT/registry.json"
RELEASE_JSON="$VERIFY_ROOT/release.json"
PACKAGE_TARBALL="$VERIFY_ROOT/$PACKAGE_NAME-$EXPECTED_VERSION.tgz"
CONSUMER_ROOT="$VERIFY_ROOT/consumer"
SOURCE_LOCK="$SCRIPT_DIR/../package-lock.json"
FAILURES=0

cleanup() {
  if [ "${KEEP_VERIFY_ROOT:-0}" = "1" ]; then
    echo "Verification workspace preserved: $VERIFY_ROOT"
    return
  fi

  case "$VERIFY_ROOT" in
    "$VERIFY_BASE"/geoptimize-release-verify.*)
      rm -rf -- "$VERIFY_ROOT"
      ;;
    *)
      echo "Refusing to remove unexpected verification path: $VERIFY_ROOT" >&2
      ;;
  esac
}

trap cleanup EXIT

pass() {
  echo "PASS: $1"
}

note() {
  echo "INFO: $1"
}

fail() {
  echo "FAIL: $1" >&2
  FAILURES=$((FAILURES + 1))
}

if curl -fsS "https://registry.npmjs.org/$PACKAGE_NAME" > "$REGISTRY_JSON"; then
  latest=$(jq -r '."dist-tags".latest // empty' "$REGISTRY_JSON")
  if [ "$latest" = "$EXPECTED_VERSION" ]; then
    pass "npm latest is $EXPECTED_VERSION"
  else
    fail "npm latest is ${latest:-missing}; expected $EXPECTED_VERSION"
  fi

  if jq -e --arg version "$EXPECTED_VERSION" '.versions[$version] != null' "$REGISTRY_JSON" >/dev/null; then
    pass "npm contains exact version $EXPECTED_VERSION"

    published_git_head=$(jq -r --arg version "$EXPECTED_VERSION" '.versions[$version].gitHead // empty' "$REGISTRY_JSON")
    if [ -z "$published_git_head" ]; then
      note "npm does not expose gitHead; tarball SHA-256 remains the artifact identity gate"
    elif [ "$published_git_head" = "$EXPECTED_COMMIT" ]; then
      pass "npm gitHead matches $EXPECTED_COMMIT"
    else
      fail "npm gitHead is $published_git_head; expected $EXPECTED_COMMIT"
    fi

    published_repository=$(jq -r --arg version "$EXPECTED_VERSION" '(.versions[$version].repository | if type == "object" then .url else . end) // empty' "$REGISTRY_JSON")
    published_homepage=$(jq -r --arg version "$EXPECTED_VERSION" '.versions[$version].homepage // empty' "$REGISTRY_JSON")
    published_bugs=$(jq -r --arg version "$EXPECTED_VERSION" '.versions[$version].bugs.url // empty' "$REGISTRY_JSON")

    if [ "$published_repository" = "$EXPECTED_REPOSITORY_URL" ] && \
       [ "$published_homepage" = "$EXPECTED_HOMEPAGE" ] && \
       [ "$published_bugs" = "$EXPECTED_BUGS_URL" ]; then
      pass "npm repository identity matches $REPOSITORY"
    else
      fail "npm repository identity does not match $REPOSITORY"
    fi

    tarball_verified=false
    tarball_url=$(jq -r --arg version "$EXPECTED_VERSION" '.versions[$version].dist.tarball // empty' "$REGISTRY_JSON")
    if [ -n "$tarball_url" ] && curl -fLsS "$tarball_url" -o "$PACKAGE_TARBALL"; then
      if package_sha256=$(node -e "const crypto=require('node:crypto');const fs=require('node:fs');const path=process.argv[1];console.log(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'))" "$PACKAGE_TARBALL"); then
        if [ "$package_sha256" = "$EXPECTED_PACKAGE_SHA256" ]; then
          pass "npm tarball SHA-256 matches the verified candidate"
          tarball_verified=true
        else
          fail "npm tarball SHA-256 is ${package_sha256:-missing}; expected $EXPECTED_PACKAGE_SHA256"
        fi
      else
        fail "npm tarball SHA-256 could not be computed"
      fi
    elif [ -n "$tarball_url" ]; then
      fail "npm tarball could not be downloaded for SHA-256 verification"
    else
      fail "npm metadata did not expose a tarball URL for $EXPECTED_VERSION"
    fi

    if [ "$tarball_verified" = true ]; then
      if [ ! -f "$SOURCE_LOCK" ]; then
        fail "canonical source package-lock.json is required for the clean consumer"
      elif node "$SCRIPT_DIR/prepare-release-consumer.mjs" \
        "$PACKAGE_TARBALL" "$CONSUMER_ROOT" "$SOURCE_LOCK" "$EXPECTED_PACKAGE_SHA256"; then
        if npm --cache "$VERIFY_ROOT/npm-cache" ci \
          --ignore-scripts --no-audit --no-fund \
          --prefix "$CONSUMER_ROOT"; then
          for binary in geoptimize geo geo-cli; do
            binary_version=$("$CONSUMER_ROOT/node_modules/.bin/$binary" --version 2>/dev/null || true)
            if [ "$binary_version" = "$EXPECTED_VERSION" ]; then
              pass "$binary resolves to $EXPECTED_VERSION from the public package"
            else
              fail "$binary returned ${binary_version:-no version}; expected $EXPECTED_VERSION"
            fi
          done
        else
          fail "clean consumer installation failed for the verified package tarball"
        fi
      else
        fail "clean consumer metadata could not be prepared from the verified package tarball"
      fi
    fi
  else
    fail "npm does not contain exact version $EXPECTED_VERSION"
  fi
else
  fail "npm registry metadata could not be fetched"
fi

tag_lines=$(git ls-remote --tags "https://github.com/$REPOSITORY.git" \
  "refs/tags/$EXPECTED_TAG" "refs/tags/$EXPECTED_TAG^{}" 2>/dev/null || true)
tag_commit=$(printf '%s\n' "$tag_lines" | awk -v peeled="refs/tags/$EXPECTED_TAG^{}" '$2 == peeled { print $1 }')
if [ -z "$tag_commit" ]; then
  tag_commit=$(printf '%s\n' "$tag_lines" | awk -v direct="refs/tags/$EXPECTED_TAG" '$2 == direct { print $1 }')
fi

if [ "$tag_commit" = "$EXPECTED_COMMIT" ]; then
  pass "$EXPECTED_TAG points to $EXPECTED_COMMIT"
else
  fail "$EXPECTED_TAG points to ${tag_commit:-missing}; expected $EXPECTED_COMMIT"
fi

release_status=$(curl -sS -o "$RELEASE_JSON" -w '%{http_code}' \
  "https://api.github.com/repos/$REPOSITORY/releases/tags/$EXPECTED_TAG" || true)
if [ "$release_status" = "200" ]; then
  release_state=$(jq -r '[.tag_name, (.draft | tostring), (.prerelease | tostring)] | @tsv' "$RELEASE_JSON")
  if [ "$release_state" = "$EXPECTED_TAG"$'\tfalse\tfalse' ]; then
    pass "GitHub Release is published for $EXPECTED_TAG"
  else
    fail "GitHub Release is not a published non-prerelease for $EXPECTED_TAG"
  fi
else
  fail "GitHub Release lookup returned HTTP ${release_status:-error}"
fi

if [ "$FAILURES" -ne 0 ]; then
  echo "$FAILURES release verification check(s) failed." >&2
  exit 1
fi

echo "All public release checks passed."
