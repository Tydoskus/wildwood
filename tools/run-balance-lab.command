#!/bin/zsh

# Double-click this file in Finder to start the local Balance Lab.
set -e

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_dir"

if [[ ! -d node_modules ]]; then
  echo "Dependencies are missing. Run 'npm install' in the project first."
  read -r "?Press Return to close..."
  exit 1
fi

npm run balance:lab
