#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel)

find_repo_firefox() {
  find "$repo_root/.firefox-for-testing" -type f \
    \( -path '*/Firefox*.app/Contents/MacOS/firefox' \
    -o -path '*/firefox/firefox' \
    -o -path '*/firefox/firefox.exe' \) \
    -print 2>/dev/null | sort -r | head -n 1
}

find_puppeteer_firefox() {
  for cache_root in \
    "${PUPPETEER_CACHE_DIR:-}" \
    "${HOME}/.cache/puppeteer" \
    "${HOME}"; do
    if [ -n "$cache_root" ] && [ -d "$cache_root/firefox" ]; then
      find "$cache_root/firefox" -type f \
        \( -path '*/Firefox.app/Contents/MacOS/firefox' \
        -o -path '*/Firefox Developer Edition.app/Contents/MacOS/firefox' \
        -o -path '*/Firefox Nightly.app/Contents/MacOS/firefox' \
        -o -path '*/firefox/firefox' \
        -o -path '*/firefox/firefox.exe' \) \
        -print 2>/dev/null
    fi
  done | sort -r | head -n 1
}

firefox_executable=${SEALGATE_FIREFOX_PATH:-}

if [ -z "$firefox_executable" ]; then
  firefox_executable=$(find_puppeteer_firefox)
fi

if [ -z "$firefox_executable" ]; then
  firefox_executable=$(find_repo_firefox)
fi

for system_firefox in \
  '/Applications/Firefox Developer Edition.app/Contents/MacOS/firefox' \
  '/Applications/Firefox.app/Contents/MacOS/firefox' \
  '/Applications/Firefox Nightly.app/Contents/MacOS/firefox'; do
  if [ -z "$firefox_executable" ] && [ -x "$system_firefox" ]; then
    echo 'Repo-local Firefox was not found; using a system Firefox binary with the isolated Sealgate test profile.' >&2
    firefox_executable=$system_firefox
  fi
done

if [ -z "$firefox_executable" ] && command -v firefox >/dev/null 2>&1; then
  echo 'Repo-local Firefox was not found; using Firefox from PATH with the isolated Sealgate test profile.' >&2
  firefox_executable=$(command -v firefox)
fi

if [ -z "$firefox_executable" ] || [ ! -x "$firefox_executable" ]; then
  echo 'No usable Firefox executable found. Run npm run browser:install:firefox or set SEALGATE_FIREFOX_PATH.' >&2
  exit 1
fi

server="$repo_root/node_modules/.bin/firefox-devtools-mcp"

if [ ! -x "$server" ]; then
  echo 'Firefox DevTools MCP is not installed. Run npm install.' >&2
  exit 1
fi

dev_profile="$repo_root/.firefox-profile/firefox_devtools_mcp_profile"
browser_log="$repo_root/.firefox-devtools-browser.log"

mkdir -p "$dev_profile"

firefox_pid=

if ! nc -z 127.0.0.1 2828 >/dev/null 2>&1; then
  "$firefox_executable" \
    --marionette \
    --remote-debugging-port \
    --no-remote \
    --profile "$dev_profile" \
    >"$browser_log" 2>&1 &
  firefox_pid=$!

  attempt=0
  while ! nc -z 127.0.0.1 2828 >/dev/null 2>&1; do
    if ! kill -0 "$firefox_pid" >/dev/null 2>&1; then
      echo "Firefox exited before its remote-control port opened. See $browser_log." >&2
      exit 1
    fi
    if [ "$attempt" -ge 120 ]; then
      echo "Timed out waiting for Firefox's remote-control port. See $browser_log." >&2
      exit 1
    fi
    attempt=$((attempt + 1))
    sleep 0.25
  done
fi

cleanup() {
  if [ -n "$firefox_pid" ] && kill -0 "$firefox_pid" >/dev/null 2>&1; then
    kill "$firefox_pid" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT HUP INT TERM

"$server" \
  --connect-existing \
  --marionette-port=2828 \
  --tool-preset=developer \
  --log-file="$repo_root/.firefox-devtools-mcp.log"
