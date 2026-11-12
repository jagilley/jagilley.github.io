"""Debug: render photo tiles with a labelled full-res coordinate grid (for picking stroke waypoints)."""
import os, sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps
W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(W, "extract", "ball", "work")
ink = np.load(os.path.join(OUT, "ink.npy"))
x0, y0, x1, y1, step, scale = [int(v) for v in sys.argv[1:7]]
name = sys.argv[7]
c = ink[y0:y1, x0:x1]
g = (255 - np.clip(c * 255 * 1.6, 0, 255)).astype(np.uint8)
im = Image.fromarray(g).convert("RGB")
d = ImageDraw.Draw(im)
try:
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18 if step >= 50 else 9)
except Exception:
    font = ImageFont.load_default()
for x in range((x0 // step + 1) * step, x1, step):
    major = x % (step * 5 if step < 50 else step * 2) == 0
    d.line([(x - x0, 0), (x - x0, y1 - y0)], fill=(255, 0, 0) if major else (255, 170, 170), width=1)
    if major:
        for yy in range(0, y1 - y0, 150 if step < 50 else 300):
            d.text((x - x0 + 2, yy + 2), str(x), fill=(200, 0, 0), font=font)
for y in range((y0 // step + 1) * step, y1, step):
    major = y % (step * 5 if step < 50 else step * 2) == 0
    d.line([(0, y - y0), (x1 - x0, y - y0)], fill=(0, 0, 255) if major else (170, 170, 255), width=1)
    if major:
        for xx in range(0, x1 - x0, 150 if step < 50 else 300):
            d.text((xx + 2, y - y0 + 2), str(y), fill=(0, 0, 200), font=font)
if scale != 100:
    im = im.resize((im.width * scale // 100, im.height * scale // 100), Image.LANCZOS)
im.save(os.path.join(OUT, name))
