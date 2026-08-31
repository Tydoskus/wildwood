#!/bin/zsh

set -u

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"

PROJECT_DIR="${0:A:h:h}"
SPACETIME_BIN="$(command -v spacetime 2>/dev/null || true)"

clear
print "WILDSTAT LOCAL DATABASE"
print "Keep this window open while testing. Press Control-C to stop."
print ""

if [[ -z "$SPACETIME_BIN" ]]; then
  print "FAILED: SpacetimeDB CLI not found."
  read -r "reply?Press Return to close."
  exit 1
fi

cd "$PROJECT_DIR" || exit 1
"$SPACETIME_BIN" start
result=$?

print ""
if (( result == 0 )); then
  print "Database stopped."
else
  print "Database stopped or failed (exit $result)."
fi
read -r "reply?Press Return to close."
exit "$result"
