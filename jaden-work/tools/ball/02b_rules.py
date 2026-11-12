"""Step 2b: locate every blue ruled line per row band -> rule-band mask (used to discount
blue-rule residue in the ink map when routing / building the clean mask)."""
import os, json, numpy as np
from scipy import ndimage as ndi
from scipy.signal import find_peaks
W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WORK = os.path.join(W, "extract", "ball", "work")
n = np.load(os.path.join(WORK, "norm.npy")).astype(np.float32)
H, Wd, _ = n.shape
blue = np.clip(n[..., 2] - n[..., 0], 0, None)
sp = json.load(open(os.path.join(WORK, "spacing.json")))
g = np.array(sp["peaks"], float)
band = 120
centers = []
ys = []
for y0 in range(0, H - band + 1, band // 2):
    prof = ndi.gaussian_filter1d(blue[y0:y0 + band].mean(0), 1.5)
    row = []
    for p in g:
        a, b = int(p - 25), int(p + 26)
        seg = prof[a:b]
        k = np.argmax(seg)
        if seg[k] > 0.05:
            # centroid around the max
            ww = seg[max(k - 6, 0):k + 7]
            xx = np.arange(max(k - 6, 0), min(k + 7, len(seg))) + a
            row.append(float((ww * xx).sum() / ww.sum()))
        else:
            row.append(np.nan)
    centers.append(row)
    ys.append(y0 + band / 2)
C = np.array(centers); ys = np.array(ys)
# per line: robust linear-ish fit (quadratic) of x vs y
mask = np.zeros((H, Wd), bool)
yy = np.arange(H)
fits = []
for j in range(C.shape[1]):
    ok = np.isfinite(C[:, j])
    if ok.sum() < 5:
        continue
    # reject outliers (ink can pull the centroid)
    c = np.polyfit(ys[ok], C[ok, j], 2)
    r = C[ok, j] - np.polyval(c, ys[ok])
    good = np.abs(r) < 3
    c = np.polyfit(ys[ok][good], C[ok, j][good], 2)
    fits.append(c.tolist())
    xc = np.polyval(c, yy)
    for y in range(H):
        a = int(xc[y] - 15); b = int(xc[y] + 16)
        mask[y, max(a, 0):min(b, Wd)] = True
np.save(os.path.join(WORK, "ruleband.npy"), mask)
print("lines", len(fits), "band px frac", mask.mean())
