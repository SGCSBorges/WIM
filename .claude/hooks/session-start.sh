#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo '{"async": true, "asyncTimeout": 300000}'

git config user.name "Sergio Borges"
git config user.email "sergio_borges82@hotmail.com"

cd "${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel)}"
npm install --workspaces --include=optional
