#!/usr/bin/env bash
set -euo pipefail

case "$MIN_SCORE" in
  ''|*[!0-9]*)
    echo "::error::min-score must be an integer from 0 to 100"
    exit 2
    ;;
esac

if [ "$MIN_SCORE" -lt 0 ] || [ "$MIN_SCORE" -gt 100 ]; then
  echo "::error::min-score must be an integer from 0 to 100"
  exit 2
fi

case "$FAIL_ON_LOW_SCORE" in
  true|false) ;;
  *)
    echo "::error::fail-on-low-score must be true or false"
    exit 2
    ;;
esac

run_geoptimize() {
  if [ -n "${GEOPTIMIZE_CLI_PATH:-}" ]; then
    node "$GEOPTIMIZE_CLI_PATH" "$@"
  else
    geoptimize "$@"
  fi
}

REPORT=$(run_geoptimize scan "$INPUT_PATH" --dir --json 2>/dev/null)
SCORE=$(printf '%s' "$REPORT" | node -e "const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(0,'utf8'));const s=r?.overall?.total;if(!Number.isInteger(s)||s<0||s>100)process.exit(2);console.log(s)")

echo "score=$SCORE" >> "$GITHUB_OUTPUT"
{
  echo 'report<<GEOPTIMIZE_REPORT'
  echo "$REPORT"
  echo 'GEOPTIMIZE_REPORT'
} >> "$GITHUB_OUTPUT"

if [ "$FAIL_ON_LOW_SCORE" = 'true' ]; then
  echo "::notice::geoptimize blocking mode: score $SCORE/100 (project threshold: $MIN_SCORE)"
  if [ "$SCORE" -lt "$MIN_SCORE" ]; then
    echo "::error::Readiness score $SCORE is below the project threshold $MIN_SCORE"
    exit 1
  fi
else
  echo "::notice::geoptimize advisory mode: score $SCORE/100 (no blocking threshold applied)"
fi
