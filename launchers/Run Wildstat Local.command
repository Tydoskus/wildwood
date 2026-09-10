#!/bin/zsh

set -u
set -o pipefail
unsetopt BG_NICE

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"

PROJECT_DIR="${0:A:h:h}"
LOCAL_URL="http://127.0.0.1:8000/"
# Keep this aligned with the local guest save used for testing.
DATABASE_NAME="wildwood-balance-local"

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
[[ -f "$PROJECT_DIR/package.json" ]] || fail "Could not find WildStat package.json above the launchers folder."

cd "$PROJECT_DIR" || fail "Could not open the WildStat folder."
clear
print "WILDSTAT LOCAL TEST"
print "Folder: $PROJECT_DIR"
print ""

if [[ "${1:-}" == "--check" ]]; then
  print "Launcher check passed."
  print "Database: $DATABASE_NAME (local)"
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
"$SPACETIME_BIN" publish "$DATABASE_NAME" --module-path spacetimedb --server local --delete-data=never --yes=break-clients \
  || fail "Local SpacetimeDB publish failed."

print "Client bindings: regenerating"
"$SPACETIME_BIN" generate --lang typescript --out-dir src/module_bindings --module-path spacetimedb \
  || fail "SpacetimeDB binding generation failed."

print "Browser client: building with local-only 3x movement and respawns"
VITE_LOCAL_TESTING=1 "$NPM_BIN" run build:client || fail "Browser build failed."

# The browser storage keys include the database name. Write the same target
# after the build, which recreates dist and removes previous local overrides.
"$PYTHON_BIN" - "$DATABASE_NAME" <<'PYCONFIG'
import json
import sys
from pathlib import Path

folder = Path("dist")
(folder / "local-config.js").write_text(
    "window.WILDWOOD_SPACETIMEDB_DB_NAME = " + json.dumps(sys.argv[1]) + ";\n"
)
page = folder / "index.html"
html = page.read_text()
if "</head>" not in html:
    raise RuntimeError("Built client has no head element")
page.write_text(html.replace("</head>", '<script src="local-config.js"></script></head>', 1))
PYCONFIG
[[ $? == 0 ]] || fail "Could not configure the browser's local database."

if /usr/bin/curl --silent --show-error --fail --max-time 2 "$LOCAL_URL" 2>/dev/null \
  | /usr/bin/grep -q '<title>WildStat</title>'; then
  print "Web server: already running"
  /usr/bin/open "$LOCAL_URL"
  print "Browser: opened $LOCAL_URL"
  exit 0
fi

open_when_ready() {
  for attempt in {1..40}; do
    if /usr/bin/curl --silent --show-error --fail --max-time 1 "$LOCAL_URL" 2>/dev/null \
      | /usr/bin/grep -q '<title>WildStat</title>'; then
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
