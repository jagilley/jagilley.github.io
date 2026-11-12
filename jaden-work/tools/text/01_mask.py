"""Step 1: ink mask + ruled-line spacing for the handwritten greeting.

Reads the phone photo, normalises lighting per channel, separates the black
ink from the blue rules / red margin / paper, and writes:
  extract/text/_work/ink_full.png   binary ink mask (full frame, 255 = ink)
  extract/text/_work/meta.json      spacing_px, crop box
  extract/text/text-ink.png         cropped ink mask, black on transparent
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageOps
import cv2
from scipy import ndimage as ndi

W = '/Users/jasper/Code/jagilley.github.io/jaden-work'
SRC = '/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5775.jpg'
OUT = f'{W}/extract/text'
WORK = f'{OUT}/_work'
os.makedirs(WORK, exist_ok=True)

img = ImageOps.exif_transpose(Image.open(SRC)).convert('RGB')
rgb = np.asarray(img).astype(np.float32)
H, Wd, _ = rgb.shape
print('image', Wd, H)

# ---- ruled-line spacing (blue rules are vertical; they are dark in R) ----
R = rgb[..., 0]
# use the band below the margin line, whole width, but avoid writing rows
prof = (255 - R[2300:3100, :]).mean(axis=0)
prof = prof - ndi.uniform_filter1d(prof, 401)
n = len(prof)
spec = np.abs(np.fft.rfft(prof * np.hanning(n)))
freqs = np.fft.rfftfreq(n)
mask = (freqs > 1 / 400) & (freqs < 1 / 120)
k = np.argmax(np.where(mask, spec, 0))
# parabolic refinement
a, b, c = spec[k - 1], spec[k], spec[k + 1]
dk = 0.5 * (a - c) / (a - 2 * b + c)
f = (k + dk) / n
spacing_fft = 1 / f
# refine with peak positions (line centres) -> linear fit
sm = ndi.gaussian_filter1d(prof, 3)
peaks = []
for i in range(5, n - 5):
    if sm[i] == sm[i - 5:i + 6].max() and sm[i] > 0.4 * sm.max():
        peaks.append(i)
peaks = np.array(peaks)
# keep peaks roughly spacing apart
idx = np.round((peaks - peaks[0]) / spacing_fft)
A = np.vstack([idx, np.ones_like(idx)]).T
sl, ic = np.linalg.lstsq(A, peaks, rcond=None)[0]
print('fft spacing', spacing_fft, 'fit spacing', sl, 'n peaks', len(peaks))
print('peaks', peaks.tolist())
spacing = float(sl)

# ---- lighting normalisation ----
# paper estimate per channel: dilate (max filter) to remove dark ink/rules,
# then smooth.  Kernel larger than stroke width (~30px) and rule width.
bg = np.empty_like(rgb)
for ch in range(3):
    m = cv2.dilate(rgb[..., ch], np.ones((61, 61), np.uint8))
    m = cv2.GaussianBlur(m, (0, 0), 40)
    bg[..., ch] = m
norm = np.clip(rgb / np.maximum(bg, 1), 0, 1.2)
mx = norm.max(axis=2)          # ink dark in every channel

# hysteresis threshold: strong ink seeds + weaker connected ink
from skimage.filters import apply_hysteresis_threshold
ink_b =apply_hysteresis_threshold(1 - mx, 1 - 0.62, 1 - 0.42)
ink_b = ndi.binary_closing(ink_b, structure=np.ones((5, 5)))
ink_b = ndi.binary_opening(ink_b, structure=np.ones((3, 3)))
# fill tiny holes
holes = ndi.binary_fill_holes(ink_b) & ~ink_b
hl, hn = ndi.label(holes)
hs = ndi.sum(holes, hl, range(1, hn + 1))
small_holes = np.isin(hl, np.where(hs < 150)[0] + 1)
ink_b |= small_holes
ink = ink_b

# components: keep only the writing region, drop specks
lab, nl = ndi.label(ink, structure=np.ones((3, 3)))
sizes = ndi.sum(ink, lab, range(1, nl + 1))
objs = ndi.find_objects(lab)
keep = np.zeros(nl + 1, bool)
info = []
for i, (sz, sl_) in enumerate(zip(sizes, objs), start=1):
    y0, y1 = sl_[0].start, sl_[0].stop
    x0, x1 = sl_[1].start, sl_[1].stop
    # writing lives in this window (photo coords); exclude the page edge etc.
    if not (1450 <= x0 and x1 <= 4700 and 1000 <= y0 and y1 <= 2150):
        continue
    if sz < 120:
        continue
    keep[i] = True
    info.append((int(sz), x0, y0, x1, y1))
ink = keep[lab]
info.sort(key=lambda t: t[1])
for t in info:
    print('comp', t)

ys, xs = np.nonzero(ink)
bbox = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
print('ink bbox', bbox)
Image.fromarray((ink * 255).astype(np.uint8)).save(f'{WORK}/ink_full.png')

json.dump({'spacing_px': spacing, 'spacing_fft': spacing_fft, 'bbox': bbox,
           'size': [Wd, H]}, open(f'{WORK}/meta.json', 'w'), indent=1)

# cropped mask, black on transparent, 40-unit margin
m = int(round(40 / 100 * spacing))
X0, Y0 = bbox[0] - m, bbox[1] - m
X1, Y1 = bbox[2] + m, bbox[3] + m
crop = ink[Y0:Y1, X0:X1]
rgba = np.zeros(crop.shape + (4,), np.uint8)
rgba[..., 3] = crop * 255
Image.fromarray(rgba).save(f'{OUT}/text-ink.png')
print('crop', X0, Y0, X1, Y1)
