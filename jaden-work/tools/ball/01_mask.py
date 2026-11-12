"""Step 1: background-normalise the photo, build an ink-darkness map, measure rule spacing.

Outputs (in $W/extract/ball/work/):
  dark.npy   float32 ink-darkness 0..1 (1 - max normalised channel), full res
  dark.png   preview of the darkness map
  spacing.json  measured ruled-line spacing in px
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageOps
import cv2

W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC = "/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5774.jpg"
OUT = os.path.join(W, "extract", "ball", "work")
os.makedirs(OUT, exist_ok=True)

im = ImageOps.exif_transpose(Image.open(SRC)).convert("RGB")
a = np.asarray(im).astype(np.float32) / 255.0
H, Wd, _ = a.shape
print("size", Wd, H)

# ---- rule spacing: blueness profile along x (rules are vertical) ----
blue = a[..., 2] - a[..., 0]
prof = blue[int(H * 0.25):int(H * 0.95)].mean(axis=0)
prof = prof - prof.mean()
f = np.abs(np.fft.rfft(prof * np.hanning(len(prof))))
freqs = np.fft.rfftfreq(len(prof))
lo = np.searchsorted(freqs, 1 / 400.0)
hi = np.searchsorted(freqs, 1 / 120.0)
k = lo + np.argmax(f[lo:hi])
# parabolic refine
y0, y1, y2 = np.log(f[k - 1:k + 2] + 1e-9)
dk = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2)
fr = (k + dk) / len(prof)
sp_fft = 1.0 / fr
# refine via line positions: find peaks of profile
from scipy.signal import find_peaks
pk, _ = find_peaks(prof, distance=int(sp_fft * 0.7), prominence=prof.std() * 0.5)
d = np.diff(pk)
good = d[(d > sp_fft * 0.8) & (d < sp_fft * 1.2)]
# linear fit of peak index vs position for a robust spacing
idx = np.round((pk - pk[0]) / sp_fft)
A = np.vstack([idx, np.ones_like(idx)]).T
sl, ic = np.linalg.lstsq(A, pk, rcond=None)[0]
print("fft spacing", sp_fft, "median diff", np.median(good), "lsq", sl, "n peaks", len(pk))
print("peaks", pk.tolist())
json.dump({"spacing_px": float(sl), "fft": float(sp_fft), "median": float(np.median(good)),
           "peaks": pk.tolist()}, open(os.path.join(OUT, "spacing.json"), "w"), indent=1)

# ---- background estimate per channel (paper colour incl. lighting) ----
# Downscale, grey-closing (removes dark ink and thin coloured lines), blur, upscale.
s = 8
small = cv2.resize(a, (Wd // s, H // s), interpolation=cv2.INTER_AREA)
bg = np.empty_like(small)
for c in range(3):
    ch = small[..., c]
    # max filter wide enough to jump over ink (~40px full res) and rules (~20px)
    m = cv2.dilate(ch, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    m = cv2.erode(m, cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15)))
    m = cv2.GaussianBlur(m, (0, 0), 6)
    bg[..., c] = m
bg = cv2.resize(bg, (Wd, H), interpolation=cv2.INTER_CUBIC)
n = np.clip(a / np.maximum(bg, 1e-3), 0, 1.2)
np.save(os.path.join(OUT, "norm.npy"), n.astype(np.float16))

dark = 1.0 - np.clip(n.max(axis=2), 0, 1)
np.save(os.path.join(OUT, "dark.npy"), dark.astype(np.float32))
prev = (255 - np.clip(dark * 255 * 2.5, 0, 255)).astype(np.uint8)
Image.fromarray(prev).resize((Wd // 4, H // 4), Image.LANCZOS).save(os.path.join(OUT, "dark_prev.png"))
Image.fromarray((np.clip(n, 0, 1) * 255).astype(np.uint8)).resize((Wd // 4, H // 4), Image.LANCZOS).save(
    os.path.join(OUT, "norm_prev.png"))
print("done")
