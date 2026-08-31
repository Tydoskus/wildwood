#!/bin/zsh
set -e

project_dir="${0:A:h}"
port="4173"
url="http://127.0.0.1:${port}/public/enemy-sprite-aligner.html"
log_file="/tmp/wildstat-enemy-sprite-aligner.log"

cd "$project_dir"

if /usr/bin/curl -fsS "$url" >/dev/null 2>&1; then
  /usr/bin/open "$url"
  echo "Enemy Sprite Aligner opened in your browser."
  exit 0
fi

/usr/bin/python3 -m http.server "$port" --directory "$project_dir" >"$log_file" 2>&1 &
server_pid=$!

cleanup() {
  kill "$server_pid" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

for attempt in {1..20}; do
  if /usr/bin/curl -fsS "$url" >/dev/null 2>&1; then
    /usr/bin/open "$url"
    echo "Enemy Sprite Aligner opened."
    echo "Keep this window open while aligning. Close it when finished."
    wait "$server_pid"
    exit 0
  fi
  sleep 0.1
done

echo "Could not start the aligner. Details: $log_file"
exit 1
