"""Debug: draw routed centerlines (+ width envelopes, waypoints) over the ink map.
usage: 05_debug.py x0 y0 x1 y1 scale_pct out.png [photo]
"""
import os, sys, numpy as np
from PIL import Image, ImageDraw, ImageOps
HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(os.path.dirname(HERE))
WORK = os.path.join(W, "extract", "ball", "work")
x0, y0, x1, y1, sc = [int(v) for v in sys.argv[1:6]]
out = sys.argv[6]
photo = len(sys.argv) > 7 and sys.argv[7] == "photo"
f = sc / 100.0
if photo:
    im = ImageOps.exif_transpose(Image.open("/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5774.jpg")).convert("RGB")
    a = np.asarray(im.crop((x0, y0, x1, y1))).astype(np.float32) / 255
    a = 1 / (1 + np.exp(-6 * (a - 0.5)))
    a = (a - a.min()) / (a.max() - a.min())
    im = Image.fromarray((a * 255).astype(np.uint8))
else:
    ink = np.load(os.path.join(WORK, "ink.npy"))[y0:y1, x0:x1]
    im = Image.fromarray((255 - np.clip(ink * 255 * 2.2, 0, 255)).astype(np.uint8))
im = im.resize((int((x1 - x0) * f), int((y1 - y0) * f)), Image.LANCZOS).convert("RGB")
d = ImageDraw.Draw(im, "RGBA")
S = np.load(os.path.join(WORK, "strokes_px.npy"), allow_pickle=True)
cols = [(230, 0, 0), (255, 120, 0), (0, 150, 0), (0, 120, 255), (160, 0, 200), (220, 0, 120), (0, 170, 170), (120, 80, 0)]
for k, s in enumerate(S):
    c = cols[k % len(cols)]
    p = (s["p"] - [x0, y0]) * f
    pts = [tuple(q) for q in p]
    closed = s["id"] in ("outline-loop", "hole-middle", "hole-ring", "hole-thumb")
    if closed:
        pts = pts + pts[:1]
    d.line(pts, fill=c + (150 if photo else 170,), width=1)
    # width ticks
    w = s["w"]
    for i in range(0, len(p), 3):
        j = min(i + 1, len(p) - 1); h = max(i - 1, 0)
        t = p[j] - p[h]; t = t / (np.linalg.norm(t) + 1e-9); n = np.array([-t[1], t[0]])
        a = p[i] + n * w[i] * f / 2; b = p[i] - n * w[i] * f / 2
        d.line([tuple(a), tuple(b)], fill=c + (70,), width=1)
    for q in (s["wps"] - [x0, y0]) * f:
        r = 3
        d.ellipse([q[0] - r, q[1] - r, q[0] + r, q[1] + r], outline=(0, 0, 0, 255))
    q = p[0]
    d.ellipse([q[0] - 6, q[1] - 6, q[0] + 6, q[1] + 6], outline=c + (255,), width=2)
im.save(out)
