#!/bin/bash
# Headless capture of the logo review page in export mode.
#   tools/logo/shot.sh 'export=solo&color=0.64&lw=340' out.png 390 420 [dpr]
# The canvas is drawn at exactly W x H CSS px (cw/ch) in a window at least 600 px wide (Chrome's minimum).
# (headless=new loses 87 px of window height: pad, then crop; it doesn't exit by itself: poll, then kill)
Q="$1"; OUT="$2"; W="$3"; H="$4"; DPR="${5:-2}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="file://$HERE/../../review/logo.html?$Q&cw=$W&ch=$H"
WW=$(( W < 600 ? 600 : W ))
PROFILE="$(mktemp -d)"
rm -f "$OUT"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --user-data-dir="$PROFILE" --allow-file-access-from-files --force-device-scale-factor="$DPR" \
  --window-size="$WW,$((H + 87))" --screenshot="$OUT" "$PAGE" >/dev/null 2>&1 &
PID=$!
for i in $(seq 1 160); do sleep 0.5; if [ -s "$OUT" ]; then sleep 0.5; break; fi; done
kill $PID 2>/dev/null; sleep 0.3; pkill -f "$PROFILE" 2>/dev/null; rm -rf "$PROFILE"
[ -s "$OUT" ] || { echo "FAILED $OUT"; exit 1; }
"$HERE/../../venv/bin/python" -I -c "
from PIL import Image
im = Image.open('$OUT'); im.crop((0, 0, int($W * $DPR), int($H * $DPR))).save('$OUT', optimize=True)"
