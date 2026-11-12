"""Step 2: per-pixel unmixing of (neutral ink) x (blue rule) in log space.

log n_c = log k + alpha * log t_core_c ; solve LSQ for (log k, alpha), alpha>=0, k<=1.
Ink darkness = 1 - k. Saves ink.npy (float32, 0..1) and previews.
"""
import os, numpy as np
from PIL import Image
W = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(W, "extract", "ball", "work")
n = np.load(os.path.join(OUT, "norm.npy")).astype(np.float32)
H, Wd, _ = n.shape
L = np.log(np.clip(n, 0.02, 1.0))
t = np.log(np.array([0.155, 0.43, 0.64], np.float32))  # blue-rule core transmittance
# LSQ with design [1, t_c]
A = np.stack([np.ones(3, np.float32), t], 1)
P = np.linalg.pinv(A)  # 2x3
sol = L @ P.T  # (..., 2) -> logk, alpha
logk = sol[..., 0]; alpha = sol[..., 1]
# alpha<0 means the pixel is "anti-blue" (e.g. reddish/yellowish); clamp alpha to 0 and refit logk
neg = alpha < 0
alpha = np.where(neg, 0, alpha)
logk = np.where(neg, L.mean(-1), logk)
# alpha>1.3 clamp
over = alpha > 1.3
logk = np.where(over, (L - 1.3 * t).mean(-1), logk)
k = np.exp(np.minimum(logk, 0))
ink = (1 - k).astype(np.float32)
np.save(os.path.join(OUT, "ink.npy"), ink)
np.save(os.path.join(OUT, "alpha.npy"), alpha.astype(np.float16))
prev = (255 - np.clip(ink * 255 * 2.5, 0, 255)).astype(np.uint8)
Image.fromarray(prev).resize((Wd // 4, H // 4), Image.LANCZOS).save(os.path.join(OUT, "ink_prev.png"))
def stat(name, y0, y1, x0, x1):
    dd = ink[y0:y1, x0:x1]
    print(f"{name:12s} max {dd.max():.3f} p99 {np.percentile(dd,99):.3f} p95 {np.percentile(dd,95):.3f} p50 {np.median(dd):.3f}")
stat("rule", 2600, 2900, 2120, 2180)
stat("rule-top", 300, 600, 2120, 2180)
stat("paper", 2600, 2900, 2200, 2350)
stat("lightswirl", 1100, 1230, 1950, 2060)
stat("showthru", 1300, 1500, 2700, 3200)
