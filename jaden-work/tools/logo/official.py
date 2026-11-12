"""Pull the official GTA VI trace (Wikimedia, public domain) out of v1 (jaden.html) and map it into
logo units: 100 = one ruled-line spacing, logo 1400 wide, anchor (0, 0) at the base centre, y down.

    official.load() -> {
        'defs': '<linearGradient ...>...',      # raw <defs> markup (gradients) from v1
        'symbols': {'gtaVI': '<symbol ...>', 'gtaWord': '<symbol ...>'},
        'paths': {id: {'fill': str, 'subs': [[segment, ...], ...]}},  # in logo units
        'K': units per symbol unit, 'anchor': symbol-space anchor, 'viewBox': [...]
    }
"""
import os
import re

import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import svgpath  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
V1 = os.path.join(ROOT, "jaden.html")

LOGO_W = 1400.0                    # logo width in units (the ball is ~800 across)
VIEW = (251.35417, 194.95614)      # the symbols' viewBox


def _symbol(html, sid):
    m = re.search(r'<symbol id="%s".*?</symbol>' % sid, html, re.S)
    return m.group(0)


def _gradients(html):
    i = html.index('<linearGradient id="gta-linearGradient2"')
    j = html.index('<symbol id="gtaVI"')
    return html[i:j].strip()


def _matrix(s):
    return [float(v) for v in re.findall(r"[-\d.e]+", s)]


def load():
    html = open(V1, encoding="utf-8").read()
    syms = {k: _symbol(html, k) for k in ("gtaVI", "gtaWord")}
    K = LOGO_W / VIEW[0]
    # symbol space -> logo units: x centred on the viewBox, y = 0 at the bottom of the viewBox
    # (the V's tip is the lowest point and touches it)
    anchor = (VIEW[0] / 2, VIEW[1])
    paths = {}
    for sid, sym in syms.items():
        outer = re.search(r'<g transform="translate\(([-\d.]+),([-\d.]+)\)">', sym)
        tx, ty = float(outer.group(1)), float(outer.group(2))
        inner = re.search(r'<g id="[^"]+" transform="matrix\(([^)]+)\)"', sym)
        a, b, c, d, e, f = _matrix(inner.group(1))

        def fn(p, a=a, b=b, c=c, d=d, e=e, f=f, tx=tx, ty=ty):
            x = a * p[0] + c * p[1] + e + tx
            y = b * p[0] + d * p[1] + f + ty
            return ((x - anchor[0]) * K, (y - anchor[1]) * K)

        for pm in re.finditer(r"<path ([^>]*?)/>", sym):
            attrs = pm.group(1)
            pid = re.search(r'id="([^"]+)"', attrs).group(1)
            dd = re.search(r'\sd="([^"]+)"', " " + attrs).group(1)
            st = re.search(r'style="([^"]*)"', attrs).group(1)
            fill = re.search(r"fill:([^;]+)", st).group(1)
            paths[pid] = {"symbol": sid, "fill": fill, "subs": svgpath.xform(svgpath.parse(dd), fn)}
    return {"defs": _gradients(html), "symbols": syms, "paths": paths, "K": K, "anchor": anchor, "viewBox": VIEW}


if __name__ == "__main__":
    O = load()
    print("K =", O["K"])
    for pid, P in O["paths"].items():
        print(pid, P["symbol"], P["fill"], len(P["subs"]), "subpaths")
        for k, s in enumerate(P["subs"]):
            poly = svgpath.flatten(s, 4)
            bb = svgpath.bbox(poly)
            print("   %2d  n=%3d  area=%9.0f  bbox=(%7.1f %7.1f %7.1f %7.1f)" % (k, len(s), svgpath.area(poly), *bb))
