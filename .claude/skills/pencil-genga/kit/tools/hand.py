"""A drawing hand for authored strokes: lines written in code that should sit beside real pen strokes
without looking more perfect than they do.

Everything is in figure units (100 = one ruled-line spacing, y down). In the pen drawings this was
measured from, long lines wander about 1-1.7% of their length from the chord, in slow waves of 150-300
units, with the odd small jog where the hand corrected itself; pen width runs 5-8 units. These helpers
reproduce that kind of error on purpose:

  spline()      centripetal Catmull-Rom through control points (the intended path)
  hand_line()   the path as a hand draws it: slow wander + finer tremor + sideways jogs, resampled every 3 u
  loop()        a closed-ish loop drawn in one go (sun, canopy): oval, drifting radius, overshoot at closure
  widths()      pen width along a stroke: a landing, slow pressure waves, a lift
  lit_weight()  lost-and-found line weight from the outward normal (lit side light, shadow side heavy)
  marker()      a broad chisel-marker stroke as a polygon (sky strokes, hill tone): arced, uneven width,
                angled nib ends with the odd flick, never a straight constant-width bar
"""
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geom  # noqa: E402  (shared helpers: resample, normals, noise1d, Grid, rdp, orient)

LIGHT = np.array([-0.6, -0.8])


def spline(ctrl, step=3.0, closed=False):
    P = np.asarray(ctrl, float)
    if closed:
        P = np.vstack([P[-1], P, P[0], P[1]])
    else:
        P = np.vstack([2 * P[0] - P[1], P, 2 * P[-1] - P[-2]])
    out = []
    for i in range(1, len(P) - 2):
        p0, p1, p2, p3 = P[i - 1], P[i], P[i + 1], P[i + 2]

        def tj(t, a, b):
            return t + max(1e-6, math.hypot(*(b - a))) ** 0.5

        t0 = 0.0
        t1 = tj(t0, p0, p1)
        t2 = tj(t1, p1, p2)
        t3 = tj(t2, p2, p3)
        n = max(4, int(math.hypot(*(p2 - p1)) / 1.0))
        for t in np.linspace(t1, t2, n, endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    out.append(P[-2])
    return geom.resample(np.array(out), step)


def _jog(n, c, width, size):
    i = np.arange(n)
    return size / (1 + np.exp(-(i - c) / max(0.5, width)))


def hand_line(ctrl, seed, step=3.0, wander=(1.6, 170), tremor=(0.55, 38), jogs=(), closed=False, base=None):
    """The intended path, as drawn. jogs: [(frac, size_units)] small sideways corrections."""
    p = base if base is not None else spline(ctrl, step, closed)
    q = geom.resample(p, step)
    n = geom.normals(q, closed)
    N = len(q)
    d = wander[0] * geom.noise1d(N, seed * 13 + 1, wander[1] / step, octaves=1)
    d += tremor[0] * geom.noise1d(N, seed * 13 + 2, tremor[1] / step, octaves=2)
    for frac, size in jogs:
        d += _jog(N, frac * N, 1.6, size) - size * frac   # a step sideways, mean kept near zero
    return q + n * d[:, None]


def loop(c, rx, ry, seed, start_deg=-55, sweep_deg=-388, drift=6.0, wobble=1.3, step=3.0, rot_deg=0.0, flat=()):
    """One-go loop. Negative sweep = counter-clockwise on screen (a right hand's usual circle).
    drift: radius change over the loop, so the end passes outside/inside the start (imperfect closure)."""
    r = np.random.default_rng(seed)
    a0, a1 = math.radians(start_deg), math.radians(start_deg + sweep_deg)
    n = int(abs(a1 - a0) * max(rx, ry) / 1.0)
    t = np.linspace(0, 1, n)
    a = a0 + (a1 - a0) * t
    # a hand's circle is a little egg-shaped and its radius breathes
    ph = r.uniform(0, 2 * math.pi)
    k = 1 + 0.035 * np.cos(2 * (a - ph)) + 0.02 * np.cos(3 * a + r.uniform(0, 6))
    rad = k + (drift / max(rx, ry)) * t
    for (adeg, wdeg, amt) in flat:   # a flattened stretch (where the hand moved faster)
        da = np.angle(np.exp(1j * (a - math.radians(adeg))))
        rad -= amt * np.exp(-(da / math.radians(wdeg)) ** 2)
    x, y = rx * rad * np.cos(a), ry * rad * np.sin(a)
    cr, sr = math.cos(math.radians(rot_deg)), math.sin(math.radians(rot_deg))
    pts = np.stack([c[0] + cr * x - sr * y, c[1] + sr * x + cr * y], 1)
    q = geom.resample(pts, step)
    nn = geom.normals(q)
    d = wobble * geom.noise1d(len(q), seed * 7 + 3, 70 / step, octaves=2)
    return q + nn * d[:, None]


def widths(q, seed, base=5.0, var=0.12, land=0.6, lift=0.0, lo=3.2, hi=8.2):
    s = geom.cumlen(q)
    N = len(q)
    w = base * (1 + var * geom.noise1d(N, seed * 5 + 11, 95 / 3.0, octaves=2))
    w += land * np.exp(-s / 9.0)                       # the pen lands a touch heavy
    if lift:
        w -= lift * np.clip((s - (s[-1] - 40)) / 40, 0, 1)
    return np.clip(w, lo, hi)


def lit_weight(q, inside_sign=1, lo=0.74, hi=1.22, closed=False, sigma=6):
    """Outward normal . light -> weight. inside_sign flips which side is 'outside' for open strokes
    (for a line traced clockwise on screen, outward = -normal)."""
    n = geom.normals(q, closed) * -inside_sign
    lit = n @ LIGHT
    lit = geom.smooth(lit, sigma)
    return np.interp(lit, [-1, 1], [hi, lo])


def with_w(q, w):
    return np.column_stack([q, w])


# ------------------------------------------------------------------ marker strokes
def marker(ctrl, width, seed, nib_deg=62, start="chisel", end="chisel", wvar=0.16, bow=0.0, step=6.0,
           flick=0.18, hook=0.0, pool=0.0):
    """A broad chisel-marker stroke as a polygon (clockwise on screen).

    ctrl     intended centreline (a few points; it is splined and given a slow wander)
    width    nominal nib width across the stroke (units)
    nib_deg  the nib edge's angle on the page; chisel ends are cut parallel to it, so every stroke's ends
             lean the same way, as with one marker held one way
    start/end 'chisel' (cut, a slightly rounded corner), 'flick' (the marker lifts while moving: width
             thins over the last `flick` of the stroke and the end hooks by `hook` units)
    wvar     slow width variation (pressure, nib rolling)
    pool     a slight swelling at the start, where the marker sat before moving
    """
    rng = np.random.default_rng(seed)
    c = spline(ctrl, 3.0)
    if bow:
        s = geom.cumlen(c)
        u = s / s[-1]
        c = c + geom.normals(c) * (bow * 4 * u * (1 - u))[:, None]
    c = hand_line(None, seed, step=step, wander=(width * 0.05 + 1.5, 260), tremor=(0.5, 60), base=c)
    N = len(c)
    s = geom.cumlen(c)
    L = s[-1]
    u = s / L
    t = geom.tangents(c)
    n = geom.normals(c)
    hw = 0.5 * width * (1 + wvar * geom.noise1d(N, seed * 3 + 7, max(3, L / 3.2 / step), octaves=2))
    if pool:
        hw *= 1 + pool * np.exp(-s / (width * 0.6))
    if end == "flick":
        f = np.clip((u - (1 - flick)) / flick, 0, 1)
        hw *= 1 - 0.78 * f ** 1.4
        if hook:
            c = c + n * (hook * f ** 2)[:, None]
    if start == "flick":
        f = np.clip((flick - u) / flick, 0, 1)
        hw *= 1 - 0.7 * f ** 1.4
    left = c + n * hw[:, None]
    right = c - n * hw[:, None]
    # chisel ends: slide each edge along the stroke so the end is cut parallel to the nib
    nib = np.array([math.cos(math.radians(nib_deg)), -math.sin(math.radians(nib_deg))])

    def cut(i, sign):
        tt = t[i] * sign
        # distance along the stroke between the two edges' end points for a cut parallel to the nib
        cross = tt[0] * nib[1] - tt[1] * nib[0]
        dot = tt @ nib
        k = 0.0 if abs(cross) < 0.15 else dot / cross   # cot of the angle between nib and stroke
        k = float(np.clip(k, -1.6, 1.6))
        return k * hw[i]

    k0 = cut(0, 1) if start == "chisel" else 0.0
    k1 = cut(N - 1, 1) if end == "chisel" else 0.0
    L_ = left.copy()
    R_ = right.copy()
    # extend/shorten the edges at each end by +-k (one edge longer than the other)
    L_[0] = L_[0] - t[0] * k0
    R_[0] = R_[0] + t[0] * k0
    L_[-1] = L_[-1] - t[-1] * k1
    R_[-1] = R_[-1] + t[-1] * k1

    def cap(a, b, bulge, out):
        d = b - a
        pts = []
        for f in np.linspace(0, 1, 9)[1:-1]:
            pts.append(a + d * f + out * bulge * math.sin(math.pi * f) ** 0.8 * (0.85 + 0.3 * rng.random()))
        return pts

    poly = list(L_)
    end_bulge = width * (0.10 if end == "chisel" else 0.45 if end == "round" else 0.05)
    poly += cap(L_[-1], R_[-1], end_bulge, t[-1])
    poly += list(R_[::-1])
    poly += cap(R_[0], L_[0], width * (0.45 if start == "round" else 0.08), -t[0])
    poly = np.array(poly)
    return geom.orient(geom.rdp(poly, 0.6))


def marker_zigzag(legs, width, seed, **kw):
    """A scribble: one marker stroke that turns back on itself; returned as one polygon per leg with
    overlapping round turns (the renderer unions nothing, so legs overlap where a real scribble overlaps)."""
    out = []
    for i, leg in enumerate(legs):
        out.append(marker(leg, width, seed * 31 + i, start="chisel" if i == 0 else "round",
                          end="flick" if i == len(legs) - 1 else "round", **kw))
    return out


def r1(a):
    return geom.r1(a)
