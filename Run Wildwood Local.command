#!/bin/zsh

set -u
set -o pipefail
unsetopt BG_NICE

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"

PROJECT_DIR="${0:A:h}"
LOCAL_URL="http://127.0.0.1:8000/"
DATABASE_NAME="wildwood-coop"

fail() {
  print ""
  print "FAILED: $1"
  print ""
  read -r "reply?Press Return to close."
  exit 1
}

SPACETIME_BIN="$(command -v spacetime 2>/dev/null || true)"
NPM_BIN="$(command -v npm 2>/dev/null || true)"
PYTHON_BIN="$(command -v python3 2>/dev/null || true)"

[[ -n "$SPACETIME_BIN" ]] || fail "SpacetimeDB CLI not found. Install it, then reopen this file."
[[ -n "$NPM_BIN" ]] || fail "npm not found. Install Node.js, then reopen this file."
[[ -n "$PYTHON_BIN" ]] || fail "python3 not found. It is required by the local web server."
[[ -f "$PROJECT_DIR/package.json" ]] || fail "Could not find Wildwood package.json beside this file."

cd "$PROJECT_DIR" || fail "Could not open the Wildwood folder."
clear
print "WILDWOOD LOCAL TEST"
print "Folder: $PROJECT_DIR"
print ""

if [[ "${1:-}" == "--check" ]]; then
  print "Launcher check passed."
  print "SpacetimeDB: $SPACETIME_BIN"
  print "npm: $NPM_BIN"
  print "python3: $PYTHON_BIN"
  exit 0
fi

if "$SPACETIME_BIN" server ping local >/dev/null 2>&1; then
  print "Database: already running"
else
  print "Database: opening second Terminal window"
  /usr/bin/open -a Terminal "$PROJECT_DIR/scripts/run-local-database.command" \
    || fail "Could not open the database Terminal window."

  database_ready=false
  for attempt in {1..120}; do
    if "$SPACETIME_BIN" server ping local >/dev/null 2>&1; then
      database_ready=true
      break
    fi
    sleep 0.5
  done
  [[ "$database_ready" == true ]] || fail "Local database did not start within 60 seconds. Check its Terminal window."
  print "Database: ready"
fi

if [[ ! -d node_modules ]]; then
  print "Dependencies: installing"
  "$NPM_BIN" ci || fail "npm ci failed."
fi

print "Server module: publishing to local database"
"$SPACETIME_BIN" publish "$DATABASE_NAME" --module-path spacetimedb --server local \
  || fail "Local SpacetimeDB publish failed."

print "Client bindings: regenerating"
"$SPACETIME_BIN" generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb \
  || fail "SpacetimeDB binding generation failed."

print "Browser client: building"
"$NPM_BIN" run build:client || fail "Browser build failed."

if /usr/bin/curl --silent --show-error --fail --max-time 2 "$LOCAL_URL" 2>/dev/null \
  | /usr/bin/grep -q '<title>Wildwood</title>'; then
  print "Web server: already running"
  /usr/bin/open "$LOCAL_URL"
  print "Browser: opened $LOCAL_URL"
  exit 0
fi

open_when_ready() {
  for attempt in {1..40}; do
    if /usr/bin/curl --silent --show-error --fail --max-time 1 "$LOCAL_URL" 2>/dev/null \
      | /usr/bin/grep -q '<title>Wildwood</title>'; then
      /usr/bin/open "$LOCAL_URL"
      return
    fi
    sleep 0.25
  done
  print "Browser did not open automatically. Open $LOCAL_URL manually."
}

print ""
print "Web server: starting"
print "Browser: opens automatically"
print "Stop test: press Control-C here and in the database window."
print ""
open_when_ready &
exec "$NPM_BIN" run serve:dist
