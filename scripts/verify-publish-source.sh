#!/usr/bin/env bash
set -u

if ! command -v git >/dev/null 2>&1; then
  echo "missing required command: git" >&2
  exit 2
fi

if ! head_commit=$(git rev-parse --verify HEAD 2>/dev/null); then
  echo "publish source gate: HEAD is unavailable" >&2
  exit 1
fi

if ! main_commit=$(git rev-parse --verify refs/remotes/origin/maintenance/geoptimize-0.8 2>/dev/null); then
  echo "publish source gate: origin/maintenance/geoptimize-0.8 is unavailable; run git fetch origin maintenance/geoptimize-0.8" >&2
  exit 1
fi

if [ "$head_commit" != "$main_commit" ]; then
  echo "publish source gate: HEAD is $head_commit; expected origin/maintenance/geoptimize-0.8 $main_commit" >&2
  echo "fetch origin/maintenance/geoptimize-0.8 and publish from its exact commit" >&2
  exit 1
fi

echo "Publish source gate passed: HEAD matches origin/maintenance/geoptimize-0.8 at $head_commit."
