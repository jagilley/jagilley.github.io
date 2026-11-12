"""Step 4: route, centre, smooth and measure the composed pen strokes; write JSON + SVG +
cleaned ink mask, plus debug overlays.

Run after 01_mask.py and 02_inkfit.py.
"""
import json, os, sys, importlib.util
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi
from skimage.graph import route_through_array

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(os.path.dirname(HERE))
SRC = "/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5774.jpg"
EXT = os.path.join(W, "extract", "ball")
WORK = os.path.join(EXT, "work")

spec_mod = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "spec.py"))
spec = importlib.util.module_from_spec(spec_mod); spec_mod.loader.exec_module(spec)
STROKES = spec.STROKES

ink = np.load(os.path.join(WORK, "ink.npy"))
H, Wd = ink.shape
# discount blue-rule residue (unmixing leaves ~0.1-0.25 at rule edges)
band = np.load(os.path.join(WORK, "ruleband.npy"))
ink = np.where(band, np.clip((ink - 0.17) / 0.83, 0, 1) + 0.015, ink).astype(np.float32)
ink1 = ndi.gaussian_filter(ink, 1.2)
ink0 = ndi.gaussian_filter(ink, 0.6)   # for width measurement
ink2 = ndi.gaussian_filter(ink, 2.0)

# ---------------- spacing (local to the drawing) ----------------
sp = json.load(open(os.path.join(WORK, "spacing.json")))
pk = np.array([p for p in sp["peaks"] if 1500 <= p <= 3900], float)
idx = np.round((pk - pk[0]) / 220.0)
SPACING = float(np.polyfit(idx, pk, 1)[0])
U = 100.0 / SPACING          # units per px
print("local spacing px", SPACING)

# ---------------- cost map ----------------
dark = ink2 > 0.30
edt = ndi.distance_transform_edt(dark)
cost = 1.0 / (ink2 + 0.02) ** 2 / (1.0 + 0.6 * edt)


def snap(x, y, r=10):
    x0, x1 = int(x - r), int(x + r + 1)
    y0, y1 = int(y - r), int(y + r + 1)
    win = ink2[y0:y1, x0:x1]
    yy, xx = np.mgrid[y0:y1, x0:x1]
    m = (xx - x) ** 2 + (yy - y) ** 2 <= r * r
    v = np.where(m, win, -1)
    i = np.unravel_index(np.argmax(v), v.shape)
    return float(xx[i]), float(yy[i])


def route(a, b, pad=70):
    x0 = int(max(min(a[0], b[0]) - pad, 0)); x1 = int(min(max(a[0], b[0]) + pad, Wd - 1))
    y0 = int(max(min(a[1], b[1]) - pad, 0)); y1 = int(min(max(a[1], b[1]) + pad, H - 1))
    sub = cost[y0:y1 + 1, x0:x1 + 1]
    path, _ = route_through_array(sub, (int(round(a[1])) - y0, int(round(a[0])) - x0),
                                  (int(round(b[1])) - y0, int(round(b[0])) - x0),
                                  fully_connected=True, geometric=True)
    p = np.array(path, float)
    return np.stack([p[:, 1] + x0, p[:, 0] + y0], 1)


def line(a, b):
    n = max(int(np.hypot(b[0] - a[0], b[1] - a[1])), 2)
    t = np.linspace(0, 1, n + 1)[:, None]
    return np.array(a)[None] * (1 - t) + np.array(b)[None] * t


def resample(p, step, closed):
    if closed:
        p = np.vstack([p, p[:1]])
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(p, axis=0).T))]
    L = d[-1]
    n = max(int(round(L / step)), 2)
    t = np.linspace(0, L, n + 1)
    if closed:
        t = t[:-1]
    return np.stack([np.interp(t, d, p[:, 0]), np.interp(t, d, p[:, 1])], 1)


def smooth(p, sigma, closed):
    if closed:
        return ndi.gaussian_filter1d(p, sigma, axis=0, mode="wrap")
    # odd reflection keeps the end points and end tangents in place
    k = int(4 * sigma) + 1
    k = min(k, len(p) - 1)
    pre = 2 * p[0] - p[1:k + 1][::-1]
    post = 2 * p[-1] - p[-k - 1:-1][::-1]
    q = np.vstack([pre, p, post])
    q = ndi.gaussian_filter1d(q, sigma, axis=0, mode="nearest")
    return q[k:k + len(p)]


def spline_smooth(p, closed, noise_px=1.2, step=1.0):
    """Smoothing spline with residual budget N*noise^2: removes tremor / pixel noise but
    keeps features the ink consistently supports (hairpins, hand wobble)."""
    from scipy.interpolate import splprep, splev
    q = resample(p, step, closed)
    if closed:
        q = np.vstack([q, q[:1]])
    n = len(q)
    tck, u = splprep([q[:, 0], q[:, 1]], s=n * noise_px ** 2, per=1 if closed else 0, k=3)
    uu = np.linspace(0, 1, n)
    x, y = splev(uu, tck)
    r = np.stack([x, y], 1)
    if closed:
        r = r[:-1]
    return resample(r, step, closed)


def normals(p, closed, win=3):
    if closed:
        t = np.roll(p, -win, 0) - np.roll(p, win, 0)
    else:
        q = np.vstack([np.repeat(p[:1], win, 0), p, np.repeat(p[-1:], win, 0)])
        t = q[2 * win:] - q[:-2 * win]
    t = t / np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-9)
    return np.stack([-t[:, 1], t[:, 0]], 1)


OFF = np.arange(-20, 20.01, 0.5)


def profile_stats(p, closed, img=ink1):
    """For each point: (centre offset along normal, FWHM width px, peak darkness, ok flag)."""
    nrm = normals(p, closed)
    xs = p[:, 0:1] + nrm[:, 0:1] * OFF[None]
    ys = p[:, 1:2] + nrm[:, 1:2] * OFF[None]
    prof = ndi.map_coordinates(img, [ys.ravel(), xs.ravel()], order=1).reshape(xs.shape)
    c0 = len(OFF) // 2
    res = np.zeros((len(p), 4))
    for i, pr in enumerate(prof):
        # local max nearest the centre, within +-8 px
        lo, hi = c0 - 16, c0 + 17
        seg = pr[lo:hi]
        # candidate maxima
        cand = [j for j in range(1, len(seg) - 1) if seg[j] >= seg[j - 1] and seg[j] >= seg[j + 1]]
        if not cand:
            j = int(np.argmax(seg))
        else:
            # prefer high maxima close to centre
            sc = [seg[j] - 0.01 * abs(j - 16) for j in cand]
            j = cand[int(np.argmax(sc))]
        m = lo + j
        peak = pr[m]
        half = 0.5 * peak
        l = m
        while l > 0 and pr[l - 1] >= half:
            l -= 1
        r = m
        while r < len(pr) - 1 and pr[r + 1] >= half:
            r += 1
        # sub-sample edges
        def edge(k_in, k_out):
            a, b = pr[k_in], pr[k_out]
            f = (a - half) / max(a - b, 1e-6)
            return OFF[k_in] + f * (OFF[k_out] - OFF[k_in])
        le = edge(l, l - 1) if l > 0 else OFF[0]
        re_ = edge(r, r + 1) if r < len(pr) - 1 else OFF[-1]
        ok = (l > 0) and (r < len(pr) - 1) and peak > 0.12
        res[i] = (0.5 * (le + re_), re_ - le, peak, ok)
    return res, nrm


def interp_bad(v, ok, closed):
    v = v.copy()
    idx = np.arange(len(v))
    if ok.sum() == 0:
        return v
    if closed:
        n = len(v)
        xi = np.r_[idx[ok] - n, idx[ok], idx[ok] + n]
        yi = np.r_[v[ok], v[ok], v[ok]]
        v[~ok] = np.interp(idx[~ok], xi, yi)
    else:
        v[~ok] = np.interp(idx[~ok], idx[ok], v[ok])
    return v


def locked_mask(p, lockpts, r=4.0):
    if lockpts is None or len(lockpts) == 0:
        return np.zeros(len(p), bool)
    from scipy.spatial import cKDTree
    d, _ = cKDTree(lockpts).query(p)
    return d < r


def refine(p, closed, iters=3, lockpts=None):
    for it in range(iters):
        p = resample(p, 2.0, closed)
        st, nrm = profile_stats(p, closed)
        off, wid, peak, ok = st.T
        ok = ok.astype(bool)
        lk = locked_mask(p, lockpts)
        medw = np.median(wid[ok]) if ok.any() else 6
        # windowed median width to detect junction/crossing blow-ups
        locw = ndi.median_filter(np.where(ok, wid, medw), size=31, mode="wrap" if closed else "nearest")
        ok &= wid < 1.6 * locw + 2
        ok &= np.abs(off) < 7
        off = interp_bad(off, ok, closed)
        off[lk] = 0.0
        off = ndi.median_filter(off, size=5, mode="wrap" if closed else "nearest")
        off = ndi.gaussian_filter1d(off, 2, mode="wrap" if closed else "nearest")
        p = p + nrm * off[:, None]
    return p


def edt_width(p, peak):
    """Distance-transform width: threshold the ink at half the stroke's local centre
    darkness (so light strokes get their own threshold), EDT, sample at the centreline."""
    from scipy.spatial import cKDTree
    pad = 30
    x0 = int(max(p[:, 0].min() - pad, 0)); x1 = int(min(p[:, 0].max() + pad, Wd))
    y0 = int(max(p[:, 1].min() - pad, 0)); y1 = int(min(p[:, 1].max() + pad, H))
    yy, xx = np.mgrid[y0:y1, x0:x1]
    d, j = cKDTree(p).query(np.c_[xx.ravel(), yy.ravel()])
    pk_map = np.maximum(peak[j], 0.12).reshape(xx.shape)
    near = (d < 25).reshape(xx.shape)
    m = (ink0[y0:y1, x0:x1] >= 0.5 * pk_map) & near
    e = ndi.distance_transform_edt(m)
    v = ndi.map_coordinates(e, [p[:, 1] - y0, p[:, 0] - x0], order=1)
    return np.where(v > 0.75, 2 * v - 1, np.nan)


def measure(p, closed, lockpts=None):
    st, nrm = profile_stats(p, closed, img=ink0)
    off, wid, peak, ok = st.T
    ok = ok.astype(bool)
    ok &= ~locked_mask(p, lockpts, 3.0)     # bridged pen gaps / crossings: no own ink to measure
    pk_s = ndi.median_filter(interp_bad(peak, ok, closed), size=7, mode="wrap" if closed else "nearest")
    we = edt_width(p, pk_s)
    # FWHM across the stroke is the primary width; the EDT width caps it where the
    # normal profile is ambiguous (hairpin apexes, places where strokes touch).
    good = np.isfinite(we) & ok
    ratio = float(np.median(wid[good] / we[good])) if good.sum() > 5 else 1.0   # EDT reads low on ragged edges
    cap = ratio * we * 1.2
    wid = np.where(np.isfinite(we), np.minimum(wid, np.maximum(cap, 0.5 * wid)), wid)
    medw = np.median(wid[ok]) if ok.any() else 6
    md = "wrap" if closed else "nearest"
    locw = ndi.median_filter(np.where(ok, wid, medw), size=9, mode=md)
    ok &= wid < 1.5 * locw + 1.5
    # wider trend check (catches e.g. a light stroke crossing a show-through smudge)
    trend = ndi.median_filter(interp_bad(wid, ok, closed), size=31, mode=md)
    ok &= (wid < 1.4 * trend + 1.0) & (wid > 0.5 * trend)
    wid = interp_bad(wid, ok, closed)
    wid = ndi.median_filter(wid, size=5, mode="wrap" if closed else "nearest")
    wid = ndi.gaussian_filter1d(wid, 1.5, mode="wrap" if closed else "nearest")
    pk_ = interp_bad(peak, ok, closed)
    return wid, pk_, ok


results = []
for s in STROKES:
    wps = []
    for w in s["wps"]:
        if len(w) == 3 and w[2] == "bridge":
            wps.append((float(w[0]), float(w[1]), True))
        elif len(w) == 3 and w[2] == "nosnap":
            wps.append((float(w[0]), float(w[1]), False))
        else:
            x, y = snap(w[0], w[1])
            if ink2[int(y), int(x)] < 0.25:
                print(f'  WARN {s["id"]}: waypoint {w[:2]} snapped to ({x:.0f},{y:.0f}) ink {ink2[int(y), int(x)]:.2f}')
            wps.append((x, y, False))
    pts = []
    lock = []
    seq = wps + ([wps[0]] if s["closed"] else [])
    for a, b in zip(seq[:-1], seq[1:]):
        seg = line(a[:2], b[:2]) if b[2] else route(a[:2], b[:2])
        if b[2]:
            lock.append(seg)
        if pts:
            seg = seg[1:]
        pts.append(seg)
    p = np.vstack(pts)
    if s["closed"]:
        p = p[:-1]
    raw = p.copy()
    p = resample(p, 1.0, s["closed"])
    p = smooth(p, 3.0, s["closed"])
    p = refine(p, s["closed"], lockpts=np.vstack(lock) if lock else None)
    p = spline_smooth(p, s["closed"], float(s.get("noise", 1.3)))
    p = resample(p, 3.0 / U, s["closed"])        # ~3 units
    wid, peak, ok = measure(p, s["closed"], np.vstack(lock) if lock else None)
    results.append(dict(s=s, p=p, w=wid, peak=peak, ok=ok, raw=raw, wps=wps))
    print(f'{s["id"]:14s} n={len(p):4d} len={len(p)*3:5.0f}u  w med {np.median(wid)*U:.2f}u  '
          f'peak med {np.median(peak):.3f} p10 {np.percentile(peak,10):.3f} p90 {np.percentile(peak,90):.3f}  ok {ok.mean():.2f}')

# ---- widths where a stroke runs into / over another stroke's ink are ambiguous:
# interpolate them from the stroke's own unambiguous neighbours.
from scipy.spatial import cKDTree
for i, r in enumerate(results):
    amb = np.zeros(len(r["p"]), bool)
    own = np.median(r["w"])
    for k, o in enumerate(results):
        if k == i:
            continue
        d, j = cKDTree(o["p"]).query(r["p"])
        amb |= d < (o["w"][j] / 2 + own / 2 + 4.0)
    if amb.any() and (~amb).any():
        r["w"] = interp_bad(r["w"], ~amb, r["s"]["closed"])
        r["peak"] = interp_bad(r["peak"], ~amb, r["s"]["closed"])
    print(f'  {r["s"]["id"]:13s} {amb.sum():3d} pts touch other strokes; w med {np.median(r["w"])*U:.2f}u '
          f'range {r["w"].min()*U:.1f}-{r["w"].max()*U:.1f}u')

np.save(os.path.join(WORK, "strokes_px.npy"), np.array(
    [dict(id=r["s"]["id"], p=r["p"], w=r["w"], peak=r["peak"], raw=r["raw"],
          wps=np.array([w[:2] for w in r["wps"]])) for r in results], dtype=object), allow_pickle=True)
print("saved")
