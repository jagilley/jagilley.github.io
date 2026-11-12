"""Minimal SVG path parsing for the official GTA VI trace (M/L/H/V/C/Z, absolute and relative).

Returns subpaths as lists of segments so straight edges stay exact and cubic corners can be
flattened at any resolution.
"""
import re
import math

TOK = re.compile(r"[MmLlHhVvCcZzSsQqAa]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")


def parse(d):
    """-> list of subpaths; each subpath = list of segments ('L', p0, p1) or ('C', p0, c1, c2, p1)."""
    toks = TOK.findall(d)
    i = 0
    cur = (0.0, 0.0)
    start = (0.0, 0.0)
    cmd = None
    subs = []
    segs = None

    def num():
        nonlocal i
        v = float(toks[i])
        i += 1
        return v

    while i < len(toks):
        t = toks[i]
        if re.match(r"[A-Za-z]", t):
            cmd = t
            i += 1
            if cmd in "Zz":
                if segs is not None:
                    if math.dist(cur, start) > 1e-9:
                        segs.append(("L", cur, start))
                    subs.append(segs)
                    segs = None
                cur = start
                continue
        # implicit repeats
        if cmd in "Mm":
            x, y = num(), num()
            if cmd == "m":
                x, y = cur[0] + x, cur[1] + y
            if segs:
                subs.append(segs)
            segs = []
            cur = start = (x, y)
            cmd = "l" if cmd == "m" else "L"
        elif cmd in "Ll":
            x, y = num(), num()
            if cmd == "l":
                x, y = cur[0] + x, cur[1] + y
            segs.append(("L", cur, (x, y)))
            cur = (x, y)
        elif cmd in "Hh":
            x = num()
            if cmd == "h":
                x = cur[0] + x
            segs.append(("L", cur, (x, cur[1])))
            cur = (x, cur[1])
        elif cmd in "Vv":
            y = num()
            if cmd == "v":
                y = cur[1] + y
            segs.append(("L", cur, (cur[0], y)))
            cur = (cur[0], y)
        elif cmd in "Cc":
            a = [num() for _ in range(6)]
            if cmd == "c":
                a = [a[k] + cur[k % 2] for k in range(6)]
            c1, c2, p = (a[0], a[1]), (a[2], a[3]), (a[4], a[5])
            segs.append(("C", cur, c1, c2, p))
            cur = p
        else:
            raise ValueError("unsupported path command " + cmd)
    if segs:
        subs.append(segs)
    # drop zero-length segments
    out = []
    for s in subs:
        s2 = [g for g in s if math.dist(g[1], g[-1]) > 1e-6 or g[0] == "C"]
        if s2:
            out.append(s2)
    return out


def xform(subs, f):
    """apply point function f to every point in every segment"""
    return [[(g[0],) + tuple(f(p) for p in g[1:]) for g in s] for s in subs]


def cubic(p0, c1, c2, p1, t):
    u = 1 - t
    return (u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0],
            u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1])


def flatten(sub, step=2.0, curve_step=None):
    """polyline of one subpath (closed: last point == first point dropped). step in output units
    (straight edges; curves use curve_step, default the same)."""
    curve_step = curve_step or step
    pts = [sub[0][1]]
    for g in sub:
        if g[0] == "L":
            p0, p1 = g[1], g[2]
            L = math.dist(p0, p1)
            n = max(1, int(math.ceil(L / step)))
            for k in range(1, n + 1):
                t = k / n
                pts.append((p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t))
        else:
            p0, c1, c2, p1 = g[1:]
            L = math.dist(p0, c1) + math.dist(c1, c2) + math.dist(c2, p1)
            n = max(2, int(math.ceil(L / curve_step)))
            for k in range(1, n + 1):
                pts.append(cubic(p0, c1, c2, p1, k / n))
    if math.dist(pts[0], pts[-1]) < 1e-6:
        pts.pop()
    return pts


def corners(sub):
    """vertex list (segment start points) for a subpath: the official corners."""
    return [g[1] for g in sub]


def area(poly):
    a = 0.0
    for i in range(len(poly)):
        x0, y0 = poly[i]
        x1, y1 = poly[(i + 1) % len(poly)]
        a += x0 * y1 - x1 * y0
    return a / 2


def bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)
