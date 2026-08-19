#!/bin/zsh

set -u
set -o pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:${HOME}/.local/bin:${PATH}"

PROJECT_DIR="${0:A:h}"

fail() {
  print ""
  print "RELEASE STOPPED: $1"
  print ""
  read -r "reply?Press Return to close."
  exit 1
}

NPM_BIN="$(command -v npm 2>/dev/null || /bin/zsh -lic 'command -v npm' 2>/dev/null || true)"
[[ -n "$NPM_BIN" ]] || fail "npm not found. Install Node.js, then reopen this file."
export PATH="${NPM_BIN:h}:${PATH}"
GIT_BIN="$(command -v git 2>/dev/null || true)"
[[ -n "$GIT_BIN" ]] || fail "git not found. Install Xcode Command Line Tools, then reopen this file."

[[ -f "$PROJECT_DIR/package.json" ]] || fail "Could not find Wildwood package.json beside this file."
[[ -f "$PROJECT_DIR/scripts/release-live.mjs" ]] || fail "Could not find scripts/release-live.mjs."

cd "$PROJECT_DIR" || fail "Could not open the Wildwood folder."
clear
print "WILDWOOD LIVE RELEASE"
print "Folder: $PROJECT_DIR"
print ""
print "This will ask for next version and release notes, run all checks,"
print "commit included changes, push main, and wait for live deployment."
print "Untracked files stay excluded unless already staged."
print ""

if [[ "${1:-}" == "--check" ]]; then
  "$NPM_BIN" run release:live -- --help >/dev/null || fail "Release helper check failed."
  print "Launcher check passed."
  exit 0
fi

if [[ ! -d node_modules ]]; then
  print "Dependencies missing: installing with npm ci"
  "$NPM_BIN" ci || fail "npm ci failed."
  print ""
fi

# First run only: keep launcher and its helper together in the release commit.
for bootstrap_file in \
  "Release Wildwood.command" \
  "scripts/release-live.mjs" \
  "scripts/release-live.test.mjs"; do
  if ! "$GIT_BIN" ls-files --error-unmatch -- "$bootstrap_file" >/dev/null 2>&1; then
    "$GIT_BIN" add -- "$bootstrap_file" || fail "Could not stage $bootstrap_file."
  fi
done

"$NPM_BIN" run release:live
release_status=$?

print ""
if [[ $release_status -eq 0 ]]; then
  print "RELEASE COMMAND COMPLETE"
else
  print "RELEASE STOPPED. Read error above; local changes remain available."
fi
print ""
read -r "reply?Press Return to close."
exit $release_status
