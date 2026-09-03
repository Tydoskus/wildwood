#!/bin/zsh
set -e

project_dir="${0:A:h:h}"
cd "$project_dir"

if ! command -v node >/dev/null 2>&1; then
  export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
fi

if ! node scripts/unity-sprite-exporter.mjs; then
  echo "Could not open the exporter. Read the message above."
  read "?Press Return to close."
  exit 1
fi
