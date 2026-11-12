#!/bin/sh
# Rebuild the bowling-ball extraction end to end (intermediates go to extract/ball/work/).
set -e
W="$(cd "$(dirname "$0")/../.." && pwd)"
PY="$W/venv/bin/python -I"
cd "$W"
$PY tools/ball/01_mask.py      # lighting-normalised photo, rule spacing
$PY tools/ball/02_inkfit.py    # unmix neutral ink from blue rules -> ink darkness map
$PY tools/ball/02b_rules.py    # rule-band mask
$PY tools/ball/04_strokes.py   # route / centre / smooth / measure the strokes in spec.py
$PY tools/ball/06_export.py    # JSON, SVG, ink mask, renders
# debug views (optional):  $PY tools/ball/03_grid.py x0 y0 x1 y1 step scale out.png
#                          $PY tools/ball/05_debug.py x0 y0 x1 y1 scale out.png [photo]
