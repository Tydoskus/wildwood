#!/bin/bash
set -euo pipefail
MOBILE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
case "${1:-}" in ios|android) ;; *) echo "Usage: $0 ios|android"; exit 1 ;; esac

# Use a suitable existing Node without changing the user's global installation.
NODE_CANDIDATE="${WILDSTAT_NODE_PATH:-$(command -v node || true)}"
if [[ -z "$NODE_CANDIDATE" ]] || ! "$NODE_CANDIDATE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  NODE_CANDIDATE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi
if [[ ! -x "$NODE_CANDIDATE" ]] || ! "$NODE_CANDIDATE" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 ? 0 : 1)'; then
  echo "Install Node 22 or newer, or set WILDSTAT_NODE_PATH to its executable."
  exit 1
fi
export PATH="$(dirname "$NODE_CANDIDATE"):$PATH"
cd "$MOBILE_DIR"
if [[ ! -d ../node_modules ]]; then npm --prefix .. ci; fi
if [[ ! -d node_modules ]]; then npm ci; fi
npm run "$1"
