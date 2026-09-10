"""Trim harness renders (svg-N.png, 1800x2800 at 2x) to their content so you can
Read them without wading through blank canvas. Also the pattern for zooming a
region: Image.open(p).crop((x0,y0,x1,y1)).save(out).

  python3 crop_renders.py /abs/harness-dir            -> writes crop-N.png next to each svg-N.png

Device-pixel mapping inside a harness render (900px window, 2x): the SVG's
top-left is at (160, 80) — the 820px .wrap is centred (40px margin) and padded
40px — and it is 1480px wide, so 1 viewBox unit = 1480 / viewBoxWidth px.
"""
import glob, os, sys
from PIL import Image

d = sys.argv[1]
for p in sorted(glob.glob(os.path.join(d, "svg-*.png"))):
    im = Image.open(p).convert("RGB"); w, h = im.size; px = im.load(); bg = px[5, 5]
    bottom = 0
    for y in range(h - 1, -1, -1):
        if any(sum(abs(px[x, y][k] - bg[k]) for k in range(3)) > 30 for x in range(0, w, 4)):
            bottom = y; break
    out = os.path.join(os.path.dirname(p), os.path.basename(p).replace("svg-", "crop-", 1))
    im.crop((0, 0, w, min(h, bottom + 60))).save(out)
    print(os.path.basename(out), bottom + 60)
