#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
RUNNER="$REPO_ROOT/action/run.sh"
FIXTURE="$REPO_ROOT/.github/fixtures/action-low"
SAMPLE_FIXTURE="$REPO_ROOT/examples/github-action-sample/site"
CLI="$REPO_ROOT/dist/cli/index.js"
TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/geoptimize-action-contract.XXXXXX")
trap 'rm -rf "$TEST_ROOT"' EXIT

run_case() {
  local name=$1
  local fail_on_low_score=$2
  local min_score=$3
  local expected_status=$4
  local input_path=${5:-$FIXTURE}
  local output_file="$TEST_ROOT/$name.output"
  local status=0

  INPUT_PATH="$input_path" \
  MIN_SCORE="$min_score" \
  FAIL_ON_LOW_SCORE="$fail_on_low_score" \
  GITHUB_OUTPUT="$output_file" \
  GEOPTIMIZE_CLI_PATH="$CLI" \
    bash "$RUNNER" > "$TEST_ROOT/$name.log" 2>&1 || status=$?

  if [ "$status" -ne "$expected_status" ]; then
    echo "contract case $name: expected status $expected_status, got $status"
    cat "$TEST_ROOT/$name.log"
    exit 1
  fi
}

run_case advisory false 100 0
run_case blocking-fails true 100 1
run_case blocking-passes true 0 0
run_case invalid-threshold false invalid 2
run_case invalid-threshold-high false 101 2
run_case invalid-choice sometimes 60 2
run_case sample-advisory false 100 0 "$SAMPLE_FIXTURE"

grep -Eq '^score=[0-9]+$' "$TEST_ROOT/advisory.output"
grep -q '^report<<GEOPTIMIZE_REPORT$' "$TEST_ROOT/advisory.output"
grep -Eq '^score=[0-9]+$' "$TEST_ROOT/blocking-passes.output"
grep -q '^report<<GEOPTIMIZE_REPORT$' "$TEST_ROOT/blocking-passes.output"
grep -Eq '^score=[0-9]+$' "$TEST_ROOT/sample-advisory.output"
grep -q '^report<<GEOPTIMIZE_REPORT$' "$TEST_ROOT/sample-advisory.output"
grep -q 'geoptimize advisory mode' "$TEST_ROOT/advisory.log"
grep -q 'geoptimize blocking mode' "$TEST_ROOT/blocking-fails.log"

echo "Action contract checks passed."
