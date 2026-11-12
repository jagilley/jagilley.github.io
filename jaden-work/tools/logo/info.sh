#!/bin/bash
# Print timing info from the logo review page (export=info): write-on spans and render cost.
HERE="$(cd "$(dirname "$0")" && pwd)"
PROFILE="$(mktemp -d)"; OUT="$PROFILE/dom.txt"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$PROFILE" \
  --allow-file-access-from-files --force-device-scale-factor="${2:-2}" --window-size=800,600 --dump-dom \
  "file://$HERE/../../review/logo.html?export=info&$1" > "$OUT" 2>/dev/null &
PID=$!
for i in $(seq 1 120); do sleep 0.5; grep -q 'INFO' "$OUT" && break; done
kill $PID 2>/dev/null; sleep 0.3; pkill -f "$PROFILE" 2>/dev/null
grep -o 'INFO.*}' "$OUT"; rm -rf "$PROFILE"
