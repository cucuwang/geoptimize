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

if ! main_commit=$(git rev-parse --verify refs/remotes/origin/maintenance/aeoptimize-0.7 2>/dev/null); then
  echo "publish source gate: origin/maintenance/aeoptimize-0.7 is unavailable; run git fetch origin maintenance/aeoptimize-0.7" >&2
  exit 1
fi

if [ "$head_commit" != "$main_commit" ]; then
  echo "publish source gate: HEAD is $head_commit; expected origin/maintenance/aeoptimize-0.7 $main_commit" >&2
  echo "fetch origin/maintenance/aeoptimize-0.7 and publish from its exact commit" >&2
  exit 1
fi

echo "Publish source gate passed: HEAD matches origin/maintenance/aeoptimize-0.7 at $head_commit."
