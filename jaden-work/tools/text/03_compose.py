"""Step 3: compose skeleton segments into pen strokes (writing order + direction).

The per-letter composition below was hand-authored against the numbered
segment debug images (extract/text/_work/seg_*.png).  Segment ids refer to
extract/text/_work/graph.json produced by 02_skeleton.py.

Writes extract/text/text.strokes.json and extract/text/text.svg.
"""
import json, math
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

W = '/Users/jasper/Code/jagilley.github.io/jaden-work'
OUT = f'{W}/extract/text'
WORK = f'{OUT}/_work'
meta = json.load(open(f'{WORK}/meta.json'))
G = json.load(open(f'{WORK}/graph.json'))
_z = np.load(f'{WORK}/edt_crop.npz')
edt = np.zeros((meta['size'][1], meta['size'][0]), np.float32)
_ox, _oy = _z['off']
edt[_oy:_oy + _z['edt'].shape[0], _ox:_ox + _z['edt'].shape[1]] = _z['edt']
ink = np.asarray(Image.open(f'{WORK}/ink_full.png')) > 0

SP = meta['spacing_px']            # px per ruled-line spacing
U = 100.0 / SP                     # units per px
MARGIN = 40.0 / U                  # 40 units in px
bx0, by0, bx1, by1 = meta['bbox']
X0 = int(round(bx0 - MARGIN)); Y0 = int(round(by0 - MARGIN))
X1 = int(round(bx1 + MARGIN)); Y1 = int(round(by1 + MARGIN))
VBW = round((X1 - X0) * U, 1); VBH = round((Y1 - Y0) * U, 1)

NODES = {int(k): np.array(v, float) for k, v in G['nodes'].items()}
EDGES = G['edges']
deg = {}
for e in EDGES:
    deg[e['a']] = deg.get(e['a'], 0) + 1
    deg[e['b']] = deg.get(e['b'], 0) + 1
JUNC = {n for n, d in deg.items() if d >= 3}
R_PEN = float(np.median(np.concatenate([e['r'] for e in EDGES])))


def bilinear(img, x, y):
    return ndi.map_coordinates(img, [np.atleast_1d(y), np.atleast_1d(x)], order=1, mode='nearest')


def rho(n):
    x, y = NODES[n]
    r = float(bilinear(edt, x, y)[0])
    return float(np.clip(1.2 * r + 2, 12, 22))


def cum(p):
    return np.concatenate([[0], np.cumsum(np.hypot(*np.diff(p, axis=0).T))])


def resample(p, step):
    s = cum(p)
    if s[-1] < 1e-6:
        return p[:1].copy()
    n = max(1, int(round(s[-1] / step)))
    t = np.linspace(0, s[-1], n + 1)
    return np.stack([np.interp(t, s, p[:, 0]), np.interp(t, s, p[:, 1])], 1)


def P(x):
    if isinstance(x, (int, np.integer)):
        return NODES[int(x)]
    return np.array(x, float)


def nearest(p, q):
    return int(np.argmin(np.hypot(p[:, 0] - q[0], p[:, 1] - q[1])))


class X:
    """A hand-placed anchor point (photo px), joined to its neighbours by straight lines.
    Used for small lead-in hooks the skeleton pruning removed."""
    def __init__(self, xy):
        self.xy = np.array(xy, float)
        self.i = None

    def nodes(self):
        return set()

    def pts(self, prev_end=None):
        return self.xy[None, :].copy()


class E:
    """One skeleton segment (or part of it) inside a stroke.
    frm/to: node id or (x, y) — cut/orient points.  rot: 'cw'/'ccw' for loops
    (visual sense, y down).  side: +1/-1 offsets a retraced line toward +x/-x
    by the excess ink width (narrow down-and-up loops)."""
    def __init__(self, i, frm=None, to=None, rot=None, side=0):
        self.i, self.frm, self.to, self.rot, self.side = i, frm, to, rot, side

    def nodes(self):
        e = EDGES[self.i]
        return {e['a'], e['b']}

    def pts(self, prev_end=None):
        e = EDGES[self.i]
        p = np.array(e['pts'], float)
        if e['a'] == e['b']:                      # closed loop
            if np.hypot(*(p[0] - p[-1])) < 3:
                p = p[:-1]
            x, y = p[:, 0], p[:, 1]
            S = np.sum(x * np.roll(y, -1) - np.roll(x, -1) * y)
            is_cw = S > 0                         # y-down: positive = visually clockwise
            assert self.rot in ('cw', 'ccw'), f'loop {self.i} needs rot'
            if (self.rot == 'cw') != is_cw:
                p = p[::-1]
            f = P(self.frm) if self.frm is not None else P(e['a'])
            k = nearest(p, f)
            p = np.roll(p, -k, axis=0)
            p = np.vstack([p, p[:1]])
            if self.to is not None:
                kt = nearest(p[1:], P(self.to)) + 1
                p = p[:kt + 1]
        else:
            if self.frm is not None and self.to is not None:
                i0, i1 = nearest(p, P(self.frm)), nearest(p, P(self.to))
                p = p[i0:i1 + 1] if i0 <= i1 else p[i1:i0 + 1][::-1]
            elif self.frm is not None:
                F = P(self.frm)
                if np.hypot(*(p[0] - F)) > np.hypot(*(p[-1] - F)):
                    p = p[::-1]
            elif self.to is not None:
                T = P(self.to)
                if np.hypot(*(p[-1] - T)) > np.hypot(*(p[0] - T)):
                    p = p[::-1]
            elif prev_end is not None:
                if np.hypot(*(p[-1] - prev_end)) < np.hypot(*(p[0] - prev_end)):
                    p = p[::-1]
        p = resample(p, 1.0)
        if self.side:
            p = offset(p, self.side)
        return p


def offset(p, side):
    """Shift a retraced line sideways by the ink width in excess of one pen line."""
    if len(p) < 5:
        return p
    ps = ndi.gaussian_filter1d(p, 4, axis=0, mode='nearest')
    t = np.gradient(ps, axis=0)
    t /= np.maximum(np.hypot(t[:, 0], t[:, 1])[:, None], 1e-9)
    n = np.stack([-t[:, 1], t[:, 0]], 1)
    if n[:, 0].mean() < 0:
        n = -n
    r = bilinear(edt, p[:, 0], p[:, 1])
    d = np.clip(r - R_PEN, 0, 0.9 * R_PEN)
    d = ndi.gaussian_filter1d(d, 5, mode='nearest')
    s = cum(p)
    taper = np.clip(np.minimum(s, s[-1] - s) / 18.0, 0, 1)
    return p + side * (d * taper)[:, None] * n


def tangent_back(p, i, L=14):
    """unit direction arriving at p[i] (from ~L px earlier)."""
    s = cum(p[:i + 1])
    j = int(np.searchsorted(s, s[-1] - L))
    j = min(max(j, 0), i - 1) if i > 0 else 0
    v = p[i] - p[j]
    n = np.hypot(*v)
    return v / n if n > 1e-9 else np.array([1.0, 0])


def tangent_fwd(p, i, L=14):
    s = cum(p[i:])
    j = i + int(np.searchsorted(s, L))
    j = min(j, len(p) - 1)
    v = p[j] - p[i]
    n = np.hypot(*v)
    return v / n if n > 1e-9 else np.array([1.0, 0])


def hermite(a, b, ta, tb, k=1.0):
    c = np.hypot(*(b - a)) * k
    m0, m1 = ta * c, tb * c
    n = max(2, int(np.hypot(*(b - a))))
    t = np.linspace(0, 1, n + 1)[1:-1, None]
    h00 = 2 * t**3 - 3 * t**2 + 1; h10 = t**3 - 2 * t**2 + t
    h01 = -2 * t**3 + 3 * t**2; h11 = t**3 - t**2
    return h00 * a + h10 * m0 + h01 * b + h11 * m1


def build(items, gap_ok=60):
    """Chain items, then rebuild junction zones with smooth pass-through curves."""
    segs = []
    prev = None
    for it in items:
        p = it.pts(prev)
        if prev is not None:
            g = np.hypot(*(p[0] - prev))
            assert g < gap_ok, f'gap {g:.0f}px before edge {it.i}'
            if g > 1.5:                     # bridge a small gap straight
                segs.append(resample(np.vstack([prev, p[0]]), 1.0)[1:-1])
            p = p[1:] if g < 0.5 else p
        segs.append(p)
        prev = segs[-1][-1]
    pts = np.vstack([s for s in segs if len(s)])

    def free_end(it, q):
        # a real pen-down/pen-up point: a skeleton endpoint or a hand anchor
        if isinstance(it, X):
            return True
        return any(deg.get(n) == 1 and np.hypot(*(NODES[n] - q)) < 3 for n in it.nodes())
    ext = (free_end(items[0], pts[0]), free_end(items[-1], pts[-1]))
    # junction zones touched by this stroke
    used = set()
    for it in items:
        used |= it.nodes()
    zn = [n for n in used if n in JUNC]
    if not zn:
        return pts, ext
    inz = np.zeros(len(pts), bool)
    for n in zn:
        inz |= np.hypot(pts[:, 0] - NODES[n][0], pts[:, 1] - NODES[n][1]) < rho(n)
    ext = (ext[0] and not inz[0], ext[1] and not inz[-1])
    out = []
    i = 0
    N = len(pts)
    while i < N:
        if not inz[i]:
            out.append(pts[i:i + 1]); i += 1; continue
        j = i
        while j + 1 < N and inz[j + 1]:
            j += 1
        if i == 0 and j == N - 1:
            out.append(pts[i:j + 1])
        elif i == 0:                                  # stroke starts in a junction
            Ex = pts[j + 1]; T1 = tangent_fwd(pts, j + 1)
            A = pts[0]
            ch = Ex - A
            T0 = ch / max(np.hypot(*ch), 1e-9)
            out.append(A[None, :])
            out.append(hermite(A, Ex, T0, T1, k=0.6))
        elif j == N - 1:                              # stroke ends in a junction
            S = pts[i - 1]; T0 = tangent_back(pts, i - 1)
            B = pts[-1]
            ch = B - S
            T1 = ch / max(np.hypot(*ch), 1e-9)
            out.append(hermite(S, B, T0, T1, k=0.6))
            out.append(B[None, :])
        else:
            S, Ex = pts[i - 1], pts[j + 1]
            T0, T1 = tangent_back(pts, i - 1), tangent_fwd(pts, j + 1)
            ang = math.degrees(math.acos(np.clip(np.dot(T0, T1), -1, 1)))
            if ang > 140:                             # genuine reversal: keep it
                out.append(pts[i:j + 1])
            else:
                out.append(hermite(S, Ex, T0, T1))
        i = j + 1
    return np.vstack(out), ext


def cusps(p, lag=10, thr=118):
    """indices of sharp reversals (kept sharp when smoothing)."""
    N = len(p)
    ang = np.zeros(N)
    for i in range(lag, N - lag):
        a = p[i] - p[i - lag]; b = p[i + lag] - p[i]
        na, nb = np.hypot(*a), np.hypot(*b)
        if na > 1e-6 and nb > 1e-6:
            ang[i] = math.degrees(math.acos(np.clip(np.dot(a, b) / na / nb, -1, 1)))
    idx = []
    for i in range(lag, N - lag):
        if ang[i] > thr and ang[i] == ang[max(0, i - lag):i + lag + 1].max():
            if not idx or i - idx[-1] > lag:
                idx.append(i)
    return idx


def smooth_piece(p, sigma=3.0):
    if len(p) < 4:
        return p
    # odd reflection keeps the endpoint position and direction
    pad = int(3 * sigma) + 1
    pad = min(pad, len(p) - 1)
    head = 2 * p[0] - p[1:pad + 1][::-1]
    tail = 2 * p[-1] - p[-pad - 1:-1][::-1]
    q = np.vstack([head, p, tail])
    q = ndi.gaussian_filter1d(q, sigma, axis=0, mode='nearest')
    return q[pad:pad + len(p)]


STEP_U = 3.0  # sample spacing in units


CUSP_LOG = []


def ink_run(p0, v, maxd=60):
    """distance from p0 along unit v until leaving the ink mask."""
    for t in range(0, maxd):
        x, y = p0 + v * t
        xi, yi = int(round(x)), int(round(y))
        if not (0 <= yi < ink.shape[0] and 0 <= xi < ink.shape[1]) or not ink[yi, xi]:
            return float(t)
    return float(maxd)


def extend_tips(p, wpx, ends=(True, True)):
    """Push stroke ends and reversal tips out to the ink boundary (less the pen
    radius), so round caps reach where the ink actually stops."""
    cap = 1.3 * wpx
    out = p
    if ends[0] and len(p) > 8:
        v = p[0] - p[min(8, len(p) - 1)]; v /= max(np.hypot(*v), 1e-9)
        e = min(ink_run(p[0], v) - wpx / 2, cap)
        if e > 1:
            out = np.vstack([resample(np.vstack([p[0] + v * e, p[0]]), 1.0)[:-1], out])
    if ends[1] and len(p) > 8:
        v = p[-1] - p[max(-9, -len(p))]; v /= max(np.hypot(*v), 1e-9)
        e = min(ink_run(p[-1], v) - wpx / 2, cap)
        if e > 1:
            out = np.vstack([out, resample(np.vstack([p[-1], p[-1] + v * e]), 1.0)[1:]])
    q = resample(out, 1.0)
    cs = cusps(q)
    for c in cs:
        CUSP_LOG.append((int(q[c][0]), int(q[c][1])))
    if not cs:
        return q
    pieces = []
    last = 0
    for c in cs:
        a = q[c] - q[max(c - 8, 0)]; b = q[min(c + 8, len(q) - 1)] - q[c]
        a /= max(np.hypot(*a), 1e-9); b /= max(np.hypot(*b), 1e-9)
        v = a - b
        nv = np.hypot(*v)
        pieces.append(q[last:c])
        e = min(ink_run(q[c], v / nv) - wpx / 2, cap) if nv > 1e-6 else 0
        if e > 1:
            tip = q[c] + v / nv * e
            pieces.append(resample(np.vstack([q[c], tip]), 1.0))
            pieces.append(resample(np.vstack([tip, q[c]]), 1.0)[1:-1])
        last = c
    pieces.append(q[last:])
    return resample(np.vstack(pieces), 1.0)


def finish(dense, is_dot=False, ends=(True, True)):
    p = resample(dense, 1.0)
    wpx = 2 * float(np.median(bilinear(edt, p[:, 0], p[:, 1])))
    wpx = min(wpx, 2 * R_PEN * 1.1)
    p = extend_tips(p, wpx, ends)
    cs = cusps(p)
    bounds = [0] + cs + [len(p) - 1]
    pieces = []
    for a, b in zip(bounds[:-1], bounds[1:]):
        q = smooth_piece(p[a:b + 1], 2.5 if is_dot else 3.0)
        q = resample(q, STEP_U / U)
        pieces.append(q if not pieces else q[1:])
    q = np.vstack(pieces)
    r = bilinear(edt, q[:, 0], q[:, 1])
    w = 2 * r
    med = float(np.median(w))
    w = np.clip(w, 0.75 * med, 1.2 * med)
    w = ndi.gaussian_filter1d(w, 1.2, mode='nearest') if len(w) > 3 else w
    return q, w, len(cs)


def dot_capsule(seed, hint, minlen_u=1.5):
    """A dot as a tiny stroke along the blob's major axis."""
    lab, _ = ndi.label(ink, structure=np.ones((3, 3)))
    sx, sy = P(seed)
    yy, xx = np.nonzero(ink[int(sy) - 40:int(sy) + 40, int(sx) - 40:int(sx) + 40])
    cand = lab[int(sy) - 40 + yy, int(sx) - 40 + xx]
    ids, cnt = np.unique(cand[cand > 0], return_counts=True)
    L = ids[np.argmax(cnt)]
    ys, xs = np.nonzero(lab == L)
    c = np.array([xs.mean(), ys.mean()])
    X = np.stack([xs, ys], 1) - c
    ev, evec = np.linalg.eigh(np.cov(X.T))
    v = evec[:, 1]; n = evec[:, 0]
    if np.dot(v, hint) < 0:
        v = -v
    a = X @ v; b = X @ n
    lo, hi = np.percentile(a, [1, 99]); blo, bhi = np.percentile(b, [2, 98])
    D = (bhi - blo) + 1.0
    half = max((hi - lo + 1 - D) / 2, minlen_u / U / 2)
    mid = c + v * (lo + hi) / 2
    p0, p1 = mid - v * half, mid + v * half
    n_s = max(1, int(round(np.hypot(*(p1 - p0)) * U / 2.0)))
    q = np.stack([np.linspace(p0[0], p1[0], n_s + 1), np.linspace(p0[1], p1[1], n_s + 1)], 1)
    return q, np.full(len(q), D)


# ---------------------------------------------------------------------------
# Hand-authored composition, in writing order.
# (line, word, char, k, items | ('dot', seed, hint) , is_dot)
# ---------------------------------------------------------------------------
P_b_bot = (3024, 1462)      # bottom of b's stem
P_a1_tr = (1995, 1366)      # top-right of the a in "Happy"
P_a2_tr = (2151, 1847)      # top-right of the a in "Jaden"
P_n_v = (2879, 1870)        # skeleton V at the foot of the n (stem goes lower)
P_r_top = (3379, 1352)      # top of r's stem (arch starts here)
P_p2_top = (2332, 1355)     # top of 2nd p's stem
P_a3_tr = (4178, 1262)      # top-right of the a in "day"
P_d1_bot = (4041, 1358)     # bottom of d's stem (birthday)
P_d2_bot = (2465, 1893)     # bottom of d's stem (Jaden)

SPEC = [
    # ---- line 1: Happy ----
    (1, 'happy', 'H', 0, [E(1, frm=75), E(0)]),
    (1, 'happy', 'H', 1, [E(3, frm=1), E(4)]),
    (1, 'happy', 'H', 2, [E(2, frm=21)]),
    # a: lead-in upstroke from the lower right to the peak, bowl CCW, then the stem
    (1, 'happy', 'a', 0, [X((2022, 1395)), X((1993, 1357)), E(5, rot='ccw', frm=(1978, 1360), to=23),
                          E(6, frm=23)]),
    (1, 'happy', 'p', 0, [X((2142, 1386)), X((2150, 1361)), E(7, frm=59), E(8, to=62, side=-1), E(8, frm=62, side=+1),
                          E(9, frm=42), E(10, rot='cw', frm=30)]),
    (1, 'happy', 'p', 0, [X((2323, 1350)), E(11, frm=(2331, 1375), to=82, side=-1), E(11, frm=82, to=P_p2_top, side=+1),
                          E(11, frm=P_p2_top, to=13)]),
    (1, 'happy', 'y', 0, [E(12, frm=96)]),
    # ---- line 1: birthday, ----
    (1, 'birthday', 'b', 0, [E(13, frm=77), E(14, rot='ccw', frm=35, to=P_b_bot, side=-1),
                             E(14, rot='cw', frm=P_b_bot, to=35, side=+1),
                             E(14, rot='cw', frm=35, to=P_b_bot)]),
    (1, 'birthday', 'i', 0, [E(17, frm=40)]),
    (1, 'birthday', 'i', 1, [E(16, frm=50)], True),
    (1, 'birthday', 'r', 0, [X((3373, 1339)), E(18, frm=(3376, 1372), to=64, side=-1),
                             E(18, frm=64, to=P_r_top, side=+1), E(18, frm=P_r_top, to=69)]),
    (1, 'birthday', 't', 0, [E(23, frm=63), E(22), E(20)]),
    (1, 'birthday', 'th', 0, [E(21, frm=46), E(22), E(24), E(27, frm=41),
                              E(28, rot='ccw', frm=4, to=(3733, 1098)), X((3721, 1082)),
                              E(28, rot='ccw', frm=(3714, 1100), to=4), E(27, frm=4),
                              E(26, frm=41, to=(3723, 1376)), X((3740, 1366)), E(26, frm=(3727, 1360), to=68)]),
    (1, 'birthday', 'd', 0, [E(29, rot='ccw', frm=8, to=P_d1_bot)]),
    (1, 'birthday', 'd', 1, [E(30, frm=79), X((4047, 1360))]),
    (1, 'birthday', 'a', 0, [X((4179, 1249)), E(31, rot='ccw', frm=(4165, 1251), to=P_a3_tr), X((4179, 1249)),
                             E(31, rot='cw', frm=P_a3_tr, to=60),
                             E(32, frm=60)]),
    (1, 'birthday', 'y', 0, [E(34, frm=76), E(35, frm=47, to=(4366, 1246)), X((4370, 1234)),
                             E(35, frm=(4379, 1256), to=28), E(36, frm=28),
                             E(33, rot='cw', frm=29), E(36, frm=29), E(37, frm=28)]),
    (1, 'birthday', ',', 0, [E(38, frm=65)]),
    # ---- line 2: Jaden ----
    (2, 'jaden', 'J', 0, [X((1810, 1759)), X((1822, 1723)), E(40, frm=(1840, 1745), to=38)]),
    (2, 'jaden', 'J', 1, [X((1726, 1692)), E(39, frm=2)]),   # lead-in hook at the left end
    # a: lead-in tick below the junction, up the right side, bowl CCW, then the stem
    (2, 'jaden', 'a', 0, [X((2148, 1912)), E(41, rot='ccw', frm=24), E(42, frm=24)]),
    (2, 'jaden', 'd', 0, [E(43, rot='ccw', frm=51, to=P_d2_bot)]),
    (2, 'jaden', 'd', 1, [E(44, frm=84), X((2470, 1896))]),
    (2, 'jaden', 'e', 0, [E(45, frm=89)]),
    (2, 'jaden', 'n', 0, [E(46, frm=10, to=P_n_v), X((2873, 1884)), E(46, frm=P_n_v, to=(2934, 1766)),
                          X((2945, 1748)), E(46, frm=(2952, 1767), to=58)]),
    # ---- line 2: !!! ----
    (2, 'bang', '!', 0, [E(15, frm=17)]),
    (2, 'bang', '!', 1, ('dot', 93, (1, -0.6)), True),
    (2, 'bang', '!', 0, [E(19, frm=45)]),
    (2, 'bang', '!', 1, ('dot', 88, (1, -0.6)), True),
    (2, 'bang', '!', 0, [E(25, frm=78)]),
    (2, 'bang', '!', 1, ('dot', 53, (1, -0.6)), True),
]

SLUG = {'!': 'excl', ',': 'comma'}
strokes = []
used_edges = set()
for n, row in enumerate(SPEC, start=1):
    line, word, ch, k, items = row[:5]
    is_dot = len(row) > 5 and row[5]
    if isinstance(items, tuple) and items[0] == 'dot':
        q, w = dot_capsule(items[1], np.array(items[2], float))
        ncusp = 0
    else:
        dense, ext = build(items)
        q, w, ncusp = finish(dense, is_dot, ext)
        used_edges |= {it.i for it in items if it.i is not None}
    pts = [[round(float(x - X0) * U, 1), round(float(y - Y0) * U, 1), round(float(ww) * U, 1)]
           for (x, y), ww in zip(q, w)]
    sid = f's{n:02d}-{word}-{SLUG.get(ch, ch)}{k}'
    strokes.append({'id': sid, 'line': line, 'word': word, 'char': ch, 'k': k,
                    'dot': bool(is_dot), 'pts': pts})
    print(f'{sid:22s} pts {len(pts):3d} cusps {ncusp} w~{np.median(w) * U:.1f}u', CUSP_LOG)
    CUSP_LOG.clear()

unused = [e['id'] for e in EDGES if e['id'] not in used_edges and e['id'] not in (47, 48, 49)]
print('unused edges:', unused)

# words / baselines
words = {}
for s in strokes:
    a = np.array(s['pts'])
    lo = (a[:, :2] - a[:, 2:3] / 2).min(0); hi = (a[:, :2] + a[:, 2:3] / 2).max(0)
    if s['word'] in words:
        o = words[s['word']]
        lo = np.minimum(lo, o[0]); hi = np.maximum(hi, o[1])
    words[s['word']] = (lo, hi)
words_out = {k: [round(float(v[0][0]), 1), round(float(v[0][1]), 1), round(float(v[1][0] - v[0][0]), 1),
                 round(float(v[1][1] - v[0][1]), 1)] for k, v in words.items()}


def bottoms(word, chars):
    """(x, y) of the lowest point of each non-descending letter stroke."""
    out = []
    for st in strokes:
        if st['word'] == word and st['char'] in chars and not st['dot']:
            q = max(st['pts'], key=lambda p: p[1])
            out.append((q[0], q[1]))
    return out


def baseline(pts, x_lo, x_hi):
    a = np.array(pts)
    m, c = np.polyfit(a[:, 0], a[:, 1], 1)
    return {'y': round(float(np.median(a[:, 1])), 1),
            'line': [[round(x_lo, 1), round(m * x_lo + c, 1)], [round(x_hi, 1), round(m * x_hi + c, 1)]]}

# the writing climbs to the right, so give a fitted baseline segment as well as a median y
w1 = [words_out['happy'], words_out['birthday']]
w2 = [words_out['jaden'], words_out['bang']]
baselines = {
    '1': baseline(bottoms('happy', 'Ha') + bottoms('birthday', 'birda'),
                  w1[0][0], w1[1][0] + w1[1][2]),
    '2': baseline(bottoms('jaden', 'aden'), w2[0][0], w2[1][0] + w2[1][2]),
}

doc = {'figure': 'text', 'unit': '100 = one ruled-line spacing',
       'spacing_px': round(SP, 2), 'viewBox': [0, 0, VBW, VBH],
       'text': 'Happy birthday, / Jaden!!!',
       'crop_px': [X0, Y0, X1, Y1],
       'baselines': baselines, 'words': words_out, 'strokes': strokes}


def dump(doc):
    # compact: one stroke per line, points inline
    head = {k: v for k, v in doc.items() if k != 'strokes'}
    s = json.dumps(head, separators=(',', ':'))[:-1] + ',"strokes":[\n'
    s += ',\n'.join(json.dumps(st, separators=(',', ':')) for st in doc['strokes'])
    return s + '\n]}\n'

open(f'{OUT}/text.strokes.json', 'w').write(dump(doc))


# ---------------------------------------------------------------------------
# SVG: Catmull-Rom -> cubic Bezier, kept sharp at cusps
# ---------------------------------------------------------------------------
def f1(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


def sharp_idx(a, thr=110):
    idx = set()
    for i in range(1, len(a) - 1):
        u = a[i] - a[i - 1]; v = a[i + 1] - a[i]
        nu, nv = np.hypot(*u), np.hypot(*v)
        if nu > 1e-6 and nv > 1e-6 and math.degrees(math.acos(np.clip(np.dot(u, v) / nu / nv, -1, 1))) > thr:
            idx.add(i)
    return idx


def path_d(pts):
    a = np.array([p[:2] for p in pts], float)
    if len(a) == 1:
        return f'M{f1(a[0][0])} {f1(a[0][1])}h0.1'
    if len(a) == 2:
        return f'M{f1(a[0][0])} {f1(a[0][1])}L{f1(a[1][0])} {f1(a[1][1])}'
    sh = sharp_idx(a)
    d = [f'M{f1(a[0][0])} {f1(a[0][1])}']
    n = len(a)
    for i in range(n - 1):
        p0 = a[i - 1] if i > 0 and i not in sh else a[i]
        p1, p2 = a[i], a[i + 1]
        p3 = a[i + 2] if i + 2 < n and (i + 1) not in sh else a[i + 1]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f'C{f1(c1[0])} {f1(c1[1])} {f1(c2[0])} {f1(c2[1])} {f1(p2[0])} {f1(p2[1])}')
    return ''.join(d)


lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f1(VBW)} {f1(VBH)}" '
         f'width="{f1(VBW)}" height="{f1(VBH)}">',
         '<!-- "Happy birthday, / Jaden!!!" - centerline pen strokes in writing order. '
         '100 units = one ruled-line spacing. -->',
         '<g fill="none" stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round">']
cur = None
for s in strokes:
    if s['word'] != cur:
        if cur is not None:
            lines.append('</g>')
        lines.append(f'<g id="w-{s["word"]}">')
        cur = s['word']
    sw = float(np.median([p[2] for p in s['pts']]))
    ch = s['char'].replace('&', '&amp;').replace('"', '&quot;')
    dot = ' data-dot="1"' if s['dot'] else ''
    lines.append(f'<path id="{s["id"]}" data-char="{ch}" data-k="{s["k"]}"{dot} '
                 f'stroke-width="{f1(sw)}" d="{path_d(s["pts"])}"/>')
lines.append('</g>')
lines.append('</g>')
lines.append('</svg>')
open(f'{OUT}/text.svg', 'w').write('\n'.join(lines) + '\n')
print('viewBox', VBW, VBH, 'crop', X0, Y0, X1, Y1, 'baselines', baselines)
print('words', words_out)
