"""Build resources/jaden/bg.style.js: the sparse paper-world background, as pencil figures.

    jaden-work/venv/bin/python jaden-work/tools/bg/build_bg.py

World convention: the figures stand on y = 0, centred on x = 0 (box ~715 wide, ~680 tall; ball r ~403).
Everything here is authored in the same units as Jasper's figures (100 = one ruled line, pen ~7).
Elements that move as one piece (sun, clouds, trees) are authored in a local frame around an anchor and
placed by layout.place; the land (horizon, hills, grass, sky marks, dusk wash) is authored in world units.
"""
import json
import math
from pathlib import Path

import numpy as np

import hand as H
from hand import geom

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "resources" / "jaden" / "bg.style.js"

PALETTE = {
    "paper": "#f3eee3", "graphite": "#3a3532", "blue": "#7aa6dc", "red": "#d4574d",
    # golden hour
    "sun": "#f8c56a", "sunShade": "#f2995a",
    "hill": "#aec192", "hillShade": "#86a07e",
    "hillFar": "#b2c2b0", "hillFarShade": "#95aaa6",
    "cloud": "#f3eee3", "cloudShade": "#c8c1dc",
    "tree": "#93b083", "treeShade": "#62815f",
    "grass": "#a7c784",
    "skyBlue": "#a9cbee", "skyPeach": "#f7cba0",
    # dusk (Vice City / the logo's sunset)
    "duskGold": "#f8cf8e", "duskOrange": "#f5ac82", "duskPink": "#f0a0c2",
    "duskViolet": "#b7a0dc", "duskIndigo": "#a497d6", "duskCloud": "#ec9fc4", "duskHill": "#b3a4cf",
}

TO_LIGHT = H.LIGHT


def r1(a):
    """coordinates to whole units (visually lossless at a 4-7 unit pen and a ~1 unit boil)"""
    a = np.asarray(a, float)
    return np.rint(a).astype(int).tolist()


def rpts(q, w):
    """stroke points [x, y, w]: whole-unit coordinates, pen width to 0.1"""
    return [[int(round(x)), int(round(y)), round(float(v), 1)] for (x, y), v in zip(np.asarray(q, float), w)]


class Fig:
    """Accumulates one pencil figure in the style-data format of style/README.md."""

    def __init__(self, name, ds, pen=1700, anchor=(0, 0)):
        self.name, self.ds, self.pen, self.anchor = name, ds, pen, anchor
        self.strokes, self.lines, self.extra, self.second = [], {}, [], []
        self.regions, self.order, self.shadows, self.marks, self.cons = {}, [], [], [], []
        self.groups = {}
        self.meta = {}
        self.occluders = []
        self.accents = {}

    def group(self, name, pivot=(0, 0), parent=None):
        self.groups[name] = {"parent": parent, "pivot": r1(list(pivot))}

    def stroke(self, sid, q, w, group, weight=None, taper=(6, 18), tip=(0.5, 0.14), land=0.2, level=0.7,
               breaks=None, fade=None, closed=False, hidden=False, width=None):
        q = np.asarray(q, float)
        pts = rpts(q, w)
        hint = {"group": group, "taper": list(taper), "tip": list(tip), "level": level}
        if weight is not None:
            hint["weight"] = [round(float(v), 2) for v in weight]
        if land:
            hint["land"] = land
        if breaks:
            hint["breaks"] = breaks
        if fade:
            hint["fade"] = fade
        if width:
            hint["width"] = width
        if hidden:
            self.extra.append(dict({"id": sid, "pts": pts, "hidden": True}, **hint))
        else:
            self.strokes.append({"id": sid, "group": group, "closed": closed, "pts": pts})
            self.lines[sid] = hint

    def region(self, name, polys, group, color, shade=None, **kw):
        polys = [geom.orient(geom.rdp(np.asarray(p, float), 0.5)) for p in polys]
        d = {"group": group, "color": color, "shade": shade or color, "polys": [r1(p) for p in polys]}
        d.update(kw)
        self.regions[name] = d
        self.order.append(name)

    def shadow(self, sid, group, polys=None, on=(), hatch=None, tone=None, passes=None, edge=None, **kw):
        d = {"id": sid, "group": group, "on": list(on), "edge": [r1(e) for e in (edge or [])]}
        d["polys"] = [r1(geom.orient(geom.rdp(np.asarray(p, float), 0.5))) for p in (polys or [])]
        if hatch:
            d["hatch"] = hatch
        if tone:
            d["tone"] = tone
        if passes:
            d["passes"] = [{"pts": r1(p), "width": w} for p, w in passes]
        d.update(kw)
        self.shadows.append(d)

    def mark(self, pts, group, width=2.3, level=0.4, color="red", taper=(10, 16)):
        self.marks.append({"group": group, "pts": r1(pts), "width": width, "level": level, "color": color,
                           "taper": list(taper)})

    def construction(self, pts, group, level=0.34, width=2.5, taper=(24, 34)):
        self.cons.append({"group": group, "pts": r1(pts), "level": level, "width": width, "taper": list(taper)})

    def accent_pass(self, set_, name, pts, color, width, level=0.8, taper=(10, 60)):
        """a marker pass drawn as a Pencil accent: one tooth-textured, multiplied path, drawn on by
        accentAmount within its span (spans are assigned in order, in proportion to length)"""
        self.accents.setdefault(set_, []).append({"group": name, "color": color, "level": level,
                                                  "width": round(float(width), 1), "taper": list(taper),
                                                  "pts": r1(pts)})

    def finish_spans(self, set_, gap=0.012):
        A = self.accents.get(set_, [])
        L = [float(geom.cumlen(np.asarray(a["pts"], float))[-1]) for a in A]
        tot = sum(L) + gap * sum(L) * (len(A) - 1)
        t = 0.0
        for a, l in zip(A, L):
            a["span"] = [round(t / tot, 4), round((t + l) / tot, 4)]
            t += l + gap * sum(L)
        A[-1]["span"][1] = 1.0
        self.meta["accentSet"] = set_
        seen = []
        for a in A:
            if a["group"] not in seen:
                seen.append(a["group"])
        self.meta["washOrder"] = seen

    def bounds(self, pad=24):
        xs, ys = [], []

        def eat(pts):
            for p in pts:
                xs.append(p[0])
                ys.append(p[1])
        for s in self.strokes + self.extra:
            eat(s["pts"])
        for r in self.regions.values():
            for p in r["polys"]:
                eat(p)
        for s in self.shadows:
            for p in s["polys"]:
                eat(p)
            for e in s["edge"]:
                eat(e)
            for ps in s.get("passes", []):
                eat([[x - ps["width"], y - ps["width"]] for x, y in ps["pts"]])
                eat([[x + ps["width"], y + ps["width"]] for x, y in ps["pts"]])
        for m in self.marks + self.cons:
            eat(m["pts"])
        for A in self.accents.values():
            for a in A:
                w = a["width"]
                eat([[x - w, y - w] for x, y in a["pts"]])
                eat([[x + w, y + w] for x, y in a["pts"]])
        return [round(min(xs) - pad), round(min(ys) - pad), round(max(xs) + pad), round(max(ys) + pad)]

    def js(self):
        style = {
            "figure": self.name, "bounds": self.bounds(), "anchor": list(self.anchor), "designSeed": self.ds,
            "palette": PALETTE, "groups": self.groups, "lines": self.lines, "extraStrokes": self.extra,
            "second": self.second, "regions": self.regions, "regionOrder": self.order, "shadows": self.shadows,
            "highlights": [], "marks": self.marks, "construction": self.cons, "occluders": self.occluders,
            "penSpeed": self.pen,
        }
        if self.accents:
            style["accents"] = self.accents
        style.update(self.meta)
        return {"strokes": {"figure": self.name, "unit": "100 = one ruled-line spacing", "strokes": self.strokes},
                "style": style}


# ----------------------------------------------------------------------------- helpers
def rot_weight(q, seed, lo=0.86, hi=1.1):
    """slow random line weight for strokes with no lit side (horizon)"""
    n = geom.noise1d(len(q), seed * 17 + 5, 140 / 3.0, octaves=1)
    return np.interp(n, [-1, 1], [lo, hi])


def radial_weight(q, c, lo=0.72, hi=1.24):
    """lost-and-found for a loop around centre c: lit (upper-left) side light, lower-right heavy"""
    v = q - np.asarray(c, float)
    v /= np.hypot(*v.T)[:, None]
    lit = geom.smooth(v @ TO_LIGHT, 5)
    return np.interp(lit, [-1, 1], [hi, lo])


def up_weight(q, lo=0.78, hi=1.12):
    """contour of land seen against the sky, drawn left to right: outward is up"""
    t = geom.tangents(q)
    out = np.stack([t[:, 1], -t[:, 0]], 1)
    lit = geom.smooth(out @ TO_LIGHT, 8)
    return np.interp(lit, [-1, 1], [hi, lo])


def bumps_path(cusps, bulges, seed, step=3.0, lean=None):
    """Scalloped outline through cusps, each bump bulging outward (left of travel = up for a
    left-to-right top). Each bump is a slightly lopsided arc; the pen dips a little into each cusp."""
    rng = np.random.default_rng(seed)
    pts = []
    for i in range(len(cusps) - 1):
        a, b = np.asarray(cusps[i], float), np.asarray(cusps[i + 1], float)
        d = b - a
        L = math.hypot(*d)
        t = d / L
        out = np.array([t[1], -t[0]])
        h = bulges[i] * L
        sk = (lean[i] if lean else rng.uniform(-0.12, 0.12))
        f = np.linspace(0, 1, max(8, int(L * 1.3 / step)))
        if i:
            f = f[1:]
        # lopsided arc: peak shifted by sk; slightly more than a half-circle at the cusps
        g = np.clip(f + sk * np.sin(np.pi * f), 0, 1)
        prof = np.sin(np.pi * f) ** 0.8
        p = a[None] + d[None] * g[:, None] + out[None] * (h * prof)[:, None]
        # into the cusp: the pen tucks in a hair
        p += (-out)[None] * (2.2 * (np.exp(-f * L / 5) + np.exp(-(1 - f) * L / 5)))[:, None]
        pts.append(p)
    return geom.resample(np.vstack(pts), step)


def inside_run(line, poly, grow=0.0):
    """the first run of a polyline that lies inside a polygon (grown by `grow` units)"""
    q = np.asarray(line, float)
    P = np.asarray(poly, float)
    g = geom.Grid((min(P[:, 0].min(), q[:, 0].min()) - 20, min(P[:, 1].min(), q[:, 1].min()) - 20,
                   max(P[:, 0].max(), q[:, 0].max()) + 20, max(P[:, 1].max(), q[:, 1].max()) + 20), 1.0)
    m = g.poly(P)
    if grow:
        from scipy import ndimage as ndi
        m = ndi.binary_dilation(m, iterations=int(grow))
    ins = np.array([g.inside(m, x, y) for x, y in q])
    idx = np.flatnonzero(ins)
    if not len(idx):
        return q[:0]
    a = idx[0]
    b = a
    while b + 1 < len(q) and ins[b + 1]:
        b += 1
    return q[a:b + 1]


def poly_and(a, b, res=1.0):
    A_, B_ = np.asarray(a, float), np.asarray(b, float)
    allp = np.vstack([A_, B_])
    g = geom.Grid((allp[:, 0].min() - 4, allp[:, 1].min() - 4, allp[:, 0].max() + 4, allp[:, 1].max() + 4), res)
    return g.polys(g.poly(A_) & g.poly(B_), eps=0.5, min_area=30)


def poly_sub(a, b, res=1.0):
    A_, B_ = np.asarray(a, float), np.asarray(b, float)
    allp = np.vstack([A_, B_])
    g = geom.Grid((allp[:, 0].min() - 4, allp[:, 1].min() - 4, allp[:, 0].max() + 4, allp[:, 1].max() + 4), res)
    return g.polys(g.poly(A_) & ~g.poly(B_), eps=0.5, min_area=30)


def below(line, depth=2000):
    """polygon: everything below a left-to-right polyline"""
    q = np.asarray(line, float)
    return np.vstack([q, [q[-1][0] + 400, q[-1][1]], [q[-1][0] + 400, q[-1][1] + depth],
                      [q[0][0] - 400, q[0][1] + depth], [q[0][0] - 400, q[0][1]]])


def left_of(line, far=4000):
    q = np.asarray(line, float)   # top to bottom
    return np.vstack([q, [q[-1][0] - far, q[-1][1] + 300], [q[0][0] - far, q[0][1] - 300]])


def right_of(line, far=4000):
    q = np.asarray(line, float)   # top to bottom
    return np.vstack([q, [q[-1][0] + far, q[-1][1] + 300], [q[0][0] + far, q[0][1] - 300]])


# ----------------------------------------------------------------------------- horizon
HZ = -215.0


def build_horizon():
    F = Fig("bg-horizon", ds=41, pen=2600)
    F.group("horizon", (0, HZ))
    spec = [
        ("hz-l1", [(-2645, -212.5), (-2210, -215.8), (-1770, -217.2), (-1332, -214.2)], 1, [(0.62, 1.2)], (3, 30), (0.62, 0.1)),
        ("hz-l2", [(-1396, -211.6), (-1080, -215.6), (-760, -216.4), (-472, -213.4)], 2, [(0.35, -1.4)], (4, 42), (0.55, 0.06)),
        ("hz-r1", [(466, -217.6), (790, -219.8), (1140, -219.2), (1528, -216.6)], 3, [(0.55, 1.1)], (30, 18), (0.2, 0.12)),
        ("hz-r2", [(1458, -214.2), (1890, -217.6), (2290, -218.4), (2648, -215.4)], 4, [(0.4, -1.0)], (4, 30), (0.6, 0.1)),
    ]
    for sid, ctrl, seed, jogs, taper, tip in spec:
        q = H.hand_line(ctrl, seed, step=5.0, wander=(2.1, 280), tremor=(0.5, 42), jogs=jogs)
        w = H.widths(q, seed, base=4.7, var=0.1, land=0.5)
        F.stroke(sid, q, w, "horizon", weight=rot_weight(q, seed), taper=taper, tip=tip, land=0.25, level=0.66)
    # behind the figures: hidden until the stage is empty (show: ['hz-mid'])
    q = H.hand_line([(-540, -213.6), (-180, -216.6), (210, -217.4), (540, -216.2)], 9, step=5.0, wander=(1.8, 260))
    F.stroke("hz-mid", q, H.widths(q, 9, base=4.4), "horizon", weight=rot_weight(q, 9), taper=(20, 30),
             tip=(0.3, 0.1), level=0.6, hidden=True)
    # the ground, for knockout: the land hides the sun as it sets below the horizon
    F.occluders.append({"group": "horizon", "poly": [[-2700, int(HZ) + 3], [2700, int(HZ) + 3], [2700, 900], [-2700, 900]]})
    # blue guides: the horizon (ruled, kept off the figures) and the ground line the figures stand on
    for i, (a, b, y0, y1) in enumerate([(-2560, -430, -219.6, -220.4), (440, 2590, -220.2, -218.6)]):
        q = H.hand_line([(a, y0), (b, y1)], 20 + i, wander=(0.5, 400), tremor=(0.25, 60))
        F.construction(q, "horizon", level=0.3, width=2.4)
    for i, (a, b, y0, y1) in enumerate([(-1190, -405, 1.2, -0.4), (452, 1240, -0.6, 1.4)]):
        q = H.hand_line([(a, y0), (b, y1)], 30 + i, wander=(0.5, 400), tremor=(0.25, 60))
        F.construction(q, "horizon", level=0.28, width=2.3)
    return F


# ----------------------------------------------------------------------------- hills
HILL_L = [(-2652, -350), (-2400, -418), (-2130, -489), (-1880, -539), (-1660, -560), (-1470, -552),
          (-1330, -527), (-1150, -478), (-990, -421), (-860, -356), (-765, -296), (-700, -252),
          (-650, -227), (-596, -216.5), (-548, -214.5)]
HILL_R = [(712, -214.5), (800, -236), (905, -285), (1035, -352), (1185, -414), (1330, -452), (1455, -463),
          (1590, -450), (1730, -420), (1860, -401), (1990, -405), (2105, -422), (2230, -432), (2360, -422),
          (2500, -398), (2652, -372)]


_CONTOURS = {}


def contour_y(ctrl, x):
    key = id(ctrl)
    if key not in _CONTOURS:
        _CONTOURS[key] = H.spline(ctrl, 2.0)
    c = _CONTOURS[key]
    return float(np.interp(x, c[:, 0], c[:, 1]))


def ridge_ribbon(c, seed, deep=(46, 128)):
    """The colourist ran the marker along under the ridge line and stopped: a band hugging the contour,
    deeper on the shadow flank (descending to the right), its lower edge left ragged."""
    t = geom.tangents(c)
    slope = t[:, 1] / np.maximum(0.2, t[:, 0])
    sf = np.clip((geom.smooth(slope, 10) + 0.06) / 0.32, 0, 1)
    N = len(c)
    d = deep[0] + (deep[1] - deep[0]) * sf
    d *= 1 + 0.22 * geom.noise1d(N, seed * 9 + 4, 26, octaves=2)
    lower = c + np.stack([np.zeros(N), d], 1)
    lower[:, 1] = np.minimum(lower[:, 1], HZ + 3)
    top = c + np.array([0, -2.0])
    return np.vstack([top, lower[::-1]])


def hill(F, name, ctrl, split, seeds, color, shade, kage_lines, hatch, opacity, litfade, level, deep=(46, 128)):
    a = [p for p in ctrl if p[0] <= split[1]]
    b = [p for p in ctrl if p[0] >= split[0]]
    q1 = H.hand_line(a, seeds[0], step=4.0, wander=(2.4, 300), tremor=(0.6, 46), jogs=[(0.7, 1.3)])
    q2 = H.hand_line(b, seeds[1], step=4.0, wander=(2.4, 300), tremor=(0.6, 46), jogs=[(0.4, -1.1)])
    # the second stroke picks up a little off the first (a hand restarting a long line)
    q2 = q2 + np.array([0, 2.6]) * np.exp(-geom.cumlen(q2) / 80)[:, None]
    for sid, q, sd, taper, tip in [(name + "-1", q1, seeds[0], (4, 44), (0.6, 0.08)),
                                   (name + "-2", q2, seeds[1], (14, 26), (0.32, 0.12))]:
        F.stroke(sid, q, H.widths(q, sd, base=4.6, var=0.12, land=0.4), name, weight=up_weight(q),
                 taper=taper, tip=tip, land=0.15, level=level)
    c = H.spline(ctrl, 4.0)
    region = ridge_ribbon(c, seeds[0], deep)
    F.region(name, [region], name, color, shade, opacity=opacity, litFade=litfade, strokeAngle=4, strokeWidth=40)
    land = np.vstack([c, [c[-1][0], 900], [c[0][0], 900]])
    F.occluders.append({"group": name, "poly": r1(geom.orient(geom.rdp(land, 1.0)))})
    polys = []
    for kl in kage_lines:
        polys += poly_and(region, right_of(kl))
    edges = [H.hand_line(kl, seeds[0] * 3 + i, wander=(1.4, 120), tremor=(0.4, 30))[3:-2] for i, kl in enumerate(kage_lines)]
    # the red boundary only as far as the colour goes
    edges = [inside_run(e, region, 6) for e in edges]
    F.shadow(name + "-kage", name, polys, on=[name], hatch=hatch, edge=[e for e in edges if len(e) > 3])
    return region


def build_hills():
    L = Fig("bg-hillL", ds=43, pen=2400)
    L.group("hillL", (-1600, HZ))
    hill(L, "hillL", HILL_L, (-1530, -1470), (5, 6), "hill", "hillShade",
         kage_lines=[[(-1405, -548), (-1350, -470), (-1270, -380), (-1175, -290), (-1080, -214)]],
         hatch={"color": "red", "spacing": 15, "level": 0.3, "keep": 0.3, "fade": 0.6, "maxLen": 30, "skip": 0.2},
         opacity=0.55, litfade=0.3, level=0.62, deep=(44, 120))
    R = Fig("bg-hillR", ds=47, pen=2400)
    R.group("hillR", (1700, HZ))
    hill(R, "hillR", HILL_R, (1885, 1930), (7, 8), "hillFar", "hillFarShade",
         kage_lines=[[(1508, -460), (1548, -400), (1600, -320), (1660, -260), (1720, -214)]],
         hatch={"color": "red", "spacing": 16, "level": 0.28, "keep": 0.3, "fade": 0.6, "maxLen": 28, "skip": 0.2},
         opacity=0.46, litfade=0.16, level=0.6, deep=(34, 92))
    return L, R


# ----------------------------------------------------------------------------- sun
def build_sun():
    F = Fig("bg-sun", ds=53, pen=1500, anchor=(0, 0))
    F.group("sun", (0, 0))
    R = 100.0
    q = H.loop((0, 0), R, R * 0.97, seed=3, start_deg=-38, sweep_deg=-393, drift=7.5, wobble=1.25,
               flat=[(-150, 22, 0.035)])
    w = H.widths(q, 3, base=4.9, var=0.12, land=0.5)
    F.stroke("sun", q, w, "sun", weight=radial_weight(q, (0, 0)), taper=(5, 34), tip=(0.55, 0.1), land=0.25,
             level=0.72, breaks=[[0.205, 0.235, 9]])
    F.second.append({"stroke": "sun", "from": 0.64, "to": 0.83, "offset": 5.0, "level": 0.34, "seed": 2})
    # blue centre cross (a slight tilt, one arm longer)
    F.construction(H.hand_line([(-146, 4), (154, -3)], 41, wander=(0.6, 300)), "sun", level=0.3, width=2.3)
    F.construction(H.hand_line([(3, -150), (-4, 144)], 42, wander=(0.6, 300)), "sun", level=0.3, width=2.3)
    # colour: three quick yellow passes and a warm touch at the bottom, not a filled disc. The upper left
    # (toward the light) is left as paper, one pass overshoots the line on the right.
    legs = [
        ("sun-c1", "sun", [(-76, 38), (-10, 46), (60, 42), (102, 28)], 34, 0.72, dict(nib_deg=48, end="flick", flick=0.18, wvar=0.14)),
        ("sun-c2", "sun", [(-34, 22), (30, 2), (96, -22)], 28, 0.64, dict(nib_deg=52, end="flick", flick=0.22, wvar=0.14)),
        ("sun-c3", "sun", [(34, -36), (64, -54), (84, -66)], 20, 0.58, dict(nib_deg=52, end="flick", flick=0.3, wvar=0.12)),
        ("sun-c4", "sunShade", [(-46, 80), (12, 80), (54, 68)], 15, 0.5, dict(nib_deg=50, end="flick", flick=0.3, wvar=0.12)),
    ]
    for name, col, ctrl, wd, op, kw in legs:
        marker_region(F, name, ctrl, wd, 520 + len(F.order), col, op, group="sun", **kw)
    return F


# ----------------------------------------------------------------------------- clouds
def cumulus(F, name, cusps, bulges, base, kage, kage_bulges, seeds, inner=None, hatch=None, split=None,
            level=0.66):
    F.group(name, (0, 0))
    top = bumps_path(cusps, bulges, seeds[0])
    # drawn as the hand would: up and over in one or two strokes, then the base left to right
    if split:
        s = geom.cumlen(top)
        k = int(np.searchsorted(s, split * s[-1]))
        parts = [top[: k + 6], top[k - 4:]]
    else:
        parts = [top]
    for i, p in enumerate(parts):
        q = H.hand_line(None, seeds[0] + i, base=p, wander=(1.3, 160), tremor=(0.5, 34))
        if i:   # picks up a hair off the first stroke
            q = q + np.array([1.2, -2.4]) * np.exp(-geom.cumlen(q) / 25)[:, None]
        tp = (5, 26) if i == len(parts) - 1 else (5, 14)
        F.stroke(f"{name}-top{i + 1}", q, H.widths(q, seeds[0] + i, base=5.0, land=0.5), name,
                 weight=radial_weight(q, (0, -60)), taper=tp, tip=(0.5, 0.1), land=0.2, level=level,
                 breaks=[[0.16, 0.19, 8]] if i == 0 else None)
    qb = H.hand_line(base, seeds[1], wander=(1.1, 200), tremor=(0.4, 40), jogs=[(0.6, 1.0)])
    F.stroke(f"{name}-base", qb, H.widths(qb, seeds[1], base=5.2, land=0.6), name,
             weight=np.full(len(qb), 1.04), taper=(8, 30), tip=(0.45, 0.08), land=0.2, level=level * 0.94)
    if inner:
        qi = H.hand_line(inner, seeds[2], wander=(0.8, 90), tremor=(0.4, 30))
        F.stroke(f"{name}-inner", qi, H.widths(qi, seeds[2], base=4.2, land=0.2), name,
                 weight=np.full(len(qi), 0.8), taper=(12, 20), tip=(0.3, 0.12), level=level * 0.82)
    # colour host: the cloud itself stays paper; only its kage is coloured
    body = np.vstack([geom.resample(np.array(cusps, float)[:1], 3), top,
                      H.spline([base[-1], base[0]], 3.0)])
    body = np.vstack([top, np.array(base[::-1], float)])
    F.region(name, [body], name, "cloud", "cloudShade", opacity=1.0)
    F.occluders.append({"group": name, "poly": r1(geom.orient(geom.rdp(body, 0.8)))})
    kline = bumps_path(kage, kage_bulges, seeds[3])
    polys = poly_and(body, below(kline, 600))
    e = H.hand_line(None, seeds[3], base=kline, wander=(0.9, 120), tremor=(0.35, 28))
    F.shadow(name + "-kage", name, polys, on=[name], hatch=hatch, edge=[e[2:-3]])
    return body


def build_clouds():
    A = Fig("bg-cloudA", ds=59, pen=1500)
    cumulus(A, "cloudA",
            cusps=[(-318, -6), (-292, -58), (-228, -110), (-132, -164), (-40, -236), (94, -248), (184, -184),
                   (262, -124), (310, -60), (318, -8)],
            bulges=[0.42, 0.46, 0.5, 0.52, 0.6, 0.5, 0.46, 0.42, 0.34],
            base=[(-298, 1.5), (-120, 4), (60, 3.5), (200, 1.8), (334, -2.5)],
            kage=[(-308, -28), (-244, -38), (-150, -44), (-34, -66), (52, -71), (170, -98), (246, -106), (310, -84)],
            kage_bulges=[0.3, 0.19, 0.33, 0.16, 0.31, 0.21, 0.27],
            seeds=(11, 12, 13, 14), split=0.52,
            inner=[(-118, -150), (-92, -178), (-58, -196), (-22, -204)],
            hatch={"color": "red", "spacing": 11, "level": 0.32, "keep": 0.3, "fade": 0.85, "maxLen": 30})
    A.construction(H.hand_line([(-430, 4.5), (446, 0.5)], 61, wander=(0.5, 300)), "cloudA", level=0.3, width=2.3)
    B = Fig("bg-cloudB", ds=61, pen=1500)
    cumulus(B, "cloudB",
            cusps=[(-186, -4), (-162, -44), (-88, -96), (24, -124), (116, -84), (176, -36), (190, -5)],
            bulges=[0.42, 0.5, 0.58, 0.5, 0.44, 0.32],
            base=[(-172, 1.2), (-40, 3), (90, 2.2), (204, -1.5)],
            kage=[(-182, -22), (-118, -30), (-6, -42), (72, -50), (184, -44)],
            kage_bulges=[0.28, 0.33, 0.18, 0.3],
            seeds=(21, 22, 23, 24), level=0.6,
            hatch={"color": "red", "spacing": 12, "level": 0.3, "keep": 0.3, "fade": 0.85, "maxLen": 26})
    B.construction(H.hand_line([(-260, 3.5), (262, 0.5)], 62, wander=(0.5, 300)), "cloudB", level=0.28, width=2.2)
    return A, B


# ----------------------------------------------------------------------------- trees
def build_tree():
    F = Fig("bg-tree", ds=67, pen=1300)
    F.group("tree", (0, 0))
    can = H.loop((0, -80), 40, 35, seed=5, start_deg=150, sweep_deg=-376, drift=4, wobble=1.0)
    # scallop the crown a little: leaves, not a circle
    v = can - np.array([0, -80])
    ang = np.arctan2(v[:, 1], v[:, 0])
    rad = np.hypot(*v.T)
    rad *= 1 + 0.07 * np.abs(np.sin(2.6 * ang + 0.7)) - 0.035
    can = np.array([0, -80]) + np.stack([np.cos(ang), np.sin(ang)], 1) * rad[:, None]
    F.stroke("tree-crown", can, H.widths(can, 5, base=4.3, land=0.4), "tree", weight=radial_weight(can, (0, -80)),
             taper=(4, 18), tip=(0.5, 0.12), level=0.64)
    tr = H.hand_line([(0.5, -44), (-1.5, -22), (1, 1)], 6, wander=(0.6, 60), tremor=(0.3, 20))
    F.stroke("tree-trunk", tr, H.widths(tr, 6, base=4.4, land=0.3), "tree", weight=np.full(len(tr), 1.05),
             taper=(6, 10), tip=(0.5, 0.3), level=0.64)
    gt = H.hand_line([(-16, 2), (18, 0.5)], 7, wander=(0.4, 40))
    F.stroke("tree-ground", gt, H.widths(gt, 7, base=4.0), "tree", taper=(6, 12), tip=(0.4, 0.1), level=0.56)
    crown = H.loop((1.5, -80.5), 39, 34, seed=5, start_deg=150, sweep_deg=-360, drift=0, wobble=0.3)
    F.region("crown", [crown], "tree", "tree", "treeShade", litFade=0.3, opacity=0.72, strokeAngle=60, strokeWidth=12)
    kl = H.spline([(-6, -118), (8, -96), (10, -72), (2, -46)], 2.0)
    F.shadow("crown-kage", "tree", poly_and(crown, right_of(kl, 200)), on=["crown"],
             edge=[inside_run(H.hand_line(None, 8, base=kl[4:-4], wander=(0.5, 40)), crown, 1)])
    return F


def build_palm():
    F = Fig("bg-palm", ds=71, pen=1300)
    F.group("palm", (0, 0))
    crown = np.array([20.0, -142.0])
    trunk = H.hand_line([(0, 1), (9, -50), (16, -100), (20.5, -140)], 9, wander=(0.9, 80), tremor=(0.35, 22))
    F.stroke("palm-trunk", trunk, H.widths(trunk, 9, base=4.8, land=0.5), "palm", weight=np.full(len(trunk), 1.08),
             taper=(5, 14), tip=(0.6, 0.25), level=0.66)
    fronds = [
        [crown, (-6, -160), (-34, -150), (-52, -120)],
        [crown, (48, -165), (76, -150), (94, -118)],
        [crown, (6, -176), (-12, -184), (-28, -172)],
        [crown, (38, -180), (60, -184), (76, -166)],
        [crown, (40, -146), (52, -124), (54, -100)],
    ]
    for i, f in enumerate(fronds):
        q = H.hand_line(f, 40 + i, wander=(0.6, 50), tremor=(0.3, 18))
        F.stroke(f"palm-frond{i + 1}", q, H.widths(q, 40 + i, base=4.3, land=0.4), "palm",
                 weight=np.full(len(q), 0.95), taper=(3, 30), tip=(0.7, 0.06), level=0.64)
    # three trunk rings, tiny ticks
    for i, y in enumerate([-38, -78, -112]):
        x = float(np.interp(-y, -trunk[:, 1], trunk[:, 0]))
        q = H.hand_line([(x - 5, y + 1.5), (x + 5, y - 1)], 50 + i, wander=(0.2, 20))
        F.stroke(f"palm-ring{i + 1}", q, H.widths(q, 50 + i, base=3.4, land=0.1), "palm", taper=(3, 4),
                 tip=(0.5, 0.3), level=0.5)
    gt = H.hand_line([(-18, 2), (16, 0.5)], 58, wander=(0.4, 40))
    F.stroke("palm-ground", gt, H.widths(gt, 58, base=4.0), "palm", taper=(6, 12), tip=(0.4, 0.1), level=0.56)
    F.shadow("palm-green", "palm", tone="tree",
             passes=[(H.spline([(-30, -150), (0, -165), (20, -150)], 4), 10),
                     (H.spline([(28, -160), (60, -164), (82, -140)], 4), 9),
                     (H.spline([(34, -138), (46, -118)], 4), 7)])
    return F


# ----------------------------------------------------------------------------- grass
TUFTS = {
    # name: (base, [(angle from vertical deg, length, curl)], level, scale)
    "tuftA": ((-588, 6), [(-30, 46, -0.35), (-9, 66, 0.12), (11, 54, 0.3), (33, 38, 0.32)], 0.8, 1.0),
    "tuftB": ((-506, 15), [(-22, 34, -0.2), (5, 46, 0.2), (27, 30, 0.34)], 0.76, 1.0),
    "tuftC": ((552, 5), [(-32, 42, -0.28), (-5, 60, 0.1), (21, 48, 0.3)], 0.8, 1.0),
    "tuftD": ((646, -8), [(-14, 30, -0.12), (17, 36, 0.26)], 0.72, 1.0),
    "tuftE": ((-886, -86), [(-12, 25, -0.05), (13, 29, 0.22)], 0.6, 0.85),
    "tuftF": ((928, -114), [(-8, 22, 0.0), (15, 21, 0.24)], 0.56, 0.85),
}
DASHES = [((-1024, 66), (-934, 63.5)), ((784, 134), (866, 131)), ((-700, 170), (-648, 168.5))]


def build_grass():
    F = Fig("bg-grass", ds=73, pen=1100)
    seed = 100
    for name, (b, blades, level, sc) in TUFTS.items():
        F.group(name, b)
        passes = []
        for k, (ang, ln, curl) in enumerate(blades):
            seed += 1
            rng = np.random.default_rng(seed)
            a = math.radians(ang)
            x0 = b[0] + (k - (len(blades) - 1) / 2) * 8.5 * sc + rng.uniform(-3, 3)
            y0 = b[1] + rng.uniform(-1.5, 1.5)
            d = np.array([math.sin(a), -math.cos(a)])
            sidev = np.array([-d[1], d[0]])
            L_ = ln * sc
            ctrl = [(x0, y0), tuple(np.array([x0, y0]) + d * L_ * 0.5 + sidev * curl * L_ * 0.16),
                    tuple(np.array([x0, y0]) + d * L_ + sidev * curl * L_ * 0.5)]
            q = H.hand_line(ctrl, seed, wander=(0.4, 30), tremor=(0.2, 12))
            w = H.widths(q, seed, base=3.9 * (0.9 + 0.1 * sc), var=0.06, land=0.15)
            F.stroke(f"{name}-{k + 1}", q, w, name, weight=np.linspace(1.08, 0.86, len(q)), taper=(5, L_ * 0.75),
                     tip=(0.55, 0.05), land=0.1, level=level * 0.92)
        if sc >= 1:
            passes.append((H.spline([(b[0] - 26, b[1] - 6), (b[0] + 2, b[1] - 12), (b[0] + 30, b[1] - 8)], 4), 16))
            F.shadow(name + "-green", name, tone="grass", passes=passes)
    for i, (a, c) in enumerate(DASHES):
        q = H.hand_line([a, c], 200 + i, wander=(0.5, 50))
        F.group(f"dash{i + 1}", a)
        F.stroke(f"dash{i + 1}", q, H.widths(q, 200 + i, base=4.3), f"dash{i + 1}", taper=(6, 22), tip=(0.5, 0.1),
                 level=0.56)
    return F


def marker_region(F, name, ctrl, width, seed, color, opacity, group=None, reverse=False, **kw):
    """One marker stroke as a colour region. Build-up (Pencil build.color) sweeps a region in bands along
    strokeAngle; here the angle is the stroke's own direction and the band is wide enough to cover it, so the
    stroke is laid in one pass along its length, in the direction it was drawn."""
    poly = H.marker(ctrl, width, seed, **kw)
    a, b = np.asarray(ctrl[0], float), np.asarray(ctrl[-1], float)
    if reverse:
        a, b = b, a
    ang = math.degrees(math.atan2(-(b[1] - a[1]), b[0] - a[0]))
    u = np.array([math.cos(math.radians(ang)), -math.sin(math.radians(ang))])
    v = np.array([-u[1], u[0]])
    t = poly @ v
    R = float(t.max() - t.min())
    F.region(name, [poly], group or name, color, color, inset=0, outset=0, retreat=0, opacity=opacity,
             strokeAngle=round(ang, 1), strokeWidth=round(R / 1.18 + 3, 1))
    return poly


# ----------------------------------------------------------------------------- golden sky marks
def build_sky():
    F = Fig("bg-sky", ds=79)
    # patches of a few overlapping legs (back and forth), the way a colourist touches in a sky; each
    # leg is a region, laid in the direction it was drawn. The overlaps read darker, as marker does.
    legs = [
        # name, colour, centreline, width, opacity, reverse, kw   (legs overlap by about a third, rising a
        # touch to the right as a fast right-handed stroke does)
        ("sky-a1", "skyBlue", [(396, -1322), (700, -1342), (1010, -1356), (1204, -1360)], 52, 0.48, False,
         dict(end="flick", hook=-6, wvar=0.26, pool=0.12)),
        ("sky-a2", "skyBlue", [(1250, -1326), (1010, -1315), (772, -1300), (580, -1280)], 46, 0.44, True,
         dict(start="round", end="flick", hook=5, flick=0.26, wvar=0.3)),
        ("sky-a3", "skyBlue", [(1376, -1186), (1550, -1192), (1712, -1200)], 42, 0.46, False,
         dict(nib_deg=58, end="flick", hook=-4, wvar=0.22, pool=0.15)),
        ("sky-a4", "skyBlue", [(1650, -1170), (1540, -1164), (1446, -1156)], 34, 0.42, True,
         dict(start="round", end="flick", flick=0.4, wvar=0.2)),
        ("sky-b1", "skyBlue", [(-2182, -1520), (-1930, -1540), (-1640, -1552), (-1478, -1556)], 48, 0.46, False,
         dict(end="chisel", wvar=0.26, pool=0.12)),
        ("sky-b2", "skyBlue", [(-1440, -1522), (-1640, -1510), (-1870, -1492)], 42, 0.42, True,
         dict(start="round", end="flick", hook=4, wvar=0.28)),
    ]
    for i, (name, col, ctrl, wd, op, rev, kw) in enumerate(legs):
        F.group(name, ctrl[0])
        marker_region(F, name, ctrl, wd, 300 + i, col, op, reverse=rev, **kw)
    return F



# ----------------------------------------------------------------------------- dusk
CLOUD_A = dict(cx=870, cy=-960, x0=-322, x1=336, top=-252)
CLOUD_B = dict(cx=-1580, cy=-1290, x0=-190, x1=206, top=-128)
HALO = dict(cx=0, cy=-470, rx=545, ry=610)   # paper left around the subject: the reveal's light is paper


def land_y(x):
    y = HZ
    if x <= -548:
        y = min(y, contour_y(HILL_L, x))
    if x >= 712:
        y = min(y, contour_y(HILL_R, x))
    return y


def zigzag(start, ang, legs, spacing, seed, down=True, right=True):
    """One marker pass scribbled back and forth: legs along `ang` degrees (screen, + rises to the right),
    alternating direction, each next leg a `spacing` lower (down) or higher, joined by quick round turns.
    legs: [(length, slip)] where slip shifts where the leg turns (ragged patch edges)."""
    rng = np.random.default_rng(seed)
    a0 = math.radians(ang)
    pts, cuts = [], []
    p = np.array(start, float)
    d = 1 if right else -1
    for i, (L, slip) in enumerate(legs):
        a = a0 + math.radians(rng.uniform(-2.5, 2.5))
        u = np.array([math.cos(a), -math.sin(a)]) * d
        v = np.array([math.sin(a0), math.cos(a0)]) * (1 if down else -1)
        n = max(4, int(L / 9))
        bow = rng.uniform(-7, 7)
        for j in range(n + 1):
            f = j / n
            pts.append(p + u * L * f + v * bow * 4 * f * (1 - f))
        e = p + u * L
        # the turn: a quick loop out past the end and back, a spacing over
        sp = spacing * rng.uniform(0.88, 1.12)
        if i < len(legs) - 1:
            r = sp * rng.uniform(0.45, 0.6)
            for k_, th in enumerate(np.linspace(0.25, math.pi - 0.25, 6)):
                pts.append(e + u * r * math.sin(th) + v * sp * (1 - math.cos(th)) / 2)
                if k_ == 2:
                    cuts.append(float(geom.cumlen(np.array(pts))[-1]))
            p = e + v * sp - u * slip
            d = -d
    q = geom.resample(np.array(pts), 8.0)
    q = H.hand_line(None, seed, step=8.0, wander=(3.0, 260), tremor=(0.8, 70), base=q)
    # split at the turns into legs that overlap a hair (a marker leg per accent: overlaps multiply darker)
    sq = geom.cumlen(q)
    bounds = [0.0] + cuts + [sq[-1]]
    out = []
    for i in range(len(bounds) - 1):
        a, b = bounds[i] - (3 if i else 0), bounds[i + 1] + (3 if i < len(bounds) - 2 else 0)
        out.append(q[(sq >= a) & (sq <= b)])
    return out


# The dusk wash: 12 zig-zag marker passes (3-5 legs each, 13-15 legs a colour zone), laid as a colourist
# would: gold/orange low (around the sun and over the hills), pink in the middle, violet high and sparse.
# Legs sit a little less than a nib apart, so each shows with a darker seam where it overlaps the last;
# zones overlap where one colour goes back over another; the overlaps multiply darker. Most of the sky
# stays paper. (zone, colour, start, angle, [(leg length, slip)], spacing, width, down, right)
WASH = [
    ("washGold", "duskGold", (-1270, -706), 3, [(560, 30), (500, 60), (610, -20), (430, 0)], 47, 52, True, True),
    ("washOrange", "duskOrange", (640, -470), 9, [(520, 40), (600, -30), (470, 50), (390, 0)], 45, 50, False, True),
    ("washOrange", "duskOrange", (-2560, -700), -4, [(700, 60), (620, -40), (760, 0)], 52, 58, True, True),
    ("washGold", "duskGold", (2620, -590), -5, [(640, 40), (720, -50), (560, 30), (500, 0)], 50, 56, False, False),
    ("washPink", "duskPink", (-1330, -906), -6, [(600, 50), (520, -30), (680, 40), (460, 0)], 49, 54, True, True),
    ("washPink", "duskPink", (566, -886), 6, [(480, 30), (560, -40), (420, 0)], 45, 50, True, True),
    ("washPink", "duskPink", (-470, -1000), 4, [(700, 40), (640, -60), (760, 30), (560, 0)], 47, 52, True, True),
    ("washPink", "duskPink", (2560, -930), -5, [(620, 40), (700, -30), (540, 50), (600, 0)], 50, 56, True, False),
    ("washViolet", "duskViolet", (-1640, -1128), 7, [(620, 40), (560, -30), (500, 50), (440, 0)], 52, 58, True, True),
    ("washViolet", "duskViolet", (1240, -1330), -8, [(560, 30), (640, -40), (520, 40), (480, 0)], 50, 56, True, True),
    ("washViolet", "duskViolet", (2600, -1500), 6, [(700, 50), (600, -40), (520, 0)], 54, 60, True, False),
    ("washIndigo", "duskIndigo", (-520, -1810), -5, [(760, 40), (680, -50), (820, 30), (600, 0)], 49, 54, True, True),
]


def build_wash():
    F = Fig("bg-duskWash", ds=97, pen=2000)
    bands = ["washGold", "washOrange", "washPink", "washViolet", "washIndigo", "washBlend"]
    for g in bands:
        F.group(g, (0, -1000))
    names = []
    for i, (zone, col, start, ang, legs, sp, wd, down, right) in enumerate(WASH):
        name = f"p{i + 1:02d}"
        F.group(name, start, parent=zone)
        legs_ = zigzag(start, ang, legs, sp, 900 + i, down, right)
        for j, q in enumerate(legs_):
            first, last = j == 0, j == len(legs_) - 1
            F.accent_pass("wash", name, q, col, wd * (0.94 + 0.12 * ((i * 7 + j * 3) % 5) / 4), level=0.72,
                          taper=(12 if first else 16, 70 if last else 16))
        names.append(name)
    F.finish_spans("wash")
    return F, names


def build_dusk_accents():
    """dusk touches on the clouds, the sun and the hills, as marker passes (accents) in each element's frame"""
    out = {}

    def fig(key, name, ds, pivot, passes):
        F = Fig(name, ds=ds)
        F.group("dusk", pivot)
        for i, (nm, col, ctrl, wd, lvl) in enumerate(passes):
            F.group(nm, ctrl[0], parent="dusk")
            q = H.hand_line(ctrl, ds * 10 + i, step=6.0, wander=(1.5, 160), tremor=(0.5, 40))
            F.accent_pass("dusk", nm, q, col, wd, level=lvl, taper=(8, 50))
        F.finish_spans("dusk")
        out[key] = F

    # cloud undersides go pink, the lit crown catches orange (local cloud frames)
    fig("cloudA", "bg-duskCloudA", 101, (0, 0), [
        ("dA1", "duskCloud", [(-292, -26), (-120, -38), (60, -50), (250, -64), (290, -50), (120, -22), (-60, -14), (-200, -12)], 30, 0.78),
        ("dA2", "duskOrange", [(-238, -112), (-160, -156), (-60, -208)], 20, 0.72)])
    fig("cloudB", "bg-duskCloudB", 103, (0, 0), [
        ("dB1", "duskCloud", [(-170, -18), (-40, -28), (110, -40), (176, -36), (60, -14), (-90, -10)], 26, 0.78),
        ("dB2", "duskOrange", [(-150, -60), (-90, -92), (-10, -114)], 16, 0.72)])
    # the sun deepens across its lower half (local sun frame); render it before the land so the hills hide it
    fig("sun", "bg-duskSun", 107, (0, 0), [
        ("dS1", "duskOrange", [(-84, 30), (-10, 38), (70, 30), (92, 20), (40, 56), (-40, 62)], 30, 0.8),
        ("dS2", "duskPink", [(64, 76), (0, 84), (-50, 74)], 18, 0.72)])
    # hills: a violet pass along each ridge and back (world frame, like the hills)
    for key, ctrl_l, seed, xs in (("hillL", HILL_L, 831, (-1700, -700)), ("hillR", HILL_R, 841, (1350, 2300))):
        c = H.spline(ctrl_l, 30.0)
        sel = c[(c[:, 0] > xs[0]) & (c[:, 0] < xs[1])][::2] + np.array([0, 36])
        sel2 = sel[::-1][:-2] + np.array([0, 40])
        fig(key, "bg-dusk" + key[0].upper() + key[1:], seed, (0, HZ), [
            ("dH1", "duskHill", [tuple(p) for p in np.vstack([sel, sel2])], 34, 0.72)])
    return out


# ----------------------------------------------------------------------------- assemble
LAYOUT = {
    # world position of each element's anchor (wide/landscape framing)
    "place": {
        "sky": [0, 0], "sun": [-790, -830], "cloudB": [-1580, -1290], "cloudA": [870, -960],
        "hillL": [0, 0], "hillR": [0, 0], "horizon": [0, 0],
        "tree": [-1185, contour_y(HILL_L, -1185) + 2], "palm": [1262, contour_y(HILL_R, 1262) + 2],
        "grass": [0, 0],
    },
}


def main():
    els = {}
    els["sky"] = build_sky()
    els["sun"] = build_sun()
    els["cloudA"], els["cloudB"] = build_clouds()
    els["hillL"], els["hillR"] = build_hills()
    els["horizon"] = build_horizon()
    els["tree"] = build_tree()
    els["palm"] = build_palm()
    els["grass"] = build_grass()
    wash, wnames = build_wash()
    dusk = {"wash": wash}
    dusk.update(build_dusk_accents())
    data = {"palette": PALETTE, "elements": {k: v.js() for k, v in els.items()},
            "dusk": {k: v.js() for k, v in dusk.items()}, "layout": LAYOUT}
    # beats: one drawing each (on 3s). Each pass is drawn on over 2-3 drawings (partial progress), the
    # touches on the clouds, sun and hills slip in among the later passes, as a colourist touching up.
    seq = [("wash", n) for n in wnames]
    touches = [("sun", "dS1"), ("cloudA", "dA1"), ("cloudB", "dB1"), ("hillL", "dH1"), ("cloudA", "dA2"),
               ("sun", "dS2"), ("hillR", "dH1"), ("cloudB", "dB2")]
    at = [4, 6, 7, 9, 10, 10, 11, 12]          # after which wash pass
    order = []
    for i, it in enumerate(seq):
        order.append(it)
        order += [t for t, k in zip(touches, at) if k == i + 1]
    rng = np.random.default_rng(5)
    beats = []
    for el, g in order:
        n = 1 if el != "wash" else int(rng.choice([2, 3, 3]))
        steps = {1: [1.0], 2: [0.55, 1.0], 3: [0.3, 0.68, 1.0]}[n]
        for f in steps:
            beats.append([[el, g, f]])
    data["layout"]["duskBeats"] = beats
    data["layout"]["order"] = ["sky", "sun", "cloudB", "cloudA", "hillL", "hillR", "horizon", "tree", "palm", "grass"]
    data["layout"]["duskPlace"] = {"sun": [-826, -372]}
    # the sun sets in held key positions: [fraction of the wash, x, y]; it ends half behind hillL (wide) or
    # into the ground (portrait). bg.sunAt(k, tall) gives the drawing's position.
    data["layout"]["sunset"] = {
        "wide": [[0, -790, -830], [0.18, -797, -716], [0.42, -805, -598], [0.66, -815, -478], [0.88, -826, -372]],
        "tall": [[0, -640, -800], [0.18, -648, -690], [0.42, -658, -570], [0.66, -672, -440], [0.88, -690, -300]],
    }
    # phone portrait: the camera sees about x -560..560, so the sun and the small cloud move into the column
    # above the box (the big cloud and the hills sit outside it and are simply cropped)
    data["layout"]["tall"] = {"sun": [-300, -1130], "cloudB": [236, -1420], "cloudA": [1180, -1620]}
    data["layout"]["tallDuskPlace"] = {"sun": [-690, -300]}
    data["layout"]["color"] = 0.64
    # sketch-in, in two phases around the box's own write-on. ms are suggestions; quantise to 2s/3s.
    data["layout"]["sketchIn"] = {
        "roughs": [
            {"el": "horizon", "what": "construct", "at": 0, "ms": 260},
            {"el": "horizon", "what": "line", "at": 160, "ms": 900},
            {"el": "hillL", "what": "line", "at": 700, "ms": 620},
            {"el": "hillR", "what": "line", "at": 1080, "ms": 620},
        ],
        "details": [
            {"el": "sun", "what": "construct", "at": 0, "ms": 160},
            {"el": "sun", "what": "line", "at": 120, "ms": 420},
            {"el": "cloudA", "what": "construct", "at": 380, "ms": 120},
            {"el": "cloudA", "what": "line", "at": 460, "ms": 760},
            {"el": "cloudB", "what": "construct", "at": 1060, "ms": 100},
            {"el": "cloudB", "what": "line", "at": 1120, "ms": 460},
            {"el": "tree", "what": "line", "at": 1460, "ms": 300},
            {"el": "palm", "what": "line", "at": 1680, "ms": 380},
            {"el": "grass", "what": "line", "at": 1980, "ms": 520},
            {"el": "hillL", "what": "construct", "at": 2050, "ms": 1},
            {"el": "hillR", "what": "construct", "at": 2050, "ms": 1},
            {"el": "sun", "what": "color", "at": 2380, "ms": 300},
            {"el": "hillL", "what": "color", "at": 2560, "ms": 420},
            {"el": "hillR", "what": "color", "at": 2800, "ms": 420},
            {"el": "tree", "what": "construct,color", "at": 3000, "ms": 200},
            {"el": "palm", "what": "construct,color", "at": 3000, "ms": 200},
            {"el": "sky", "what": "line,construct,color,shadow", "at": 3080, "ms": 600},
            {"el": "cloudA", "what": "color", "at": 3300, "ms": 1},
            {"el": "cloudB", "what": "color", "at": 3300, "ms": 1},
            {"el": "sun", "what": "shadow", "at": 3320, "ms": 260},
            {"el": "cloudA", "what": "shadow", "at": 3420, "ms": 520},
            {"el": "cloudB", "what": "shadow", "at": 3700, "ms": 360},
            {"el": "hillL", "what": "shadow", "at": 3860, "ms": 420},
            {"el": "hillR", "what": "shadow", "at": 4040, "ms": 420},
            {"el": "tree", "what": "shadow", "at": 4200, "ms": 200},
            {"el": "palm", "what": "shadow", "at": 4200, "ms": 200},
            {"el": "grass", "what": "construct,color,shadow", "at": 4300, "ms": 300},
            {"el": "horizon", "what": "color,shadow", "at": 4300, "ms": 1},
        ],
    }
    body = json.dumps(data, separators=(",", ":"))
    # one shared palette object instead of a copy per figure
    pal = json.dumps(PALETTE, separators=(",", ":"))
    body = body.replace('"palette":' + pal, '"palette":P')
    js = ["// Generated by jaden-work/tools/bg/build_bg.py. Edit the builder, not this file.",
          "// The paper-world background: see jaden-work/style/bg-NOTES.md.",
          "window.JADEN = window.JADEN || {};",
          "(function () {",
          "const P = " + pal + ";",
          "window.JADEN.bg = " + body + ";",
          "})();",
          (Path(__file__).with_name("bg_runtime.js")).read_text()]
    OUT.write_text("\n".join(js) + "\n")
    n = sum(len(v.strokes) for v in els.values())
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB), {n} strokes")


if __name__ == "__main__":
    main()
