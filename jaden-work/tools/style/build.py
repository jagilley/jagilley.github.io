#!/usr/bin/env python3
"""Build style/<figure>.style.js from extract/<figure>/<figure>.strokes.json.

    jaden-work/venv/bin/python jaden-work/tools/style/build.py [box|ball|text ...]

The extracted strokes are copied verbatim (Jasper's geometry is the key line).
Everything in `style` is either derived from those strokes (fill regions, per-point
line weight) or designed on top of them (shadow/highlight shapes, construction).
The designed shapes are described below in plain numbers so they can be tuned.
"""
import json
import math
import sys
import zlib
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
from geom import (A, TO_LIGHT, Grid, area, band_var, clip_y, cumlen, ellipse, noise1d, offset,  # noqa: E402
                  orient, outward_lit, r1, r2, resample, smooth, tangents, wobble)

W = Path(__file__).resolve().parents[2]
EXT = W / "extract"
OUT = W.parent / "resources" / "jaden"      # canonical runtime location (jaden-work/style/ holds redirect stubs)

# Target colours as they should read on the paper. The renderer multiplies them onto paper.
PALETTE = {
    "paper": "#f3eee3",
    "graphite": "#3a3532",      # warm; density in the tooth, not darkness, carries line weight
    "blue": "#7aa6dc",          # col-erase construction / highlight boundaries
    "red": "#d4574d",           # shadow boundaries + kage hatching
    "teal": "#3fa79a", "tealShade": "#2a7c78",
    "pink": "#ee7290", "pinkShade": "#c04a6c",
    "violet": "#5d4eaf", "violetShade": "#3b2f7c",   # lighter than v1 so the line stays readable
    "lilac": "#b77be6", "lilacShade": "#7d4bb0",
    "rose": "#ff86c4", "roseShade": "#c9579a",
    "hole": "#231b36", "holeDeep": "#130e1e",
    "ground": "#b9b2bf",
}


def lerp_(a, b, t):
    return a + (b - a) * t


def shash(s):
    """Stable string hash (Python's hash() is salted per process)."""
    return zlib.crc32(s.encode()) & 0xFFFFFFFF


def tapers_from_w(s):
    """Uneven start/end tapers from Jasper's own pen-width profile: a heavy landing gives a short,
    blunt start (and a little extra pressure); a light flick gives a long fine end."""
    P = np.asarray(s["pts"], float)
    p, w = P[:, :2], P[:, 2]
    L = cumlen(p)
    tot = L[-1]
    med = float(np.median(w))
    k = min(8.0, tot / 3)
    ws = float(w[L <= k].mean()) / med
    we = float(w[L >= tot - k].mean()) / med
    rng = np.random.default_rng(shash(s["id"]))
    a = float(np.interp(ws, [0.75, 1.0, 1.25], [13, 7, 2.5])) * rng.uniform(0.7, 1.35)
    b = float(np.interp(we, [0.75, 1.0, 1.25], [22, 12, 4])) * rng.uniform(0.7, 1.35)
    a, b = min(a, 0.3 * tot), min(b, 0.45 * tot)
    t0 = float(np.interp(ws, [0.75, 1.0, 1.25], [0.28, 0.45, 0.8])) * rng.uniform(0.85, 1.15)
    t1 = float(np.interp(we, [0.75, 1.0, 1.25], [0.06, 0.16, 0.5])) * rng.uniform(0.85, 1.15)
    land = round(max(0.0, ws - 1.04) * 1.4, 2)
    return [round(a, 1), round(b, 1)], [round(t0, 2), round(t1, 2)], land


def load(fig):
    return json.loads((EXT / fig / f"{fig}.strokes.json").read_text())


def by_id(d):
    return {s["id"]: s for s in d["strokes"]}


def pts(s):
    return A(s["pts"])


def seg_between(p, x0, x1):
    """Points of polyline p whose x is within [x0,x1], in p's own order."""
    p = A(p)
    lo, hi = min(x0, x1), max(x0, x1)
    return p[(p[:, 0] >= lo) & (p[:, 0] <= hi)]


def frac_at(p, q):
    """Arc-length fraction of the point of polyline p nearest to q."""
    p = A(p)
    s = cumlen(p)
    i = int(np.argmin(np.hypot(*(p - q).T)))
    return float(s[i] / s[-1])


def mask_overlap(a, b, min_px=40):
    return int((a & b).sum()) >= min_px


def edge_inside(poly, mask, grid, min_len=12):
    """Pieces of polyline `poly` that lie inside `mask` (used to keep red boundary lines on the form)."""
    q = resample(poly, 2.0)
    ins = np.array([grid.inside(mask, *p) for p in q])
    out, cur = [], []
    for p, k in zip(q, ins):
        if k:
            cur.append(p)
        elif cur:
            out.append(np.array(cur)); cur = []
    if cur:
        out.append(np.array(cur))
    return [o for o in out if len(o) > 1 and cumlen(o)[-1] >= min_len]


def line_entry(group, weight, taper=(10, 14), breaks=None, level=None, width=None, extra=None, stroke=None):
    e = {"group": group, "weight": r2(weight), "taper": list(taper)}
    if stroke is not None:
        tp, tip, land = tapers_from_w(stroke)
        e["taper"], e["tip"] = tp, tip
        if land:
            e["land"] = land
    if breaks:
        e["breaks"] = breaks
    if level is not None:
        e["level"] = level
    if width is not None:
        e["width"] = width
    if extra:
        e.update(extra)
    return e


def weight_from_lit(lit, k=0.42):
    return np.clip(1 - k * lit, 0.55, 1.45)


def interior_weight(p, cx, cy, r, k=0.24):
    """Weight for interior lines: lighter toward the lit (upper-left) part of the form."""
    p = A(p)
    v = (p - [cx, cy]) / r
    lit = v @ TO_LIGHT
    return smooth(np.clip(1 - k * lit, 0.6, 1.35), 3)


# Coordinate precision in the written data (S3: smaller files, visually lossless). Jasper's own strokes
# (and designed extras) keep their positions: their pen timing reads curvature, which rounding would
# disturb; only their pen widths go to half units. Pencil-drawn marks keep half units (x, y, width;
# pressure to 0.05); filled shapes and the faint construction lines are whole units.
QUANT_KEEP = {"extraStrokes"}
QUANT_HALF = {"colorStrokes", "accents", "marks", "edge", "passes"}


def _qn(x, step):
    v = round(x / step) * step
    return int(v) if v == int(v) else v


def quant(v, mode="int"):
    if isinstance(v, dict):
        return {k: (x if k in QUANT_KEEP else quant(x, "half" if k in QUANT_HALF else mode)) for k, x in v.items()}
    if isinstance(v, (list, tuple)) and v and all(isinstance(p, (list, tuple)) and 2 <= len(p) <= 4 and
                                                  all(isinstance(c, (int, float)) for c in p) for p in v):
        if mode == "half":
            return [[_qn(c, 0.5) if i < 3 else round(round(c / 0.05) * 0.05, 2) if i == 3 else c for i, c in enumerate(p)] for p in v]
        return [[_qn(c, 1) if i < 2 else c for i, c in enumerate(p)] for p in v]
    if isinstance(v, (list, tuple)):
        return [quant(x, mode) for x in v]
    return v


def write(fig, data, style):
    """One compact line per style key (and per region / shadow / line) so diffs stay readable."""
    style = quant(style)
    data = dict(data, strokes=[dict(st, pts=[[c if i < 2 else _qn(c, 0.5) for i, c in enumerate(q)] for q in st["pts"]])
                               for st in data["strokes"]])
    def block(v, ind):
        if isinstance(v, dict) and v and len(json.dumps(v)) > 400:
            items = [f'{ind}  {json.dumps(k)}: {block(x, ind + "  ")}' for k, x in v.items()]
            return "{\n" + ",\n".join(items) + "\n" + ind + "}"
        if isinstance(v, list) and v and isinstance(v[0], dict) and len(json.dumps(v)) > 400:
            return "[\n" + ",\n".join(ind + "  " + json.dumps(x, separators=(",", ":")) for x in v) + "\n" + ind + "]"
        return json.dumps(v, separators=(",", ":"))
    js = ("// Generated by tools/style/build.py from extract/%s/%s.strokes.json. Edit the builder, not this file.\n"
          "window.JADEN = window.JADEN || {};\n"
          "window.JADEN.%s = {\n  strokes: %s,\n  style: %s\n};\n") % (
        fig, fig, fig, json.dumps(data, separators=(",", ":")), block(style, "  "))
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{fig}.style.js").write_text(js)
    print(f"wrote resources/jaden/{fig}.style.js  ({len(js) / 1024:.0f} KB)")


# --------------------------------------------------------------------------------------------
# BOX
# --------------------------------------------------------------------------------------------
def build_box():
    d = load("box")
    S = {k: pts(v) for k, v in by_id(d).items()}
    g = Grid((-20, -20, 900, 880))

    lid_poly = np.vstack([S["lid-top"], S["lid-right"], S["lid-bottom"], S["lid-left"]])
    m_lid = g.poly(lid_poly)

    br = S["body-right"]
    bb = S["body-bottom"]
    bb_in = bb[bb[:, 0] <= br[-1, 0] + 1]
    lb = S["lid-bottom"]
    body_poly = np.vstack([S["body-left"], bb_in, br[::-1], seg_between(lb, br[0, 0], S["body-left"][0, 0])])
    m_body = g.poly(body_poly) & ~m_lid

    rl, rr = S["ribbon-left"], S["ribbon-right"]
    rib_poly = np.vstack([rl, seg_between(bb, rl[-1, 0], rr[-1, 0]), rr[::-1], seg_between(lb, rr[0, 0], rl[0, 0])])
    m_rib = g.poly(rib_poly) & m_body

    rll, rrl = S["ribbon-left-lid"], S["ribbon-right-lid"]
    lt = S["lid-top"]
    ribl_poly = np.vstack([rll, seg_between(lb, rll[-1, 0], rrl[-1, 0])[::-1], rrl[::-1], seg_between(lt, rrl[0, 0], rll[0, 0])[::-1]])
    m_ribl = g.poly(ribl_poly) & m_lid

    m_loopL = g.poly(S["bow-loop-left"])
    m_loopR = g.poly(S["bow-loop-right"])
    m_loops = m_loopL | m_loopR

    band_poly = np.vstack([S["lid-band-upper"], S["lid-band-lower"][::-1]])
    m_band = g.poly(band_poly) & m_lid

    # bow tails are single lines: give them a narrow ribbon of colour, slightly off the line
    tailL = S["bow-tail-left"]
    tailR = S["bow-tail-right"]
    def tail_band(t):
        # a strip that hugs the line, thins toward the free end and stops ~4 units short of it
        q = resample(t, 1.5)
        q = q[cumlen(q) <= cumlen(q)[-1] - 4]
        prof = 12 * np.clip(np.linspace(1.15, 0.0, len(q)), 0.35, 1) ** 0.7
        return band_var(g, q + [2.5, 1.0], prof) & ~m_loops
    m_tailL = tail_band(tailL)
    m_tailR = tail_band(tailR)
    m_tails = m_tailL | m_tailR

    # a small knot for the bow group, so the bow keeps a centre when it flies off
    knot_poly = wobble(np.vstack([ellipse(612, 101, 27, 13, 0.08, 0, 2 * math.pi, 48)] * 1), 1.2, 30, 28, closed=True)
    m_knot_r = g.poly(knot_poly)

    # loops, knot and tails are painted over the lid colour afterwards (regionOrder), so the lid is not
    # cut out under them: when the bow flies off, the lid's colour is whole underneath
    m_band &= ~m_ribl
    m_lid_only = m_lid & ~m_ribl & ~m_band
    m_body_only = m_body & ~m_rib

    def reg(group, color, shade, m, min_area=80):
        ps = [r1(p) for p in g.polys(m) if abs(area(p)) > min_area]
        return {"group": group, "color": color, "shade": shade, "polys": ps}

    rmask = {"body": m_body_only, "ribbon": m_rib, "lid": m_lid_only, "lidBand": m_band, "lidRibbon": m_ribl,
             "knot": m_knot_r, "loopL": m_loopL, "loopR": m_loopR, "tailL": m_tailL, "tailR": m_tailR}
    spec = {"body": ("body", "teal", "tealShade"), "ribbon": ("body", "pink", "pinkShade"),
            "lid": ("lid", "teal", "tealShade"), "lidBand": ("lid", "pink", "pinkShade"),
            "lidRibbon": ("lid", "pink", "pinkShade"), "knot": ("bow", "pink", "pinkShade"),
            "loopL": ("bow", "pink", "pinkShade"), "loopR": ("bow", "pink", "pinkShade"),
            "tailL": ("bow", "pink", "pinkShade"), "tailR": ("bow", "pink", "pinkShade")}
    regions = {k: reg(*spec[k], rmask[k]) for k in spec}
    # marker stroke direction per region: the right-handed diagonal, except long thin bands follow their length
    for k, ang in {"ribbon": 84, "lidRibbon": 84, "lidBand": 4, "tailL": 102, "tailR": 64, "loopL": 34, "loopR": 40}.items():
        regions[k]["strokeAngle"] = ang
    for k, wdt in {"tailL": 9, "tailR": 9, "lidBand": 12, "loopL": 14, "loopR": 14, "knot": 10}.items():
        regions[k]["strokeWidth"] = wdt
    for k in ("tailL", "tailR", "knot"):
        regions[k].update({"inset": 0, "outset": 0, "retreat": 0.3})
    # the colourist gave up at the most-lit ends: the lid's left end and the body's top-left corner;
    # each bow loop keeps a bare crescent at its upper left
    regions["lid"]["litFade"] = 0.2
    regions["lidBand"]["litFade"] = 0.15
    regions["body"]["litFade"] = 0.1
    for k in ("loopL", "loopR"):
        regions[k]["crescent"] = 0.2

    # ---------------- designed shadow shapes (kage) ----------------
    shadows = []

    def add_shadow(sid, group, m, edges, hatch=None, tone=None, hosts=None):
        hosts = hosts if hosts is not None else [k for k, rm in rmask.items() if mask_overlap(m, rm)]
        polys = [r1(p) for p in g.polys(m) if abs(area(p)) > 30]
        if not polys:
            return
        e = {"id": sid, "group": group, "polys": polys, "on": hosts, "edge": [r1(x) for x in edges]}
        if hatch:
            e["hatch"] = hatch
        if tone:
            e["tone"] = tone
        shadows.append(e)

    m_front = m_body | m_lid  # any coloured surface of the box itself

    # 1. lid overhang casts a band onto the body (constant drop, hand-wobbled lower edge)
    x_l, x_r = S["body-left"][0, 0] - 6, br[0, 0] + 6
    top = seg_between(lb, x_r, x_l)[::-1]                   # left -> right along lid bottom
    drop = 20 + 2.5 * noise1d(len(resample(top, 3)), 3, 30)
    low = offset(top, 0, step=3) + np.stack([np.zeros(len(drop)) + 4, drop], 1)
    low = wobble(low, 1.6, 90, 5)
    cast_poly = np.vstack([top + [0, -4], low[::-1]])
    m_cast = g.poly(cast_poly) & m_body
    add_shadow("lidCast", "lidShadow", m_cast, edge_inside(low, m_body, g),
               hatch={"color": "red", "spacing": 5.2, "level": 0.5, "full": True, "fade": 0.12})

    # 2. right-hand side of the body turns away from the light
    rside = br.copy()
    wR = np.interp(rside[:, 1], [196, 779], [30, 40])
    inner = rside - np.stack([wR, np.zeros(len(wR))], 1)
    inner = wobble(inner, 1.8, 120, 9)
    m_rside = g.poly(np.vstack([rside + [8, 0], inner[::-1]])) & m_body & ~m_cast
    add_shadow("bodyRight", "body", m_rside, edge_inside(clip_y(inner, 214, 790), m_body, g),
               hatch={"color": "red", "spacing": 7.5, "level": 0.48})

    # 3. lid's right end, continuing the same side shadow up through the lid
    lr = S["lid-right"]
    lin = lr - [22, 0]
    m_lright = g.poly(np.vstack([lr + [10, 0], lin[::-1]])) & m_lid & ~m_loops
    add_shadow("lidRight", "lid", m_lright, edge_inside(wobble(lin, 1, 40, 2), m_lid, g),
               hatch={"color": "red", "spacing": 6.5, "level": 0.48})

    # 4. ribbon stands proud of the box: thin cast shadow on its right
    rc_in = rr[(rr[:, 1] > 205)] + [3.5, 0]
    rc_out = wobble(rr[(rr[:, 1] > 205)] + [12, 2], 1.3, 70, 4)
    m_rcast = g.poly(np.vstack([rc_in, rc_out[::-1]])) & m_body_only & ~m_cast
    add_shadow("ribbonCast", "body", m_rcast, edge_inside(rc_out, m_body, g),
               hatch={"color": "red", "spacing": 6, "level": 0.45})

    # 5. the knot shades the ribbon just under it on the lid
    m_knot = g.poly(np.vstack([[[570, 90], [656, 92]], ellipse(613, 101, 44, 17, 0.05, 0, math.pi, 40)])) & m_lid & ~m_loops
    add_shadow("knotCast", "bow", m_knot, edge_inside(ellipse(613, 101, 44, 17, 0.05, 0.15, math.pi - 0.2, 30), m_lid, g),
               hatch={"color": "red", "spacing": 5.5, "level": 0.45})

    # 6. bow loops coloured as ribbon: the inside of each loop (the back of the ribbon) is a curved
    #    teardrop of shade running from the knot, round end deep in the loop
    from scipy import ndimage as _ndi
    for nm, mk, K in (("loopL", m_loopL, (584.0, 100.0)), ("loopR", m_loopR, (646.0, 103.0))):
        ys, xs = np.nonzero(mk)
        C = np.array([xs.mean() * g.res + g.x0, ys.mean() * g.res + g.y0])
        w_, h_ = (xs.max() - xs.min()) * g.res, (ys.max() - ys.min()) * g.res
        K = np.array(K)
        head = K + 0.95 * (C - K)
        ax = head - K
        L = np.hypot(*ax)
        u = ax / L
        nrm = np.array([-u[1], u[0]])
        if nrm[1] < 0:
            nrm = -nrm                      # bend toward the lower (shadow) side of the loop
        R = 0.3 * min(w_, h_)
        t = np.linspace(0, 1, 60)
        hw = np.where(t < 0.72, R * (t / 0.72) ** 1.15, R * np.sqrt(np.clip(1 - ((t - 0.72) / 0.28) ** 2, 0, 1)))
        spine = K[None, :] + ax[None, :] * t[:, None] * 1.0 + nrm[None, :] * (0.16 * L * np.sin(np.pi * t))[:, None]
        tn = np.gradient(spine, axis=0)
        tn /= np.hypot(*tn.T)[:, None]
        pn = np.stack([-tn[:, 1], tn[:, 0]], 1)
        drop = np.vstack([spine + pn * hw[:, None], (spine - pn * hw[:, None])[::-1]])
        drop = wobble(np.vstack([drop, drop[:1]]), 0.8, 30, shash(nm) % 999, closed=True)
        m_c = g.poly(drop) & _ndi.binary_erosion(mk, iterations=int(5 / g.res))
        ep = g.polys(g.poly(drop))
        e = edge_inside(np.vstack([ep[0], ep[0][:1]]), _ndi.binary_erosion(mk, iterations=int(7 / g.res)), g, min_len=10) if ep else []
        add_shadow(nm + "Inside", "bow", m_c, e, hatch={"color": "red", "spacing": 5, "level": 0.45}, hosts=[nm])

    # 8. ground contact shadow (on the paper, its own tone)
    gb = bb.copy()
    gx = np.linspace(70, 850, 120)
    gy_top = np.interp(gx, gb[:, 0], gb[:, 1]) + 3
    th = np.interp(gx, [70, 300, 700, 780, 850], [2, 7, 14, 17, 2])
    th = th * (1 + 0.12 * noise1d(len(gx), 7, 25))
    gtop = np.stack([gx, gy_top], 1)
    gbot = np.stack([gx, gy_top + th], 1)
    m_ground = g.poly(np.vstack([gtop, gbot[::-1]])) & ~m_body
    add_shadow("ground", "ground", m_ground, [gbot[(gx > 380) & (gx < 835)]],
               hatch={"color": "graphite", "spacing": 5.5, "level": 0.32}, tone="ground", hosts=[])

    # no gloss marks on the box: the lit side reads through bare paper where the colour gave up
    highlights = []

    # ---------------- key-line hints ----------------
    form = {
        "lid-top": (m_lid, "lid"), "lid-right": (m_lid, "lid"), "lid-bottom": (m_lid, "lid"), "lid-left": (m_lid, "lid"),
        "lid-band-upper": (m_band, "lid"), "lid-band-lower": (m_band, "lid"), "lid-dash": (None, "lid"),
        "body-left": (m_body, "body"), "body-bottom": (m_body, "body"), "body-right": (m_body, "body"),
        "ribbon-left-lid": (m_ribl, "lid"), "ribbon-right-lid": (m_ribl, "lid"),
        "ribbon-left": (g.poly(rib_poly), "body"), "ribbon-right": (g.poly(rib_poly), "body"),
        "bow-loop-left": (m_loopL, "bow"), "bow-loop-right": (m_loopR, "bow"),
        "bow-tail-left": (None, "bow"), "bow-tail-right": (None, "bow"),
    }
    lines = {}
    for s in d["strokes"]:
        sid = s["id"]
        p = pts(s)
        mk, grp = form[sid]
        if mk is not None:
            lit = outward_lit(p, g, mk)
            w = weight_from_lit(lit)
        else:
            w = interior_weight(p, 424, 440, 420)
        lines[sid] = line_entry(grp, w, stroke=s)
    # interior band lines are lighter than the silhouette
    for sid in ("lid-band-upper", "lid-band-lower", "ribbon-left-lid", "ribbon-right-lid", "lid-dash"):
        lines[sid]["level"] = 0.82
        lines[sid]["weight"] = r2(0.92 + 0.45 * (np.array(lines[sid]["weight"]) - 1))
    # lost edges: the lid's lit top edge and the body's lit left edge break/fade once each
    lines["lid-top"]["breaks"] = [[0.17, 0.195]]
    lines["body-left"]["fade"] = [[0.06, 0.2, 0.3]]
    lines["lid-left"]["fade"] = [[0.45, 1.0, 0.55]]

    second = [
        {"stroke": "body-right", "from": 0.46, "to": 0.88, "offset": 6.5, "level": 0.4, "seed": 3},
        {"stroke": "body-bottom", "from": 0.58, "to": 0.98, "offset": 5.5, "level": 0.38, "seed": 4},
        {"stroke": "lid-left", "from": 0.05, "to": 0.85, "offset": -5.0, "level": 0.34, "seed": 5},
    ]

    # ---------------- construction (blue col-erase) ----------------
    cons = []
    # ground line, overshooting both corners
    gl = np.stack([np.linspace(28, 868, 40), np.interp(np.linspace(28, 868, 40), bb[:, 0], bb[:, 1]) + 1.5], 1)
    gl[:, 1] += np.linspace(-3, 3, 40)
    cons.append({"group": "body", "pts": r1(wobble(gl, 1.2, 160, 21)), "level": 0.55, "width": 3.0})
    # bow centre line: through the knot, from above the bow down to the lid top (no lower: it read as a crease)
    vx = np.stack([np.linspace(611, 608, 12), np.linspace(18, float(np.interp(609, lt[:, 0], lt[:, 1])) + 2, 12)], 1)
    cons.append({"group": "body", "pts": r1(wobble(vx, 1.4, 200, 22)), "level": 0.5, "width": 2.8})
    # lid box guide: the lid top run long, and a short guide for the lid's lower edge
    lg = np.stack([np.linspace(14, 866, 40), np.interp(np.linspace(14, 866, 40), lt[:, 0], lt[:, 1]) - 2.5], 1)
    cons.append({"group": "lid", "pts": r1(wobble(lg, 1.3, 150, 23)), "level": 0.5, "width": 2.8})
    lbx = np.linspace(4, 250, 16)
    lbg = np.stack([lbx, np.interp(lbx, lb[::-1, 0], lb[::-1, 1]) + 3.5], 1)
    cons.append({"group": "lid", "pts": r1(wobble(lbg, 1.0, 90, 24)), "level": 0.45, "width": 2.6})

    occluders = [{"group": "lid", "poly": r1(orient(lid_poly))},
                 {"group": "body", "poly": r1(orient(body_poly))},
                 {"group": "bow", "poly": regions["loopL"]["polys"][0]},
                 {"group": "bow", "poly": regions["loopR"]["polys"][0]},
                 {"group": "bow", "poly": r1(orient(knot_poly))}]

    # a rim for the body's open top, hidden until the lid lifts (render with show:['body-rim'])
    rim = seg_between(lb, S["body-left"][0, 0] + 2, br[0, 0] - 2)[::-1] + [0, 3]
    rim = wobble(rim, 0.8, 120, 27)
    extra = [{"id": "body-rim", "group": "body", "hidden": True, "taper": [10, 12],
              "pts": r1(np.hstack([rim, np.full((len(rim), 1), 6.2)])),
              "weight": r2(np.full(len(rim), 1.12))}]
    # the knot, drawn: two short pencil strokes (its top, and a wrap line underneath)
    for j, (a0, a1, rx, ry, dy, wt) in enumerate(((205, 335, 26, 13, 0, 0.92), (25, 150, 22, 9, 3, 1.1))):
        kl = ellipse(612, 101 + dy, rx, ry, 0.08, math.radians(a0), math.radians(a1), 24)
        kl = wobble(kl, 0.7, 20, 29 + j)
        extra.append({"id": f"bow-knot-{j}", "group": "bow", "taper": [5, 8], "tip": [0.4, 0.2],
                      "pts": r1(np.hstack([kl, np.full((len(kl), 1), 6.0)])), "weight": r2(np.full(len(kl), wt))})

    style = {
        "figure": "box",
        "bounds": [0, 0, 880, 828],
        "designSeed": 11,
        "palette": PALETTE,
        "groups": {
            "body": {"parent": None, "pivot": [420, 480]},
            "ground": {"parent": None, "pivot": [460, 790]},
            "lid": {"parent": None, "pivot": [424, 147]},
            "lidShadow": {"parent": "body", "pivot": [420, 205]},
            "bow": {"parent": "lid", "pivot": [612, 100]},
        },
        "lines": lines,
        "extraStrokes": extra,
        "second": second,
        "regions": regions,
        "regionOrder": list(regions.keys()),
        "shadows": shadows,
        "highlights": highlights,
        "construction": cons,
        "occluders": occluders,
        "penSpeed": 1300,
    }
    write("box", d, style)


# --------------------------------------------------------------------------------------------
# BALL
# --------------------------------------------------------------------------------------------
def crack_pts(cx, cy, r):
    zig = [0, 22, -14, 30, -6, 26, -24, 8, -18, 20, -10, 14, -4]
    top, bot = cy - r - 40, cy + r + 40
    return np.array([[cx + 12 + z - i * 3, top + (bot - top) * i / (len(zig) - 1)] for i, z in enumerate(zig)])


def build_ball():
    d = load("ball")
    S = {k: pts(v) for k, v in by_id(d).items()}
    fit = d["fit"]
    cx, cy, r = fit["cx"], fit["cy"], fit["r"]
    g = Grid((-20, -20, 960, 900))

    disc = S["outline-loop"]
    m_disc = g.poly(disc)
    holes = {k: S[k] for k in ("hole-middle", "hole-ring", "hole-thumb")}
    m_holes = {k: g.poly(v) for k, v in holes.items()}
    m_hole_all = np.zeros_like(m_disc)
    for v in m_holes.values():
        m_hole_all |= v

    # swirl colour: coloured-pencil strokes (not filled bands) that ride along each swirl line with a
    # wandering offset that sometimes crosses it, 1.3-1.8x pen width, tapered, lifted 2-4 times
    pen = 7.0
    tone = {s_["id"]: s_.get("tone", 1.0) for s_ in d["strokes"]}
    color_strokes = []
    for k, col in (("swirl-1", "lilac"), ("swirl-2", "rose"), ("swirl-3", "lilac")):
        rng = np.random.default_rng(shash("cs" + k))
        q = resample(S[k], 2.0)
        n = len(q)
        nrm = -np.stack([-np.gradient(q[:, 1]), np.gradient(q[:, 0])], 1)
        nrm /= np.maximum(1e-9, np.hypot(*nrm.T))[:, None]
        off = 2.5 + 5.0 * noise1d(n, shash("off" + k) % 9999, 70) + 1.5 * noise1d(n, shash("o2" + k) % 9999, 18)
        path = q + nrm * off[:, None]
        cuts = np.sort(rng.choice(np.arange(int(n * 0.15), int(n * 0.85)), size=int(rng.integers(1, 4)), replace=False))
        bounds = [0] + list(cuts) + [n]
        for j in range(len(bounds) - 1):
            i0 = bounds[j] + (int(rng.integers(1, 4)) if j else 0)
            i1 = bounds[j + 1] + (int(rng.integers(0, 3)) if j < len(bounds) - 2 else 0)
            seg = path[i0:min(n, i1)]
            if len(seg) < 4:
                continue
            m = len(seg)
            u = np.linspace(0, 1, m)
            wid = pen * rng.uniform(1.3, 1.8) * (0.25 + 0.75 * np.sin(np.pi * np.clip(u * 1.05, 0, 1)) ** 0.5)
            prs = (0.55 + 0.3 * (0.5 + 0.5 * noise1d(m, shash(f"p{k}{j}") % 9999, 25))) * (0.7 + 0.3 * tone[k])
            color_strokes.append({"id": f"{k}-c{j}", "group": "ball", "color": col, "frontOf": "disc",
                                  "pts": [[round(float(x), 1), round(float(y), 1), round(float(w_), 1), round(float(p_), 2)]
                                          for (x, y), w_, p_ in zip(seg, wid, prs)],
                                  "sliver": bool(rng.random() < 0.6), "strokeAngle": 30})
    m_base = m_disc & ~m_hole_all

    # the disc base is the disc minus the finger holes (filled evenodd); swirl colour goes over the top
    base_polys = g.polys(m_base)
    regions = {"disc": {"group": "ball", "color": "violet", "shade": "violetShade", "crescent": 0.11, "slivers": 1,
                                                "polys": [r1(base_polys[0])], "holes": [r1(p) for p in base_polys[1:] if abs(area(p)) > 20]}}
    rmask = {"disc": m_base}
    for k, v in holes.items():
        regions[k] = {"group": "ball", "color": "hole", "shade": "holeDeep", "polys": [r1(orient(v))],
                      "inset": -1, "outset": 1.5, "retreat": 0}
        rmask[k] = m_holes[k]

    shadows = []

    def add_shadow(sid, m, edges, hatch=None, hosts=None, tone=None, group="ball"):
        hosts = hosts if hosts is not None else [k for k, rm in rmask.items() if mask_overlap(m, rm)]
        polys = [r1(p) for p in g.polys(m) if abs(area(p)) > 30]
        e = {"id": sid, "group": group, "polys": polys, "on": hosts, "edge": [r1(x) for x in edges]}
        if hatch:
            e["hatch"] = hatch
        if tone:
            e["tone"] = tone
        shadows.append(e)

    # 1. the crescent: disc minus a big terminator ellipse pushed toward the light
    term = ellipse(cx - 0.17 * r, cy - 0.21 * r, 1.02 * r, 0.99 * r, -0.35, 0, 2 * math.pi, 360)
    term = wobble(term, 4.0, 150, 31, closed=True)
    m_term = g.poly(term)
    m_cres = m_disc & ~m_term
    tedge = edge_inside(term, g.shift(m_disc, 0, 0) & ~g.band(disc, 14), g, min_len=40)
    add_shadow("crescent", m_cres, tedge, hatch={"color": "red", "spacing": 7.5, "level": 0.5, "keep": 0.32})

    # 2. finger holes: flat near-black, with a harder shadow on the inner wall under the upper-left rim
    for k, v in holes.items():
        mk = m_holes[k]
        d_ = {"hole-middle": 7, "hole-ring": 7, "hole-thumb": 11}[k]
        sh = g.shift(mk, d_ * 0.6, d_)
        m_dark = mk & ~sh
        ep = g.polys(sh)
        e = edge_inside(np.vstack([ep[0], ep[0][:1]]), mk & ~g.band(v, 7), g, min_len=8) if ep else []
        add_shadow(k + "Wall", m_dark, e, hatch=None, hosts=[k])
        # graphite hatching over the whole hole (genga 'black'), half of it kept under the colour
        shadows.append({"id": k + "Hatch", "group": "ball", "polys": [r1(orient(v))], "on": [], "edge": [],
                        "hatch": {"color": "graphite", "spacing": 3.6, "level": 0.6, "keep": 0.5}, "noFill": True})

    # 3. ground contact: hatching under the ball, two or three uneven marker passes and a contact line,
    #    darkest where the ball touches. No closed shape.
    low = disc[np.argmax(disc[:, 1])]
    lens = ellipse(low[0] + 0.2 * r, low[1] - 6, 0.74 * r, 0.06 * r, 0.0, 0, 2 * math.pi, 120)
    lens = wobble(np.vstack([lens, lens[:1]]), 1.6, 90, 41, closed=True)
    m_ground = g.poly(lens) & ~g.band(disc, 3) & ~m_disc
    passes = []
    for j, (x0, x1, dy, wd) in enumerate(((low[0] - 0.35 * r, low[0] + 0.9 * r, 4, 13),
                                          (low[0] - 0.05 * r, low[0] + 0.62 * r, 8, 10),
                                          (low[0] - 0.2 * r, low[0] + 0.3 * r, 2, 8))):
        xs = np.linspace(x0, x1, 30)
        ys = low[1] + dy - 0.02 * (xs - low[0]) * 0 + 3 * np.sin(np.linspace(0, math.pi, 30)) + j
        passes.append({"pts": r1(wobble(np.stack([xs, ys], 1), 1.2, 60, 43 + j)), "width": wd})
    shadows.append({"id": "ground", "group": "ground", "polys": [r1(p) for p in g.polys(m_ground) if abs(area(p)) > 30],
                    "on": [], "edge": [], "tone": "ground", "passes": passes, "noFill": True,
                    "hatch": {"color": "graphite", "spacing": 5, "level": 0.34}})
    cl = np.stack([np.linspace(low[0] - 70, low[0] + 120, 20), np.full(20, low[1] + 4)], 1)
    cl[:, 1] += 2 * np.sin(np.linspace(0, math.pi, 20))
    marks = [{"group": "ground", "pts": r1(wobble(cl, 0.8, 50, 44)), "width": 4.2, "level": 0.6, "color": "graphite", "taper": [18, 40]}]

    # highlight: one irregular specular patch on the upper left, its edge left ragged by the marker
    # around it; at colour 0 a loose closed blue contour marks it
    highlights = []
    t = np.linspace(0, 1, 70)
    ang = np.radians(lerp_(202, 250, t))
    rad = 0.76 * r
    # a comma: round head low on the left, tapering along the curve toward the top
    thick = np.where(t < 0.16, 24 * np.sqrt(np.clip(t / 0.16, 0, 1)), 24 - 19 * np.clip((t - 0.16) / 0.84, 0, 1) ** 0.9)
    thick = np.maximum(thick, 0.5) * (1 + 0.08 * noise1d(70, 37, 14))
    outer = np.stack([cx + rad * np.cos(ang), cy + rad * np.sin(ang)], 1)
    inner = np.stack([cx + (rad - thick) * np.cos(ang), cy + (rad - thick) * np.sin(ang)], 1)
    tipc = ellipse(*(0.5 * (outer[-1] + inner[-1])), 3, 3, 0, 0, math.pi, 6)
    sp = np.vstack([outer, inner[::-1]])
    sp = wobble(np.vstack([sp, sp[:1]]), 1.1, 11, 34, closed=True)    # the marker's ragged skirt
    arc_o = (outer + (outer - [cx, cy]) / rad * 3.5)[6:40]
    arc_i = (inner - (inner - [cx, cy]) / np.hypot(*(inner - [cx, cy]).T)[:, None] * 3.0)[22:58]
    highlights.append({"id": "specular", "group": "ball", "poly": r1(sp),
                       "edge": [r1(wobble(arc_o, 0.8, 30, 36)), r1(wobble(arc_i, 0.8, 30, 38))]})

    # key-line hints
    lines = {}
    lit = outward_lit(disc, g, m_disc, sigma=8)
    # the lit-side lost edge sits at the upper left, ramped in and out (not a seam at the terminator)
    lines["outline-loop"] = line_entry("ball", weight_from_lit(lit, 0.4), stroke=by_id(d)["outline-loop"],
                                       breaks=[[0.836, 0.852, 26]], extra={"fade": [[0.77, 0.93, 0.5]]})
    lines["outline-loop"]["taper"][1], lines["outline-loop"]["tip"][1] = 0, 1   # flows on into the overshoot
    tail = S["outline-tail"]
    lines["outline-tail"] = line_entry("ball", interior_weight(tail, cx, cy, r) * 0.82, level=0.85, stroke=by_id(d)["outline-tail"])
    lines["outline-tail"]["taper"] = [0, 46]
    lines["outline-tail"]["tip"][0] = 1
    for k, v in holes.items():
        lit = outward_lit(v, g, m_holes[k], invert=True, sigma=3)
        lines[k] = line_entry("ball", weight_from_lit(lit, 0.3), stroke=by_id(d)[k])
    for k in ("swirl-1", "swirl-2", "swirl-3"):
        w = interior_weight(S[k], cx, cy, r) * (0.55 + 0.45 * tone[k])
        lines[k] = line_entry("ball", w, level=round(0.55 + 0.45 * tone[k], 2), stroke=by_id(d)[k])

    second = [
        {"stroke": "outline-loop", "from": 0.17, "to": 0.4, "offset": 7.0, "level": 0.38, "seed": 6},
    ]

    cons = []
    # the guide circle: bigger and off-centre so it crosses the outline, laid in as three overshooting arcs
    for j, (a0, a1, dr, sd) in enumerate(((148, 262, 0, 51), (240, 372, 9, 55), (350, 492, -6, 56))):
        e = ellipse(cx - 14, cy + 12, r * 1.055 + dr, r * 1.0 + dr, -0.12, math.radians(a0), math.radians(a1), 70)
        cons.append({"group": "ball", "pts": r1(wobble(e, 2.4, 140, sd)), "level": 0.42, "width": 2.6})
    # vertical axis, leaning with the holes; a flattened equator arc
    ax = np.stack([np.linspace(cx + 34, cx - 30, 30), np.linspace(cy - r - 26, cy + r + 22, 30)], 1)
    cons.append({"group": "ball", "pts": r1(wobble(ax, 1.4, 220, 52)), "level": 0.42, "width": 2.6})
    eq = ellipse(cx, cy - 8, r * 0.99, r * 0.3, -0.1, math.radians(8), math.radians(172), 70)
    cons.append({"group": "ball", "pts": r1(wobble(eq, 1.5, 130, 53)), "level": 0.4, "width": 2.6})
    # a quick tick through the finger-hole spread
    tk = np.stack([np.linspace(560, 730, 12), np.linspace(150, 520, 12)], 1)
    cons.append({"group": "ball", "pts": r1(wobble(tk, 1.0, 100, 54)), "level": 0.36, "width": 2.4})

    style = {
        "figure": "ball",
        "bounds": [0, 0, 928.5, 870],
        "designSeed": 17,
        "palette": PALETTE,
        "groups": {"ball": {"parent": None, "pivot": [cx, cy]}, "ground": {"parent": None, "pivot": [cx, cy + r]}},
        "lines": lines,
        "second": second,
        "regions": regions,
        "regionOrder": list(regions.keys()),
        "shadows": shadows,
        "highlights": highlights,
        "construction": cons,
        "occluders": [{"group": "ball", "poly": r1(orient(disc))}],
        "colorStrokes": color_strokes,
        "marks": marks,
        "disc": {"region": "outline-loop", "fit": fit},
        "penSpeed": 1300,
        # placeholder crack for the halves (a designed zigzag): swap in a drawn stroke when Jasper draws one
        "crack": r1(crack_pts(cx, cy, r)),
    }
    write("ball", d, style)


# --------------------------------------------------------------------------------------------
# TEXT
# --------------------------------------------------------------------------------------------
def build_text():
    d = load("text")
    lines = {}
    down = np.array([0.2, 1.0]) / math.hypot(0.2, 1.0)
    for s in d["strokes"]:
        p = pts(s)
        if s.get("dot"):
            lines[s["id"]] = line_entry(s["word"], np.ones(len(p)) * 1.1, (0, 0), extra={"dot": True})
            continue
        t = tangents(p)
        w = 1 + 0.2 * (t @ down)
        w = smooth(w, 3)
        lines[s["id"]] = line_entry(s["word"], w, stroke=s)

    # construction: a light, slightly bowed guide under each word (fitted to that word, because the
    # writing climbs), broken once. No x-height guide.
    descend = {"p", "y", ",", "J"}
    cons = []
    words = {"happy": ["happy"], "birthday": ["birthday"], "jaden": ["jaden", "bang"]}
    for gi, (grp, ws) in enumerate(words.items()):
        feet, xs_all = [], []
        for s in d["strokes"]:
            if s["word"] not in ws:
                continue
            P = pts(s)
            xs_all += [P[:, 0].min(), P[:, 0].max()]
            if grp == "jaden":
                # this line's guide sits under the feet of a, d, e, n and under the three dots
                if s["char"] in ("a", "d", "e", "n") or s.get("dot"):
                    feet.append((P[np.argmax(P[:, 1]), 0], P[:, 1].max() + (4 if s.get("dot") else 0)))
            elif s["char"] not in descend and not s.get("dot"):
                feet.append((P[np.argmax(P[:, 1]), 0], P[:, 1].max()))
        feet = np.array(feet)
        k_, b_ = np.polyfit(feet[:, 0], feet[:, 1], 1)
        for _ in range(3):   # robust: drop "feet" well above the line (crossbars, the ! bars)
            keep = feet[:, 1] - (k_ * feet[:, 0] + b_) > -18
            if keep.sum() >= 2:
                k_, b_ = np.polyfit(feet[keep, 0], feet[keep, 1], 1)
        x0, x1 = min(xs_all) - 26, max(xs_all) + 30
        rng = np.random.default_rng(70 + gi)
        gap = rng.uniform(0.35, 0.7)
        xs = np.linspace(x0, x1, 40)
        ys = k_ * xs + b_ + 3 - 2.5 * np.sin(np.linspace(0, math.pi, 40))
        line_ = wobble(np.stack([xs, ys], 1), 1.0, 200, 61 + gi)
        cut = int(gap * len(line_))
        for seg in (line_[:cut], line_[cut + 2:]):
            cons.append({"group": grp, "pts": r1(seg), "level": 0.4, "width": 2.0, "taper": [10, 14]})

    # optional colour touch (off by default): a pink coloured-pencil swash under "Jaden", two quick passes
    # ending in a short lift-off flick, stopping short of and below the last "!" dot
    S_ = {s["id"]: pts(s) for s in d["strokes"]}
    jf = np.array([[S_[i][:, 0].mean(), S_[i][:, 1].max()] for i in ("s21-jaden-a0", "s22-jaden-d0", "s24-jaden-e0", "s25-jaden-n0")])
    k_, b_ = np.polyfit(jf[:, 0], jf[:, 1], 1)
    last_dot = S_["s31-bang-excl1"].mean(0)
    xs = np.linspace(118, last_dot[0] - 40, 50)
    ys = k_ * xs + b_ + 22 + 4 * np.sin(np.linspace(0.2, 2.8, 50))
    t_ = np.linspace(0, 1, 50)
    ys -= 14 * np.clip((t_ - 0.86) / 0.14, 0, 1) ** 2          # the flick at the end
    xs += 10 * np.clip((t_ - 0.86) / 0.14, 0, 1) ** 2
    p1 = wobble(np.stack([xs, ys], 1), 1.1, 140, 64)
    p2 = wobble(np.stack([xs[8:44], ys[8:44] + 2.5], 1), 1.3, 110, 65)
    accents = {
        "underline": [{"group": "jaden", "pts": r1(p1), "color": "pink", "width": 5.2, "level": 0.66, "taper": [12, 40], "span": [0, 0.7]},
                      {"group": "jaden", "pts": r1(p2), "color": "pink", "width": 4.4, "level": 0.55, "taper": [16, 30], "span": [0.55, 1]}],
    }

    groups = {}
    for wname, (x, y, wd, ht) in d["words"].items():
        groups[wname] = {"parent": None, "pivot": [round(x + wd / 2, 1), round(y + ht / 2, 1)]}

    style = {
        "figure": "text",
        "bounds": [0, 0, 1399.3, 499.8],
        "designSeed": 23,
        "palette": PALETTE,
        "groups": groups,
        "lines": lines,
        "second": [],
        "regions": {},
        "regionOrder": [],
        "shadows": [],
        "highlights": [],
        "construction": cons,
        "accents": accents,
        "occluders": [],
        "penSpeed": 1500,
    }
    write("text", d, style)


if __name__ == "__main__":
    which = sys.argv[1:] or ["box", "ball", "text"]
    for f in which:
        {"box": build_box, "ball": build_ball, "text": build_text}[f]()
