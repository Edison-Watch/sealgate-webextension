#!/bin/sh

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
repo_root=$(git -C "$script_dir/.." rev-parse --show-toplevel)

find_repo_chrome() {
  find "$repo_root/.chrome-for-testing" -type f \
    \( -path '*/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
    -o -path '*/chrome-linux*/chrome' \
    -o -path '*/chrome-win*/chrome.exe' \) \
    -print 2>/dev/null | sort -r | head -n 1
}

chrome_executable=${SEALGATE_CHROME_PATH:-}

if [ -z "$chrome_executable" ]; then
  chrome_executable=$(find_repo_chrome)
fi

if [ -z "$chrome_executable" ] && [ -x '/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' ]; then
  chrome_executable='/Applications/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'
fi

if [ -z "$chrome_executable" ] && [ -x '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' ]; then
  echo 'Chrome for Testing was not found; using the system Chrome binary with the isolated Sealgate test profile.' >&2
  chrome_executable='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
fi

if [ -z "$chrome_executable" ] || [ ! -x "$chrome_executable" ]; then
  echo 'No usable Chrome executable found. Run npm run browser:install or set SEALGATE_CHROME_PATH.' >&2
  exit 1
fi

server="$repo_root/node_modules/.bin/chrome-devtools-mcp"

if [ ! -x "$server" ]; then
  echo 'Chrome DevTools MCP is not installed. Run npm install.' >&2
  exit 1
fi

exec "$server" \
  --categoryExtensions=true \
  --executablePath="$chrome_executable" \
  --userDataDir="$repo_root/.chrome-profile" \
  --filesystemRoot="$repo_root" \
  --viewport=1280x900 \
  --logFile="$repo_root/.chrome-devtools-mcp.log" \
  --no-performance-crux \
  --no-usage-statistics
