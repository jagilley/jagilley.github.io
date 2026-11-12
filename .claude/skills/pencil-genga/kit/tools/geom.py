"""Small geometry toolkit for deriving style data from extracted strokes.

All coordinates are figure units (100 = one ruled-line spacing), y pointing down.
Boolean shape work is done on a 0.5-unit raster and traced back to polygons,
which is plenty for fill/shadow shapes that sit under a ~7-unit pencil line.
"""
import math
import numpy as np
from scipy import ndimage as ndi
from skimage import draw as skdraw, measure

TO_LIGHT = np.array([-0.6, -0.8])          # unit vector pointing toward the key light (upper left)


def A(p):
    return np.asarray(p, float)[:, :2]


def seglen(p):
    p = A(p)
    return np.hypot(*np.diff(p, axis=0).T)


def cumlen(p):
    return np.concatenate([[0], np.cumsum(seglen(p))])


def resample(p, step):
    p = A(p)
    s = cumlen(p)
    n = max(2, int(round(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], 1)


def smooth(v, sigma, mode="nearest"):
    if sigma <= 0:
        return np.asarray(v, float)
    return ndi.gaussian_filter1d(np.asarray(v, float), sigma, mode=mode)


def tangents(p, closed=False):
    p = A(p)
    if closed:
        d = np.roll(p, -1, 0) - np.roll(p, 1, 0)
    else:
        d = np.gradient(p, axis=0)
    n = np.hypot(*d.T)[:, None]
    n[n == 0] = 1
    return d / n


def normals(p, closed=False):
    t = tangents(p, closed)
    return np.stack([-t[:, 1], t[:, 0]], 1)


def area(p):
    p = A(p)
    x, y = p[:, 0], p[:, 1]
    return 0.5 * np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)


def orient(p, positive=True):
    """Return polygon with signed area > 0 (clockwise on screen, y down)."""
    p = A(p)
    return p if (area(p) > 0) == positive else p[::-1]


def rdp(p, eps):
    p = A(p)
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    ab = b - a
    L = np.hypot(*ab)
    if L == 0:
        d = np.hypot(*(p - a).T)
    else:
        d = np.abs(np.cross(ab, p - a)) / L
    i = int(np.argmax(d))
    if d[i] > eps:
        l = rdp(p[: i + 1], eps)
        r = rdp(p[i:], eps)
        return np.vstack([l[:-1], r])
    return np.vstack([a, b])


def noise1d(n, seed, wavelength_samples, octaves=2):
    """Smooth deterministic 1-D noise in [-1, 1], length n."""
    rng = np.random.default_rng(seed)
    out = np.zeros(n)
    amp, wl, tot = 1.0, wavelength_samples, 0
    for _ in range(octaves):
        k = max(2, int(n / max(wl, 1)) + 3)
        knots = rng.uniform(-1, 1, k)
        x = np.linspace(0, k - 3, n) + 1
        i = np.floor(x).astype(int)
        f = x - i
        f = f * f * (3 - 2 * f)
        out += amp * (knots[i] * (1 - f) + knots[np.minimum(i + 1, k - 1)] * f)
        tot += amp
        amp *= 0.45
        wl /= 2.3
    return out / tot


def wobble(p, amp, wavelength, seed, closed=False, step=3.0):
    """Displace a polyline along its normals by smooth noise (a hand's wander)."""
    q = resample(p, step)
    n = normals(q, closed)
    w = noise1d(len(q), seed, wavelength / step) * amp
    return q + n * w[:, None]


def offset(p, d, closed=False, step=3.0):
    q = resample(p, step)
    n = normals(q, closed)
    d = np.broadcast_to(np.asarray(d, float), (len(q),)) if np.ndim(d) == 0 else np.interp(
        np.linspace(0, 1, len(q)), np.linspace(0, 1, len(d)), d)
    return q + n * d[:, None]


def ellipse(cx, cy, rx, ry, rot=0.0, a0=0.0, a1=2 * math.pi, n=180):
    t = np.linspace(a0, a1, n)
    x, y = rx * np.cos(t), ry * np.sin(t)
    c, s = math.cos(rot), math.sin(rot)
    return np.stack([cx + c * x - s * y, cy + s * x + c * y], 1)


def clip_x(p, x0, x1):
    p = A(p)
    return p[(p[:, 0] >= x0) & (p[:, 0] <= x1)]


def clip_y(p, y0, y1):
    p = A(p)
    return p[(p[:, 1] >= y0) & (p[:, 1] <= y1)]


class Grid:
    """0.5-unit raster used for boolean ops between shapes."""

    def __init__(self, bounds, res=0.5):
        x0, y0, x1, y1 = bounds
        self.x0, self.y0, self.res = x0, y0, res
        self.W = int(math.ceil((x1 - x0) / res)) + 1
        self.H = int(math.ceil((y1 - y0) / res)) + 1

    def empty(self):
        return np.zeros((self.H, self.W), bool)

    def poly(self, p):
        p = A(p)
        m = self.empty()
        rr, cc = skdraw.polygon((p[:, 1] - self.y0) / self.res, (p[:, 0] - self.x0) / self.res, m.shape)
        m[rr, cc] = True
        return m

    def band(self, p, width, step=1.0):
        """Buffer a polyline by width/2 (round ends)."""
        q = resample(p, step * self.res)
        m = self.empty()
        r = np.clip(np.round((q[:, 1] - self.y0) / self.res).astype(int), 0, self.H - 1)
        c = np.clip(np.round((q[:, 0] - self.x0) / self.res).astype(int), 0, self.W - 1)
        m[r, c] = True
        d = ndi.distance_transform_edt(~m) * self.res
        return d <= width / 2

    def shift(self, m, dx, dy):
        return ndi.shift(m.astype(np.uint8), (dy / self.res, dx / self.res), order=0, cval=0).astype(bool)

    def inside(self, m, x, y):
        c = int(round((x - self.x0) / self.res))
        r = int(round((y - self.y0) / self.res))
        if 0 <= r < self.H and 0 <= c < self.W:
            return bool(m[r, c])
        return False

    def polys(self, m, eps=0.35, min_area=12.0, open_px=0):
        if open_px:
            m = ndi.binary_opening(m, iterations=open_px)
        mm = np.pad(m.astype(float), 1)
        out = []
        for c in measure.find_contours(mm, 0.5):
            p = np.stack([(c[:, 1] - 1) * self.res + self.x0, (c[:, 0] - 1) * self.res + self.y0], 1)
            if abs(area(p)) < min_area:
                continue
            p = rdp(p, eps)
            if len(p) > 3 and np.allclose(p[0], p[-1]):
                p = p[:-1]
            out.append(orient(p))
        out.sort(key=lambda q: -abs(area(q)))
        return out

    def poly1(self, m, **kw):
        ps = self.polys(m, **kw)
        return ps[0] if ps else None


def outward_lit(pts, grid, mask, probe=6.0, invert=False, sigma=4):
    """Per-point lit factor (dot of outward normal with TO_LIGHT) for a stroke bounding `mask`."""
    p = A(pts)
    n = normals(p)
    lit = np.zeros(len(p))
    for i, (q, v) in enumerate(zip(p, n)):
        a = grid.inside(mask, *(q + v * probe))
        b = grid.inside(mask, *(q - v * probe))
        if a and not b:
            out = -v
        elif b and not a:
            out = v
        else:
            out = None
        lit[i] = np.nan if out is None else float(np.dot(out, TO_LIGHT))
    # fill gaps (points where the side test was ambiguous)
    good = ~np.isnan(lit)
    if good.sum() == 0:
        return np.zeros(len(p))
    idx = np.arange(len(p))
    lit = np.interp(idx, idx[good], lit[good])
    if invert:
        lit = -lit
    return smooth(lit, sigma)


def r1(x):
    """Round nested coordinates for JSON output."""
    if isinstance(x, np.ndarray):
        x = x.tolist()
    if isinstance(x, (list, tuple)):
        return [r1(v) for v in x]
    if isinstance(x, float):
        return round(x, 1)
    return x


def r2(v):
    return [round(float(x), 2) for x in v]


def band_var(grid, p, widths, step=1.5):
    """Buffer a polyline with a width that varies along it (array of widths, resampled to fit)."""
    q = resample(p, step)
    w = np.interp(np.linspace(0, 1, len(q)), np.linspace(0, 1, len(widths)), widths)
    m = grid.empty()
    n = normals(q)
    for i in range(len(q) - 1):
        a, b = q[i], q[i + 1]
        ra, rb = w[i] / 2, w[i + 1] / 2
        quad = np.array([a + n[i] * ra, b + n[i + 1] * rb, b - n[i + 1] * rb, a - n[i] * ra])
        rr, cc = skdraw.polygon((quad[:, 1] - grid.y0) / grid.res, (quad[:, 0] - grid.x0) / grid.res, m.shape)
        m[rr, cc] = True
        if ra > 0.3:
            rr, cc = skdraw.disk(((a[1] - grid.y0) / grid.res, (a[0] - grid.x0) / grid.res), ra / grid.res, shape=m.shape)
            m[rr, cc] = True
    return m
