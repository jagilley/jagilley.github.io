#!/usr/bin/env python3
"""Build resources/jaden/logo.style.js: the official GTA VI mark as pencil-renderer figure data.

    jaden-work/venv/bin/python -I jaden-work/tools/logo/build.py

Source: the public-domain Wikimedia trace embedded in v1 (jaden.html: <symbol id="gtaVI">,
<symbol id="gtaWord"> and their gradients), mapped to logo units by official.py
(100 = one ruled-line spacing, logo 1400 wide, anchor (0, 0) = base centre, y down).

The key line runs exactly on the official contours (straight edges stay on the official corners;
only a sub-unit hand wander and small corner overshoots are added). Everything else (marker bands,
keyline highlight, hatching, construction) is designed on top of that geometry.
"""
import json
import math
import sys
import zlib
from pathlib import Path

import numpy as np
from skimage.measure import points_in_poly

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / "style"))
import official  # noqa: E402
import svgpath  # noqa: E402
from geom import TO_LIGHT, Grid, area, noise1d, orient, smooth  # noqa: E402

OUT = HERE.parents[2] / "resources" / "jaden" / "logo.style.js"

# How the white keyline is drawn: 'highlight' = paper left on purpose, a blue genga edge on its outer
# side and the graphite key line on the colour field (2 graphite contours on the VI);
# 'lines' = graphite on both sides of the keyline (3 contours).
KEYLINE = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] in ("highlight", "lines") else "highlight"

PALETTE = {
    "paper": "#f3eee3",
    "graphite": "#3a3532",
    "blue": "#7aa6dc",
    "red": "#d4574d",
    # the VI's dark keyline: plum band, its near-black outer half, magenta-purple toward the base
    "plum": "#3e0c5e", "plumLow": "#7a0b80", "plumDeep": "#1f0631",
    # the VI's sunset field, as a colourist's markers (top to bottom), plus the warm sun spot
    "fieldBlue": "#5b61d2", "fieldOrchid": "#bf56cd", "fieldPink": "#fb69ad", "fieldOrange": "#ff8c47",
    "fieldSun": "#ffb548",
    # the wordmark: dark plum block, white letters; its thin rim runs gold -> pink -> magenta -> violet
    "ink": "#1d0030",
    "rimGold": "#f6ad1e", "rimCoral": "#ff7d7a", "rimPink": "#ff4fb4", "rimMagenta": "#d0108e", "rimViolet": "#86058a",
}

PEN = 7.0          # pen width (units), as Jasper's pen
TO_L = np.asarray(TO_LIGHT, float)


def shash(s):
    return zlib.crc32(s.encode()) & 0xFFFFFFFF


def R(seed_key):
    return np.random.default_rng(shash(seed_key))


def rnd(v, k=0):
    """round nested coordinates; k=0 gives integers (half a unit is 0.04% of the logo: visually lossless)"""
    if isinstance(v, np.ndarray):
        v = v.tolist()
    if isinstance(v, (list, tuple)):
        out = [rnd(x, k) for x in v]
        # drop consecutive duplicate points that rounding can create
        if out and isinstance(out[0], list) and len(out[0]) == 2 and all(isinstance(c, (int, float)) for c in out[0]):
            ded = [out[0]]
            for q in out[1:]:
                if q != ded[-1]:
                    ded.append(q)
            out = ded
        return out
    if isinstance(v, (float, np.floating)):
        return round(float(v), k) if k else int(round(float(v)))
    return v


# ---------------------------------------------------------------------------------------------
# official geometry
# ---------------------------------------------------------------------------------------------
O = official.load()
P = O["paths"]


def corners(pid, k):
    return [tuple(p) for p in svgpath.corners(P[pid]["subs"][k])]


def flat(pid, k, step=2.0):
    return svgpath.flatten(P[pid]["subs"][k], step)


SIL = corners("gta-path9", 0)            # VI silhouette (outer edge of the near-black keyline)
PURP = corners("gta-path10", 0)          # near-black -> purple boundary
WV, WI = corners("gta-path26", 0), corners("gta-path26", 1)     # white keyline, outer edges
FV, FI = corners("gta-path14", 0), corners("gta-path14", 1)     # colour field (inner edge of the keyline)
BLOCK_SUB = P["gta-path51"]["subs"][0]   # wordmark block (dark plum), with rounded corners
RIM_SUB = P["gta-path50"]["subs"][0]     # its thin gradient rim (outer edge)
LETTER_SUBS = P["gta-path49"]["subs"]    # letters (white) and their counters

# two samplings of each curved contour: for pencil strokes (points along straight runs carry the hand's
# wander) and for fills (straight runs need only their corners)
BLOCK = svgpath.flatten(BLOCK_SUB, 12.0, 4.0)
BLOCK_FILL = svgpath.flatten(BLOCK_SUB, 1e6, 6.0)
RIM = svgpath.flatten(RIM_SUB, 12.0, 4.0)
RIM_FILL = svgpath.flatten(RIM_SUB, 1e6, 6.0)


def oriented(poly, positive=True):
    return [tuple(p) for p in orient(np.asarray(poly, float), positive)]


def poly_inset(poly, d):
    """crude inset of a clockwise polygon by d units (vertex normal offset)"""
    a = np.asarray(poly, float)
    n = len(a)
    out = []
    for i in range(n):
        p, q, r = a[i - 1], a[i], a[(i + 1) % n]
        e1 = (q - p) / np.hypot(*(q - p))
        e2 = (r - q) / np.hypot(*(r - q))
        n1 = np.array([e1[1], -e1[0]])
        n2 = np.array([e2[1], -e2[0]])
        m = n1 + n2
        m /= max(1e-9, np.hypot(*m))
        c = max(0.35, float(np.dot(m, n1)))
        out.append(q - m * d / c)
    return out


# letters: classify outer contours vs counters, group counters with their letter
_outer, _counter = [], []
for k, sub in enumerate(LETTER_SUBS):
    poly = svgpath.flatten(sub, 12.0, 4.0)
    (_outer if area(np.asarray(poly)) < 0 else _counter).append((k, sub, poly))
FILL_OF = {k: svgpath.flatten(sub, 1e6, 6.0) for k, sub in enumerate(LETTER_SUBS)}


def bb(poly):
    a = np.asarray(poly)
    return a[:, 0].min(), a[:, 1].min(), a[:, 0].max(), a[:, 1].max()


# reading order: rows by top edge (grand / theft / auto), then left to right. The R of "grand" and the
# h of "theft" are one official contour; it is split for drawing (see letter_strokes).
ROWS = [("grand", -1000, -700), ("theft", -700, -465), ("auto", -465, -200)]


# ---------------------------------------------------------------------------------------------
# key-line strokes
# ---------------------------------------------------------------------------------------------
def walk(poly, i0, i1, forward=True):
    """vertices of closed polygon `poly` from index i0 to i1 inclusive, stepping forward or backward"""
    n = len(poly)
    out, i = [poly[i0 % n]], i0 % n
    while i != i1 % n:
        i = (i + 1) % n if forward else (i - 1) % n
        out.append(poly[i])
    return out


def dense(pts, step_line=5.0, keep=True):
    """resample a polyline segment by segment so the official corners stay exact"""
    pts = [np.asarray(p, float) for p in pts]
    out = [pts[0]]
    for a, b in zip(pts[:-1], pts[1:]):
        L = float(np.hypot(*(b - a)))
        n = max(1, int(math.ceil(L / step_line)))
        for k in range(1, n + 1):
            out.append(a + (b - a) * k / n)
    return np.asarray(out)


def seg_normals(q):
    d = np.gradient(q, axis=0)
    d /= np.maximum(1e-9, np.hypot(d[:, 0], d[:, 1]))[:, None]
    return np.stack([-d[:, 1], d[:, 0]], 1), d


def outward_of(q, form_polys, holes=(), probe=5.0):
    """per-point outward unit normal of the solid form (union(form_polys) - holes)"""
    nrm, _ = seg_normals(q)
    a, b = q + nrm * probe, q - nrm * probe

    def inside(pts):
        m = np.zeros(len(pts), bool)
        for fp in form_polys:
            m |= points_in_poly(pts, np.asarray(fp))
        for h in holes:
            m &= ~points_in_poly(pts, np.asarray(h))
        return m
    ia, ib = inside(a), inside(b)
    sgn = np.where(ib & ~ia, 1.0, np.where(ia & ~ib, -1.0, np.nan))
    good = ~np.isnan(sgn)
    if good.sum() and (~good).sum():
        idx = np.arange(len(q))
        sgn = np.sign(np.interp(idx, idx[good], sgn[good]))
    return nrm * np.nan_to_num(sgn)[:, None]


def lit_for(q, form_polys, holes=(), probe=5.0):
    """per-point dot(outward normal of the solid form, TO_LIGHT); form = union(form_polys) - holes"""
    nrm, _ = seg_normals(q)
    a = q + nrm * probe
    b = q - nrm * probe

    def inside(pts):
        m = np.zeros(len(pts), bool)
        for fp in form_polys:
            m |= points_in_poly(pts, np.asarray(fp))
        for h in holes:
            m &= ~points_in_poly(pts, np.asarray(h))
        return m
    ia, ib = inside(a), inside(b)
    out = np.where((ib & ~ia)[:, None], nrm, np.where((ia & ~ib)[:, None], -nrm, 0 * nrm))
    lit = out @ TO_L
    good = (ia ^ ib)
    if good.sum() and (~good).sum():
        idx = np.arange(len(q))
        lit = np.interp(idx, idx[good], lit[good])
    return lit


def make_stroke(sid, group, path, form, *, holes=(), word=None, line=None, ov=(0.0, 0.0), width=PEN,
                wob=0.8, step=12.0, k_lit=0.45, level=None, taper=None, tip=None, breaks=None, fade=None,
                curved=False, extra=None, push=0.0):
    """One graphite key-line stroke along an official polyline `path` (in drawing direction)."""
    rng = R(sid)
    q = dense(path, step) if not curved else np.asarray(path, float)
    # small overshoot past the corners at either end (the line runs on a little, as a hand does)
    if ov[0] > 0:
        d = q[0] - q[1]
        d /= np.hypot(*d)
        q = np.vstack([q[0] + d * ov[0], q])
    if ov[1] > 0:
        d = q[-1] - q[-2]
        d /= np.hypot(*d)
        q = np.vstack([q, q[-1] + d * ov[1]])
    # sub-unit wander along the normal (straight edges shouldn't be ruler-perfect)
    nrm, _ = seg_normals(q)
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(q, axis=0).T))])
    L = s[-1]
    nz = np.interp(s, np.linspace(0, L, 64), noise1d(64, shash(sid + "w"), 64 * 150 / max(L, 1)))
    qw = q + nrm * (wob * nz)[:, None]
    if push:   # sit the line a little outside the form (letters: the line merges into the slab)
        qw = qw + outward_of(q, form, holes) * push
    lit = lit_for(q, form, holes)
    weight = np.clip(1 - k_lit * smooth(lit, 3), 0.58, 1.42)
    wn = np.interp(s, np.linspace(0, L, 32), noise1d(32, shash(sid + "pw"), 32 * 70 / max(L, 1)))
    w = width * (1 + 0.07 * wn)
    pts = [[int(round(x)), int(round(y)), round(float(ww), 1)] for (x, y), ww in zip(qw, w)]
    keep = [i for i in range(len(pts)) if i == 0 or pts[i][:2] != pts[i - 1][:2]]
    pts, weight = [pts[i] for i in keep], weight[keep]
    st = {"id": sid, "group": group, "pts": pts}
    if word:
        st["word"] = word
    if line:
        st["line"] = line
    a = taper[0] if taper else float(rng.uniform(5, 12))
    b = taper[1] if taper else float(rng.uniform(10, 22))
    a, b = min(a, 0.3 * L), min(b, 0.4 * L)
    t0 = tip[0] if tip else float(rng.uniform(0.32, 0.55))
    t1 = tip[1] if tip else float(rng.uniform(0.08, 0.22))
    entry = {"group": group, "weight": [round(float(v), 2) for v in weight], "taper": [round(a, 1), round(b, 1)],
             "tip": [round(t0, 2), round(t1, 2)]}
    if level is not None:
        entry["level"] = level
    if breaks:
        entry["breaks"] = breaks
    if fade:
        entry["fade"] = fade
    if extra:
        entry.update(extra)
    return st, entry


# ---------------------------------------------------------------------------------------------
# the VI
# ---------------------------------------------------------------------------------------------
STROKES, LINES, SECOND = [], {}, []


def add(st_entry):
    st, e = st_entry
    STROKES.append(st)
    LINES[st["id"]] = e


VI_FORM = [SIL]

# Silhouette, raw corner order: 0 TL, 1 tip, 2 junction (V right arm meets the I), 3 I bottom-left,
# 4 I bottom-right, 5 I top-right, 6 top-left of the V's right arm, 7 notch, 8 top-right of the left arm.
S = SIL
vi_kw = dict(word="vi", line="vi")
add(make_stroke("vi-sil-top-l", "vi", [S[0], S[8]], VI_FORM, ov=(3, 2), taper=(9, 18), breaks=[[0.30, 0.36, 12]], **vi_kw))
add(make_stroke("vi-sil-v-left", "vi", [S[0], S[1]], VI_FORM, ov=(0, 6), taper=(5, 26), tip=(0.6, 0.12), **vi_kw))
add(make_stroke("vi-sil-notch", "vi", [S[8], S[7], S[6]], VI_FORM, ov=(2, 3), **vi_kw))
add(make_stroke("vi-sil-top-r", "vi", [S[6], S[5]], VI_FORM, ov=(0, 4), fade=[[0.15, 0.6, 0.55]], **vi_kw))
add(make_stroke("vi-sil-i-right", "vi", [S[5], S[4]], VI_FORM, ov=(2, 5), taper=(6, 14), **vi_kw))
add(make_stroke("vi-sil-i-left", "vi", [S[2], S[3], S[4]], VI_FORM, ov=(0, 3), **vi_kw))
add(make_stroke("vi-sil-v-right", "vi", [S[2], S[1]], VI_FORM, ov=(3, 7), taper=(8, 24), **vi_kw))

if KEYLINE == "lines":
    for nm, poly in (("v", WV), ("i", WI)):
        n = len(poly)
        add(make_stroke(f"vi-white-{nm}-a", "vi", walk(poly, 0, n // 2, True), [poly], level=0.82, width=6.4, **vi_kw))
        add(make_stroke(f"vi-white-{nm}-b", "vi", walk(poly, n // 2, n, True), [poly], level=0.82, width=6.4, **vi_kw))

# colour field, raw corner order (V): 0 TL, 1 tip, 2 right-arm TR, 3 right-arm TL, 4 notch, 5 left-arm TR
F = FV
fkw = dict(width=6.6, **vi_kw)
add(make_stroke("vi-field-top-l", "vi", [F[0], F[5]], [F], ov=(2, 0), fade=[[0.05, 0.5, 0.6]], **fkw))
add(make_stroke("vi-field-v-left", "vi", [F[0], F[1]], [F], ov=(0, 4), **fkw))
add(make_stroke("vi-field-notch", "vi", [F[5], F[4], F[3]], [F], ov=(1, 2), **fkw))
add(make_stroke("vi-field-top-r", "vi", [F[3], F[2]], [F], ov=(0, 3), **fkw))
add(make_stroke("vi-field-v-right", "vi", [F[2], F[1]], [F], ov=(2, 5), **fkw))
# I field, raw corners: 0 TL, 1 BL, 2 BR, 3 TR
I = FI
add(make_stroke("vi-field-i-a", "vi", [I[0], I[3], I[2]], [I], ov=(3, 4), **fkw))
add(make_stroke("vi-field-i-b", "vi", [I[0], I[1], I[2]], [I], ov=(0, 3), **fkw))

SECOND += [
    {"stroke": "vi-sil-v-left", "from": 0.22, "to": 0.62, "offset": 2.8, "level": 0.36},
    {"stroke": "vi-sil-i-right", "from": 0.35, "to": 0.85, "offset": -2.6, "level": 0.34},
]


# ---------------------------------------------------------------------------------------------
# the wordmark
# ---------------------------------------------------------------------------------------------
def contour_from_topleft(poly, ccw=True):
    """closed polygon re-started at its top-left-most vertex, running counter-clockwise on screen"""
    a = np.asarray(poly, float)
    a = orient(a, positive=not ccw)          # positive = clockwise on screen (y down)
    i = int(np.argmin(a[:, 0] + a[:, 1] * 1.15))
    return np.vstack([a[i:], a[:i]])


def closing(a, extra=7.0):
    """append a little run past the start (imperfect closure: the end overlaps the start)"""
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(a, axis=0).T))])
    k = int(np.searchsorted(s, extra))
    return np.vstack([a, a[: k + 1]])


def resample_curve(a, step):
    s = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(a, axis=0).T))])
    n = max(2, int(round(s[-1] / step)) + 1)
    t = np.linspace(0, s[-1], n)
    return np.stack([np.interp(t, s, a[:, 0]), np.interp(t, s, a[:, 1])], 1)


BLOCK_POS = oriented(BLOCK, True)
LETTERS = []   # dicts: outer poly, counters, name, row
for k, sub, poly in _outer:
    x0, y0, x1, y1 = bb(poly)
    ck = [kk for (kk, ss, c) in _counter if points_in_poly(np.asarray(c)[:1], np.asarray(poly))[0]]
    cs = [c for (kk, ss, c) in _counter if kk in ck]
    LETTERS.append({"k": k, "poly": poly, "counters": cs, "bbox": (x0, y0, x1, y1),
                    "fill": FILL_OF[k], "cfill": [FILL_OF[kk] for kk in ck]})


def row_of(y):
    for name, a, b in ROWS:
        if a <= y < b:
            return name
    return ROWS[-1][0]


# split the R+h contour at its neck (the narrowest crossing between the rows)
glyphs = []
for L_ in LETTERS:
    x0, y0, x1, y1 = L_["bbox"]
    if y1 - y0 > 380:      # spans two rows: R (grand) joined to h (theft)
        a = contour_from_topleft(L_["poly"])
        ycut = -700.0
        upper = a[:, 1] < ycut
        # the contiguous run of upper points (the R) and the rest (the h)
        idx = np.where(upper)[0]
        n = len(a)
        # rotate so the R run starts at index 0
        start = idx[0]
        for j in idx:
            if not upper[(j - 1) % n]:
                start = j
                break
        a = np.vstack([a[start:], a[:start]])
        upper = a[:, 1] < ycut
        end = int(np.argmin(upper))          # first non-upper index after the R run
        r_part = np.vstack([a[max(0, -1):end + 1]])
        h_part = np.vstack([a[end - 1:], a[:1]])
        rc = [c for c in L_["counters"] if bb(c)[1] < ycut]
        hc = [c for c in L_["counters"] if bb(c)[1] >= ycut]
        glyphs.append({"name": "R", "row": "grand", "x": x0, "path": r_part, "open": True, "counters": rc, "form": L_["poly"]})
        glyphs.append({"name": "h", "row": "theft", "x": -60.0, "path": h_part, "open": True, "counters": hc, "form": L_["poly"]})
    else:
        glyphs.append({"name": "?", "row": row_of(y0 + 30), "x": x0, "path": contour_from_topleft(L_["poly"]),
                       "open": False, "counters": L_["counters"], "form": L_["poly"]})

order = {"grand": 0, "theft": 1, "auto": 2}
glyphs.sort(key=lambda g: (order[g["row"]], g["x"]))
NAMES = {"grand": "grand", "theft": "theft", "auto": "auto"}
counts = {}

# the block outline first (the letterer blocks in the slab), in four strokes clockwise from the top-left
blk = orient(np.asarray(BLOCK, float), True)
i0 = int(np.argmin(blk[:, 0] + blk[:, 1] * 1.15))
blk = np.vstack([blk[i0:], blk[:i0]])
sb = np.concatenate([[0], np.cumsum(np.hypot(*np.diff(blk, axis=0).T))])
cuts = [0]
for f in (0.22, 0.5, 0.74):
    cuts.append(int(np.searchsorted(sb, f * sb[-1])))
cuts.append(len(blk))
wkw = dict(word="block", line="word")
for j in range(4):
    seg = blk[cuts[j]: cuts[j + 1] + 1] if j < 3 else np.vstack([blk[cuts[j]:], blk[:2]])
    add(make_stroke(f"word-block-{j}", "word", seg, [BLOCK_POS], ov=(2 if j else 0, 3), curved=True, width=7.0, **wkw))

for g in glyphs:
    row = g["row"]
    counts[row] = counts.get(row, 0) + 1
    gid = f"word-{row}-{counts[row]}"
    kw = dict(word=row, line="word", width=5.4, level=0.92, k_lit=0.38, curved=True, push=1.8)
    pth = np.asarray(g["path"], float)
    if not g["open"]:
        pth = closing(pth, 6.0)
    add(make_stroke(gid, "word", pth, [g["form"]], holes=g["counters"], taper=(5, 9), ov=(0, 0), **kw))
    for ci, c in enumerate(g["counters"]):
        cp = closing(contour_from_topleft(c), 4.0)
        add(make_stroke(f"{gid}-c{ci}", "word", cp, [g["form"]], holes=g["counters"], taper=(4, 6), **dict(kw, width=4.8, push=1.5)))


# ---------------------------------------------------------------------------------------------
# colour: regions (marker), keyline highlight, kage tone, rim colour pencil
# ---------------------------------------------------------------------------------------------
GRID = Grid((-760, -1130, 760, 40), res=0.5)


def mask_of(polys, holes=()):
    m = GRID.empty()
    for p in polys:
        m |= GRID.poly(np.asarray(p))
    for h in holes:
        m &= ~GRID.poly(np.asarray(h))
    return m


def polys_of(m, eps=0.7, min_area=60.0):
    return [rnd(p) for p in GRID.polys(m, eps=eps, min_area=min_area)]


def marker_edge(y0, x0, x1, *, key, dirn=+1, W=40.0, slope=0.0, wave=10.0, jitter=7.0, nib=+1):
    """A colour boundary laid by marker strokes running across it (roughly vertical): a row of
    chisel ends at uneven lengths, cut mostly at the same angle (one nib, one hand).
    dirn=+1: the ends point down (the colour is above)."""
    rng = R("edge" + key)
    xc = 0.5 * (x0 + x1)
    wv = noise1d(256, shash("wave" + key), 256 * 4.0 * W / (x1 - x0 + 1))
    xs = np.linspace(x0, x1, 256)
    pts = []
    x = x0 - 10
    while x < x1 + 10:
        w = W * (0.6 + 0.8 * rng.random())
        k = rng.random()
        if k < 0.08:
            e = -(0.5 + 0.4 * rng.random()) * W              # stopped early
        elif k < 0.15:
            e = (0.3 + 0.35 * rng.random()) * W              # ran on
        else:
            e = (rng.random() - 0.5) * 2 * jitter
        e += wave * np.interp(x + w / 2, xs, wv)
        sg = nib if rng.random() < 0.82 else -nib
        slant = sg * (0.22 + 0.38 * rng.random()) * w
        cap = w * (0.05 + 0.12 * rng.random())
        for f in np.linspace(0, 1, 9):
            tipf = slant * (f - 0.5) + cap * (math.sqrt(max(0.0, math.sin(math.pi * f))) - 1)
            xx = x + w * f
            pts.append([xx, y0 + slope * (xx - xc) + dirn * (e + tipf)])
        x += w
    return np.asarray(pts)


def half_plane(edge, side, far=2000):
    """polygon: everything above (side=-1) or below (side=+1) a left-to-right edge polyline"""
    yb = side * far
    return np.vstack([edge, [[edge[-1, 0], yb], [edge[0, 0], yb]]])


FIELD = mask_of([FV, FI])
fx0, fy0, fx1, fy1 = -650, -1040, 680, -70
# gradient span of the official field (linearGradient40): t = 0 at y=-1032.6, t = 1 at y=-108.4
def y_at(t):
    return -1032.6 + t * (1032.6 - 108.4)


BANDS = [   # name, colour, t of its lower boundary (None = runs to the bottom)
    ("field-blue", "fieldBlue", 0.20),
    ("field-orchid", "fieldOrchid", 0.42),
    ("field-pink", "fieldPink", 0.64),
    ("field-orange", "fieldOrange", None),
]
regions, region_order = {}, []

# the plum keyline band and its magenta-purple base
BAND = mask_of([SIL], [WV, WI])
low_edge = marker_edge(y_at(0.66) + 0, -720, 720, key="plumlow", dirn=-1, W=30, slope=0.02, wave=8, jitter=7)
LOWM = BAND & mask_of([half_plane(low_edge, +1)])
regions["vi-plum"] = {"group": "vi", "color": "plum", "shade": "plumDeep", "inset": -1.6,
                      "polys": rnd([oriented(SIL)]), "holes": rnd([oriented(WV, False), oriented(WI, False)])}
regions["vi-plum-low"] = {"group": "vi", "color": "plumLow", "shade": "plumDeep", "inset": -0.6,
                          "polys": polys_of(LOWM)}
region_order += ["vi-plum", "vi-plum-low"]

# field bands, painted bottom-up so each band's marker ends lie over the band below it
band_masks = []
prev_bottom = None
for i, (name, col, tb) in enumerate(BANDS):
    top_m = GRID.empty() | True
    if i > 0:
        # runs up under the band above (hidden there), so no paper shows at the seam
        t_prev = BANDS[i - 1][2]
        e = marker_edge(y_at(t_prev) - 44, -720, 720, key=name + "top", dirn=-1, W=70, wave=4, jitter=3)
        top_m = mask_of([half_plane(e, +1)])
    bot_m = GRID.empty() | True
    if tb is not None:
        e = marker_edge(y_at(tb), -720, 720, key=name + "bot", dirn=+1, W=40,
                        slope=float(R(name).uniform(-0.035, 0.035)), wave=11, jitter=7)
        bot_m = mask_of([half_plane(e, -1)])
    band_masks.append((name, col, FIELD & top_m & bot_m))

# the warm sun spot over the orange (official radialGradient37, centred between the V's tip and the I)
th = np.linspace(0, 2 * math.pi, 220, endpoint=False)
rr_ = 1 + 0.035 * noise1d(220, shash("sun"), 30) + 0.02 * np.sin(th * 9 + 1.3)
sun = np.stack([150 + 330 * rr_ * np.cos(th), -40 + 280 * rr_ * np.sin(th)], 1)
SUNM = FIELD & mask_of([sun])

for name, col, m in reversed(band_masks):
    regions[name] = {"group": "vi", "color": col, "shade": col, "retreat": 0.45, "polys": polys_of(m)}
    if name == "field-blue":
        # the colourist stopped short at the lit end: the top of the V's left arm
        regions[name].update({"litFade": 0.025, "strokeAngle": 64})
    region_order.append(name)
    if name == "field-orange":
        regions["field-sun"] = {"group": "vi", "color": "fieldSun", "shade": "fieldSun", "retreat": 0.3,
                                "polys": polys_of(SUNM)}
        region_order.append("field-sun")

# wordmark block: dark plum slab, the letters left as paper (holes), counters filled again (even-odd)
BLOCK_FPOS = oriented(BLOCK_FILL, True)
# The colour layer sits off-register up-right of the line (Pencil.config.register, default [2.2, -1.6], +-0.5
# per seed). For the slab's holes (the white letters) that would put plum inside the letters' top-right
# edges, so the holes are pre-shifted against it and grown by the jitter: the slab colour then meets the
# letter edges, under their graphite outline, and the letters stay clean paper.
REGISTER, HOLE_GROW = (2.2, -1.6), 0.6


def hole_shift(poly):
    return [(x - REGISTER[0], y - REGISTER[1]) for x, y in poly]


letter_hatch = [oriented(poly_inset(oriented(L_["fill"], True), -HOLE_GROW), False) for L_ in LETTERS]
counter_hatch = [oriented(poly_inset(oriented(c, True), HOLE_GROW), True) for L_ in LETTERS for c in L_["cfill"]]
letter_polys = [hole_shift(p) for p in letter_hatch]
counter_polys = [hole_shift(p) for p in counter_hatch]
regions["word-block"] = {"group": "word", "color": "ink", "shade": "ink", "inset": -1.6,
                         "polys": rnd([BLOCK_FPOS]), "holes": rnd(letter_polys + counter_polys)}
# a second coat of the dark marker, so the slab reads near-solid #1d0030 at the resting colour (phone legibility)
regions["word-block-2"] = dict(regions["word-block"], inset=-1.0)
region_order += ["word-block", "word-block-2"]


def keyhole(outer, holes):
    """one ring for scanline hatching: outer, then each hole joined by a doubled zero-width bridge"""
    o = [list(p) for p in outer]
    ring = o + [o[0]]
    for h in holes:
        hh = [list(p) for p in h]
        ring += hh + [hh[0], o[0]]
    return rnd(ring)


shadows = []
# the near-black outer half of the dark keyline (official path9), as the band's second marker tone
shadows.append({"id": "vi-keyline-deep", "group": "vi", "on": ["vi-plum", "vi-plum-low"],
                "polys": [keyhole(oriented(SIL), [oriented(PURP, False)])], "edge": []})
# genga: graphite hatching in the dark keyline, thinning toward the light (found on the shadow side)
shadows.append({"id": "vi-keyline-hatch", "group": "vi", "on": [], "edge": [], "noFill": True,
                "polys": [keyhole(oriented(SIL), [oriented(WV, False), oriented(WI, False)])],
                "hatch": {"color": "graphite", "spacing": 6.5, "level": 0.5, "keep": 0.3, "fade": 0.9, "full": True,
                          "width": 2.1}})
# genga: the wordmark slab as a dense graphite fill around the paper letters
shadows.append({"id": "word-block-hatch", "group": "word", "on": [], "edge": [], "noFill": True,
                "polys": [keyhole(BLOCK_FPOS, letter_hatch + counter_hatch)],
                "hatch": {"color": "graphite", "spacing": 3.6, "level": 0.62, "keep": 0.4, "fade": 0.3, "full": True,
                          "width": 2.3, "maxLen": 40}})

# the white keyline: paper left on purpose (cut out of the colour), with a blue genga edge outside
highlights = []
if KEYLINE == "highlight":
    for nm, wpoly, fpoly in (("v", WV, FV), ("i", WI, FI)):
        ring = keyhole(oriented(wpoly), [oriented(fpoly, False)])
        e = dense(list(oriented(wpoly)) + [oriented(wpoly)[0]], 12.0)
        highlights.append({"id": f"keyline-{nm}", "group": "vi", "poly": ring, "edge": [rnd(e)]})


# the wordmark's thin rim: coloured-pencil passes hugging the slab, gold at the top-left through pink and
# magenta to violet at the bottom-right (official radialGradient58)
def rim_strokes():
    out = []
    a = orient(np.asarray(RIM, float), True)
    blk_ = np.asarray(BLOCK_POS)
    # centre the pencil between the slab's edge and the official rim edge, nudged out from under the line
    i0 = int(np.argmin(a[:, 0] + a[:, 1] * 1.15))
    a = np.vstack([a[i0:], a[:i0]])
    a = resample_curve(np.vstack([a, a[:1]]), 4.0)
    nrm, _ = seg_normals(a)   # clockwise ring: outward is -normal? test with a probe
    test = a + nrm * 4
    inside = points_in_poly(test, blk_)
    sign = np.where(inside, -1.0, 1.0)[:, None]
    a = a + nrm * sign * 1.2
    proj = (a - [-340, -990]) @ np.array([0.62, 0.78])
    t = (proj - proj.min()) / (proj.max() - proj.min())
    cols = [(0.0, "rimGold"), (0.12, "rimCoral"), (0.3, "rimPink"), (0.55, "rimMagenta"), (0.8, "rimViolet")]

    def col_at(tt):
        c = cols[0][1]
        for t0, nm in cols:
            if tt >= t0:
                c = nm
        return c
    labels = [col_at(tt) for tt in t]
    # runs of one colour, each extended a little past its neighbours (the pencils overlap)
    runs, j0 = [], 0
    for j in range(1, len(a) + 1):
        if j == len(a) or labels[j] != labels[j0]:
            runs.append((labels[j0], j0, j))
            j0 = j
    rng = R("rim")
    for k, (c, ja, jb) in enumerate(runs):
        ja2, jb2 = max(0, ja - 3), min(len(a), jb + 3)
        seg = a[ja2:jb2]
        if len(seg) < 4:
            continue
        # long runs are laid in two or three pencil passes
        npass = max(1, int(round((jb2 - ja2) * 4.0 / 520)))
        bounds = np.linspace(0, len(seg), npass + 1).astype(int)
        for p in range(npass):
            s0, s1 = max(0, bounds[p] - 3), min(len(seg), bounds[p + 1] + 3)
            q = seg[s0:s1]
            if len(q) < 4:
                continue
            n = len(q)
            f = np.linspace(0, 1, n)
            taper = np.minimum(1, np.minimum(f * n * 4.0 / 10, (1 - f) * n * 4.0 / 16)) ** 0.7
            wv = 5.2 * (0.55 + 0.45 * taper) * (1 + 0.1 * noise1d(n, shash(f"rimw{k}{p}"), 20))
            pr = (0.62 + 0.12 * noise1d(n, shash(f"rimp{k}{p}"), 26)) * (0.55 + 0.45 * taper)
            out.append({"id": f"word-rim-{k}-{p}", "group": "word", "color": c,
                        "pts": [[int(round(x)), int(round(y)), round(float(w_), 1), round(float(pp), 2)] for (x, y), w_, pp in zip(q, wv, pr)]})
    return out


color_strokes = rim_strokes()


# ---------------------------------------------------------------------------------------------
# construction (blue col-erase): a letterer's guides, sparse
# ---------------------------------------------------------------------------------------------
def hand(p0, p1, key, amp=1.2, step=14.0):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    L = float(np.hypot(*(p1 - p0)))
    n = max(3, int(L / step))
    t = np.linspace(0, 1, n)[:, None]
    q = p0 + (p1 - p0) * t
    d = (p1 - p0) / L
    nn = np.array([-d[1], d[0]])
    bow = float(R(key).uniform(-1, 1)) * L * 0.004
    q = q + nn * (amp * noise1d(n, shash(key), n * 140 / L) + bow * 4 * (t[:, 0] * (1 - t[:, 0])))[:, None]
    return rnd(q)


def along(p0, p1, a, b):
    p0, p1 = np.asarray(p0, float), np.asarray(p1, float)
    d = p1 - p0
    return p0 + d * a, p0 + d * b


cons = []
# top guide across the VI, run on past both ends
cons.append({"group": "vi", "pts": hand((-748, -1086.5), (712, -1084.5), "c-top"), "level": 0.4, "width": 2.6})
# the V's two outer edges, extended so they cross below the tip (the V is constructed as two lines)
a, b = along(S[0], S[1], -0.04, 1.035)
cons.append({"group": "vi", "pts": hand(a, b, "c-vl"), "level": 0.36, "width": 2.5})
a, b = along(S[2], S[1], -0.08, 1.06)
cons.append({"group": "vi", "pts": hand(a, b, "c-vr"), "level": 0.34, "width": 2.4})
# the base line under the I, running back toward the V's tip
cons.append({"group": "vi", "pts": hand((735, -24.5), (-90, -23.0), "c-base"), "level": 0.36, "width": 2.4})
# the I's right edge, run up past the top
cons.append({"group": "vi", "pts": hand((700.6, 14), (699.8, -1118), "c-iright"), "level": 0.3, "width": 2.3})
# wordmark: ruled guides for the three rows (cap line of 'rand', the rows' baselines)
# wordmark: a ruled guide just above the slab and one just below it (none through the white letters)
cons.append({"group": "word", "pts": hand((-392, -1005.0), (318, -1003.6), "c-w1"), "level": 0.4, "width": 2.4})
cons.append({"group": "word", "pts": hand((-262, -217.2), (560, -218.6), "c-w4"), "level": 0.34, "width": 2.3})


# ---------------------------------------------------------------------------------------------
# assemble
# ---------------------------------------------------------------------------------------------
allx = [p[0] for s in STROKES for p in s["pts"]] + [p[0] for c in cons for p in c["pts"]]
ally = [p[1] for s in STROKES for p in s["pts"]] + [p[1] for c in cons for p in c["pts"]]
bounds = [math.floor(min(allx) - 8), math.floor(min(ally) - 8), math.ceil(max(allx) + 8), math.ceil(max(ally) + 8)]
blk_bb = bb(BLOCK)
GROUPBOX = {}
for gname in ("vi", "word"):
    xs = [p[0] for s_ in STROKES if s_["group"] == gname for p in s_["pts"]]
    ys = [p[1] for s_ in STROKES if s_["group"] == gname for p in s_["pts"]]
    for r_ in regions.values():
        if r_["group"] == gname:
            for q in r_["polys"]:
                xs += [p[0] for p in q]
                ys += [p[1] for p in q]
    GROUPBOX[gname] = [round(min(xs), 1), round(min(ys), 1), round(max(xs), 1), round(max(ys), 1)]

style = {
    "figure": "logo",
    "bounds": bounds,
    "designSeed": 23,
    "palette": PALETTE,
    "groups": {
        "vi": {"parent": None, "pivot": [0, 0]},
        "word": {"parent": None, "pivot": [round((blk_bb[0] + blk_bb[2]) / 2, 1), round((blk_bb[1] + blk_bb[3]) / 2, 1)]},
    },
    "lines": LINES,
    "second": SECOND,
    "regions": regions,
    "regionOrder": region_order,
    "shadows": shadows,
    "highlights": highlights,
    "colorStrokes": color_strokes,
    "construction": cons,
    "occluders": [
        {"group": "vi", "poly": rnd(poly_inset(oriented(SIL), 1.5))},
        {"group": "word", "poly": rnd(oriented(RIM_FILL))},
    ],
    "groupBox": GROUPBOX,
    "slabStrokes": [s_["id"] for s_ in STROKES if s_["id"].startswith("word-block-")],
    "penSpeed": 5000,
    "anchor": [0, 0],
    "size": [1400.0, round(official.VIEW[1] * O["K"], 1)],
    "keyline": KEYLINE,
}

strokes = {
    "figure": "logo",
    "unit": "100 = one ruled-line spacing",
    "source": "Wikimedia Commons 'Grand Theft Auto VI logo.svg' (public-domain trace of the official mark), "
              "via jaden.html <symbol id=gtaVI/gtaWord>; logo 1400 units wide, anchor = base centre",
    "groups": {"vi": [s["id"] for s in STROKES if s["group"] == "vi"],
               "word": [s["id"] for s in STROKES if s["group"] == "word"]},
    "strokes": STROKES,
}


# ---------------------------------------------------------------------------------------------
# the crisp official fallback (dev comparison flag): standalone SVGs in logo units, one per group
# ---------------------------------------------------------------------------------------------
def official_svg(sym_id):
    sym = O["symbols"][sym_id]
    inner = sym[sym.index(">") + 1: sym.rindex("</symbol>")]
    K, (ax, ay) = O["K"], O["anchor"]
    W_, H_ = 1400.0, official.VIEW[1] * K
    vb = f"{-W_ / 2:.3f} {-H_:.3f} {W_:.3f} {H_:.3f}"
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="%s" width="%.0f" height="%.0f"><defs>%s</defs>'
            '<g transform="scale(%.9f) translate(%.6f %.6f)">%s</g></svg>') % (
        vb, W_, H_, O["defs"], K, -ax, -ay, inner)


def compact(s):
    import re
    s = re.sub(r'\s+id="gta-(?:stop|path|g)\d+"', "", s)
    s = re.sub(r"stop-opacity:1;?", "", s)
    s = re.sub(r"\s+", " ", s)
    return s.replace(";stop-color:#000000", "").replace(' style=""', "")


SVG_VI, SVG_WORD = compact(official_svg("gtaVI")), compact(official_svg("gtaWord"))

OFFICIAL_JS = r"""
// The crisp official mark, for a dev comparison flag. Same units, anchor and groups as JADEN.logo:
//   JADEN.logoOfficial.draw(ctx, {x, y, scale, groups: {vi: {...}, word: {...}}})  -> true once loaded
// Group transforms follow Pencil.render: translate(x, y), then rotate/scale about the pivot; alpha.
window.JADEN.logoOfficial = (function () {
  const svg = { vi: %s, word: %s };
  const bounds = %s, pivots = %s;
  const img = {};
  const ready = Promise.all(Object.keys(svg).map((k) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { img[k] = im; res(); };
    im.onerror = () => res();
    im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg[k]);
  })));
  function draw(ctx, opts) {
    opts = opts || {};
    if (!img.vi || !img.word) return false;
    const G = opts.groups || {};
    ctx.save();
    ctx.translate(opts.x || 0, opts.y || 0);
    if (opts.scale) ctx.scale(opts.scale, opts.scale);
    if (G.root) applyGroup(ctx, G.root, [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2]);
    for (const k of ['vi', 'word']) {
      const g = G[k] || {};
      if (g.visible === false || g.alpha === 0) continue;
      ctx.save();
      applyGroup(ctx, g, g.pivot || pivots[k]);
      ctx.globalAlpha *= g.alpha === undefined ? 1 : g.alpha;
      ctx.drawImage(img[k], bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
      ctx.restore();
    }
    ctx.restore();
    return true;
  }
  function applyGroup(ctx, g, pv) {
    if (g.x || g.y) ctx.translate(g.x || 0, g.y || 0);
    if (g.rot || (g.scale !== undefined && g.scale !== 1)) {
      ctx.translate(pv[0], pv[1]);
      if (g.rot) ctx.rotate(g.rot);
      if (g.scale !== undefined) ctx.scale(g.scale, g.scale);
      ctx.translate(-pv[0], -pv[1]);
    }
  }
  return { svg, bounds, pivots, ready, draw };
})();
""" % (json.dumps(SVG_VI), json.dumps(SVG_WORD),
       json.dumps([-700.0, -round(official.VIEW[1] * O["K"], 3), 700.0, 0.0]),
       json.dumps({k: v["pivot"] for k, v in style["groups"].items()}))

RENDER_JS = r"""
// Draw the whole logo the way the official mark layers: the VI, then the wordmark over it. The
// wordmark's slab (out to its rim) is first filled with fresh paper, matching Pencil.paper, so the VI's
// lines and colour don't show through the white letters. Takes Pencil.render's options (seed, color,
// colorSeed, reg, weight, build/draw, groups.vi / groups.word / groups.root, only, alpha, x, y, scale,
// layers). During a write-on the slab is papered out once its outline is complete (as if the VI under
// it were erased then). opts.knockoutVI also papers out what's behind the VI (e.g. a sky wash);
// layers.knockout === false skips all paper fills.
// Two-hit reveal: each part draws alone with its own paper-out, under its own group transform:
//   the VI rising:      render(ctx, {..., knockoutVI: true, groups: {vi: {y, sx, sy}, word: {visible: false}}})
//   the wordmark slam:  render(ctx, {..., knockoutVI: true, groups: {vi: {...}, word: {scale, alpha}}})
//   (or only: 'vi' / only: 'word'; a wordmark with alpha < 1 papers out at that alpha, for multiples)
window.JADEN.logo.render = function (ctx, opts) {
  opts = opts || {};
  const fig = window.JADEN.logo, st = fig.style, G = opts.groups || {}, L = opts.layers || {};
  const only = opts.only ? [].concat(opts.only) : null;
  const want = (n) => (!only || only.indexOf(n) >= 0) && (G[n] || {}).visible !== false && (G[n] || {}).alpha !== 0;
  const off = { visible: false }, layers = Object.assign({}, L, { knockout: false });
  const prog = progress(opts);
  if (want('vi')) {
    if (opts.knockoutVI && L.knockout !== false) knock(ctx, opts, 'vi');
    Pencil.render(ctx, fig, Object.assign({}, opts, { only: null, groups: Object.assign({}, G, { word: off }), layers }));
  }
  if (want('word')) {
    const slabDone = st.slabStrokes.every((id) => prog(id) >= 1);
    if (L.knockout !== false && slabDone) knock(ctx, opts, 'word');
    Pencil.render(ctx, fig, Object.assign({}, opts, { only: null, groups: Object.assign({}, G, { vi: off }), layers }));
  }

  // write-on progress per stroke id, read the way Pencil.render reads `draw` / `build.line`
  function progress(o) {
    const d = o.draw !== undefined ? o.draw : o.build && o.build.line !== undefined ? o.build.line : undefined;
    if (d === undefined || d === null) return () => 1;
    const tl = fig._logoTl || (fig._logoTl = Pencil.timeline(fig));
    const idx = {};
    tl.forEach((t, i) => (idx[t.id] = i));
    if (typeof d === 'number') return (id) => { const t = tl[idx[id]]; return d >= 1 ? 1 : Math.max(0, Math.min(1, (d - t.start) / ((t.end - t.start) || 1e-6))); };
    if (typeof d === 'function') return (id) => d(id, idx[id]);
    if (Array.isArray(d)) return (id) => (d[idx[id]] === undefined ? 1 : d[idx[id]]);
    return (id) => (d[id] === undefined ? 1 : d[id]);
  }

  // fresh paper inside one group's occluder, under the same transforms Pencil.render applies
  function knock(ctx, o, name) {
    const oc = st.occluders.find((q) => q.group === name);
    const g = G[name] || {}, R = G.root;
    const a = (o.alpha === undefined ? 1 : o.alpha) * (g.alpha === undefined ? 1 : g.alpha) * (R && R.alpha !== undefined ? R.alpha : 1);
    if (!oc || a <= 0.001) return;
    const b = st.bounds, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
    const det = (m) => Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
    ctx.save();
    if (o.x || o.y) ctx.translate(o.x || 0, o.y || 0);
    if (o.scale) ctx.scale(o.scale, o.scale);
    if (o.reg) { ctx.translate((o.reg.dx || 0) + cx, (o.reg.dy || 0) + cy); if (o.reg.rot) ctx.rotate(o.reg.rot); ctx.translate(-cx, -cy); }
    const k0 = det(ctx.getTransform());          // the page's paper grain is sized at this scale
    if (R) {
      const pv = R.pivot || [cx, cy];
      ctx.translate((R.x || 0) + pv[0], (R.y || 0) + pv[1]);
      if (R.rot) ctx.rotate(R.rot);
      if (R.scale !== undefined) ctx.scale(R.scale, R.scale);
      ctx.translate(-pv[0], -pv[1]);
      if ((R.sx !== undefined && R.sx !== 1) || (R.sy !== undefined && R.sy !== 1)) {
        const ox = R.ox !== undefined ? R.ox : cx, oy = R.oy !== undefined ? R.oy : b[3];
        ctx.translate(ox, oy); ctx.scale(R.sx === undefined ? 1 : R.sx, R.sy === undefined ? 1 : R.sy); ctx.translate(-ox, -oy);
      }
    }
    const pv = g.pivot || st.groups[name].pivot;
    if (g.x || g.y) ctx.translate(g.x || 0, g.y || 0);
    if (g.rot || (g.scale !== undefined && g.scale !== 1)) {
      ctx.translate(pv[0], pv[1]);
      if (g.rot) ctx.rotate(g.rot);
      if (g.scale !== undefined) ctx.scale(g.scale, g.scale);
      ctx.translate(-pv[0], -pv[1]);
    }
    if ((g.sx !== undefined && g.sx !== 1) || (g.sy !== undefined && g.sy !== 1)) {
      const pr = Pencil._prepare ? Pencil._prepare(fig) : null;
      const gb = (pr && pr.groupBox && pr.groupBox[name]) || st.groupBox[name];
      const ox = g.ox !== undefined ? g.ox : (gb[0] + gb[2]) / 2, oy = g.oy !== undefined ? g.oy : gb[3];
      ctx.translate(ox, oy); ctx.scale(g.sx === undefined ? 1 : g.sx, g.sy === undefined ? 1 : g.sy); ctx.translate(-ox, -oy);
    }
    if (!oc._p) {
      oc._p = new Path2D();
      oc.poly.forEach(([x, y], i) => (i ? oc._p.lineTo(x, y) : oc._p.moveTo(x, y)));
      oc._p.closePath();
      oc._bb = oc.poly.reduce((r, [x, y]) => [Math.min(r[0], x), Math.min(r[1], y), Math.max(r[2], x), Math.max(r[3], y)], [Infinity, Infinity, -Infinity, -Infinity]);
    }
    ctx.clip(oc._p);
    const r = [oc._bb[0] - 2, oc._bb[1] - 2, oc._bb[2] - oc._bb[0] + 4, oc._bb[3] - oc._bb[1] + 4];
    if (a >= 0.999) Pencil.paper(ctx, r[0], r[1], r[2], r[3], { scale: k0 / det(ctx.getTransform()), color: st.palette.paper });
    else { ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = a; ctx.fillStyle = st.palette.paper; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.restore();
  }
};
"""


def block(v, ind):
    if isinstance(v, dict) and v and len(json.dumps(v)) > 400:
        items = [f'{ind}  {json.dumps(k)}: {block(x, ind + "  ")}' for k, x in v.items()]
        return "{\n" + ",\n".join(items) + "\n" + ind + "}"
    if isinstance(v, list) and v and isinstance(v[0], dict) and len(json.dumps(v)) > 400:
        return "[\n" + ",\n".join(ind + "  " + json.dumps(x, separators=(",", ":")) for x in v) + "\n" + ind + "]"
    return json.dumps(v, separators=(",", ":"))


js = ("// Generated by jaden-work/tools/logo/build.py from the official GTA VI trace in jaden.html.\n"
      "// Edit the builder, not this file. Notes: jaden-work/style/logo-NOTES.md\n"
      "// The crisp official mark (dev flag / fallback) is separate: resources/jaden/logo-official.js\n"
      "window.JADEN = window.JADEN || {};\n"
      "window.JADEN.logo = {\n  strokes: %s,\n  style: %s\n};\n%s") % (
    json.dumps(strokes, separators=(",", ":")), block(style, "  "), RENDER_JS)
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(js)
OFF = OUT.parent / "logo-official.js"
OFF.write_text("// Generated by jaden-work/tools/logo/build.py: the official GTA VI mark (Wikimedia Commons, public-domain\n"
               "// trace, via jaden.html), standalone so it still works if logo.style.js fails to load.\n"
               "window.JADEN = window.JADEN || {};" + OFFICIAL_JS)
print(f"wrote {OFF.relative_to(HERE.parents[2])}  ({OFF.stat().st_size / 1024:.0f} KB)")
nline = sum(len(s["pts"]) for s in STROKES)
print(f"wrote {OUT.relative_to(HERE.parents[2])}  ({len(js) / 1024:.0f} KB)  keyline={KEYLINE}")
print(f"  {len(STROKES)} strokes ({nline} pts), {len(regions)} regions, {len(shadows)} shadows, "
      f"{len(color_strokes)} rim strokes, bounds {bounds}")
print("  glyph order:", " ".join(f"{g['row']}:{round(g['x'])}" for g in glyphs))
