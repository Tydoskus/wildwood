#!/bin/zsh

set -u
set -o pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"

PROJECT_DIR="${0:A:h:h}"

fail() {
  print ""
  print "SERVER PUBLISH STOPPED: $1"
  print ""
  read -r "reply?Press Return to close."
  exit 1
}

NPM_BIN="$(command -v npm 2>/dev/null || /bin/zsh -lic 'command -v npm' 2>/dev/null || true)"
[[ -n "$NPM_BIN" ]] || fail "npm not found. Install Node.js, then reopen this file."
export PATH="${NPM_BIN:h}:${PATH}"
NODE_BIN="$(command -v node 2>/dev/null || true)"
[[ -n "$NODE_BIN" ]] || fail "node not found. Install Node.js, then reopen this file."
SPACETIME_BIN="$(command -v spacetime 2>/dev/null || true)"
[[ -n "$SPACETIME_BIN" ]] || fail "spacetime CLI not found. Install it and log in, then reopen this file."

[[ -f "$PROJECT_DIR/package.json" ]] || fail "Could not find WildStat package.json above the launchers folder."
[[ -f "$PROJECT_DIR/scripts/publish-server-live.mjs" ]] || fail "Could not find the server publish helper."

cd "$PROJECT_DIR" || fail "Could not open the WildStat folder."
clear
print "WILDSTAT SERVER PUBLISH"
print "Folder: $PROJECT_DIR"
print ""
print "This builds the server module, checks compatibility, then publishes"
print "the one database without clearing data or allowing manual migrations."
print ""

if [[ "${1:-}" == "--check" ]]; then
  "$NODE_BIN" --check scripts/publish-server-live.mjs || fail "Server publish helper syntax check failed."
  print "Launcher check passed."
  exit 0
fi

PUBLISH_ARGS=()
if [[ "${1:-}" == "--preflight" ]]; then
  PUBLISH_ARGS+=(--preflight)
  print "Preflight-only mode: no server will be published."
  print ""
fi

if [[ ! -d node_modules ]]; then
  print "Dependencies missing: installing with npm ci"
  "$NPM_BIN" ci || fail "npm ci failed."
  print ""
fi

print "Checking server TypeScript..."
"$NPM_BIN" run typecheck:coop || fail "Server typecheck failed."
print "Building server..."
"$NPM_BIN" run spacetime:build || fail "Server build failed."
print ""

export WILDSTAT_SPACETIME_BIN="$SPACETIME_BIN"
"$NODE_BIN" scripts/publish-server-live.mjs "${PUBLISH_ARGS[@]}"
publish_status=$?

print ""
if [[ $publish_status -eq 0 ]]; then
  print "SERVER PUBLISH COMPLETE"
else
  print "SERVER PUBLISH STOPPED. No later publish step was attempted."
fi
print ""
read -r "reply?Press Return to close."
exit $publish_status
