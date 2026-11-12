"""Step 6: export ball.strokes.json, ball.svg, ball-ink.png, ball-clean.png, ball-overlay.png."""
import json, os, subprocess, importlib.util
import numpy as np
import cv2
from PIL import Image, ImageOps
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
W = os.path.dirname(os.path.dirname(HERE))
SRC = "/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5774.jpg"
EXT = os.path.join(W, "extract", "ball")
WORK = os.path.join(EXT, "work")

spec_mod = importlib.util.spec_from_file_location("spec", os.path.join(HERE, "spec.py"))
spec = importlib.util.module_from_spec(spec_mod); spec_mod.loader.exec_module(spec)
META = {s["id"]: s for s in spec.STROKES}

S = list(np.load(os.path.join(WORK, "strokes_px.npy"), allow_pickle=True))
sp = json.load(open(os.path.join(WORK, "spacing.json")))
pk = np.array([p for p in sp["peaks"] if 1500 <= p <= 3900], float)
idx = np.round((pk - pk[0]) / 220.0)
SPACING = float(np.polyfit(idx, pk, 1)[0])
U = 100.0 / SPACING

ink = np.load(os.path.join(WORK, "ink.npy"))
band = np.load(os.path.join(WORK, "ruleband.npy"))
inkc = np.where(band, np.clip((ink - 0.17) / 0.83, 0, 1), ink)
H, Wd = ink.shape

# ---------- cleaned ink mask: ink inside the corridor of the accepted strokes ----------
corr = np.zeros((H, Wd), np.uint8)
for s in S:
    p = s["p"]; w = s["w"]
    closed = META[s["id"]]["closed"]
    n = len(p)
    rng = range(n) if closed else range(n - 1)
    for i in rng:
        j = (i + 1) % n
        th = int(round(max(w[i], w[j]) + 7))
        cv2.line(corr, tuple(np.round(p[i]).astype(int)), tuple(np.round(p[j]).astype(int)), 1, th)
alpha = np.clip((inkc - 0.08) / 0.40, 0, 1) * corr
alpha = ndi.gaussian_filter(alpha, 0.6)
ys, xs = np.nonzero(alpha > 0.3)
bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
M = 40.0 / U   # 40 units in px
X0 = int(np.floor(bx0 - M)); Y0 = int(np.floor(by0 - M))
X1 = int(np.ceil(bx1 + M)); Y1 = int(np.ceil(by1 + M))
VW, VH = round((X1 - X0) * U, 1), round((Y1 - Y0) * U, 1)
print("ink bbox px", bx0, by0, bx1, by1, "crop", X0, Y0, X1, Y1, "viewBox", VW, VH)

a8 = (alpha[Y0:Y1, X0:X1] * 255).astype(np.uint8)
rgba = np.zeros(a8.shape + (4,), np.uint8); rgba[..., 3] = a8
Image.fromarray(rgba, "RGBA").save(os.path.join(EXT, "ball-ink.png"), optimize=True)


def to_u(p):
    # array-index pixel centres -> image coords (+0.5) -> crop -> units
    return np.stack([(p[:, 0] + 0.5 - X0) * U, (p[:, 1] + 0.5 - Y0) * U], 1)


# ---------- circle fit of the outline ----------
po = to_u([s for s in S if s["id"] == "outline-loop"][0]["p"])
A = np.c_[2 * po[:, 0], 2 * po[:, 1], np.ones(len(po))]
b = (po ** 2).sum(1)
cx, cy, c = np.linalg.lstsq(A, b, rcond=None)[0]
from scipy.optimize import least_squares
res = least_squares(lambda q: np.hypot(po[:, 0] - q[0], po[:, 1] - q[1]) - q[2],
                    [cx, cy, np.sqrt(c + cx * cx + cy * cy)])
cx, cy, _ = res.x
rr = np.hypot(po[:, 0] - cx, po[:, 1] - cy)
fit = {"cx": round(float(cx), 1), "cy": round(float(cy), 1), "r": round(float(rr.mean()), 1)}
print("fit", fit, "r min/max", rr.min().round(1), rr.max().round(1))

# ---------- strokes ----------
TONE_REF = 0.85   # centre darkness of a fully-inked thin ballpoint line in this photo
strokes = []
groups = {"outline": [], "holes": [], "swirls": []}
for s in S:
    m = META[s["id"]]
    pu = to_u(s["p"])
    wu = s["w"] * U
    tone = float(np.clip(np.median(s["peak"]) / TONE_REF, 0, 1))
    tone = round(round(tone * 20) / 20, 2)    # nearest 0.05
    pts = [[round(float(x), 1), round(float(y), 1), round(float(w), 1)] for (x, y), w in zip(pu, wu)]
    strokes.append(dict(id=s["id"], role=m["role"], group=m["group"], closed=m["closed"],
                        tone=tone, pts=pts))
    groups[m["group"]].append(s["id"])
    print(f'{s["id"]:13s} tone {tone:.2f} (median centre darkness {np.median(s["peak"]):.2f})  '
          f'w med {np.median(wu):.1f}u  n {len(pts)}')

doc = {"figure": "ball", "unit": "100 = one ruled-line spacing", "spacing_px": round(SPACING, 1),
       "viewBox": [0, 0, VW, VH], "fit": fit, "groups": groups, "strokes": strokes,
       "source": {"photo": "IMG_5774.jpg", "crop_px": [X0, Y0, X1, Y1]}}


def dump(doc):
    # compact: one stroke per line block, points inline
    out = ["{"]
    keys = [k for k in doc if k != "strokes"]
    for k in keys:
        out.append(f'  {json.dumps(k)}: {json.dumps(doc[k], separators=(",", ":"))},')
    out.append('  "strokes": [')
    for i, st in enumerate(doc["strokes"]):
        head = {k: v for k, v in st.items() if k != "pts"}
        h = json.dumps(head, separators=(",", ":"))[:-1]
        pts = ",".join(json.dumps(p, separators=(",", ":")) for p in st["pts"])
        out.append(f'    {h},"pts":[{pts}]}}' + ("," if i < len(doc["strokes"]) - 1 else ""))
    out.append("  ]")
    out.append("}")
    return "\n".join(out) + "\n"


txt = dump(doc)
json.loads(txt)
open(os.path.join(EXT, "ball.strokes.json"), "w").write(txt)


# ---------- SVG ----------
def cr_path(P, closed):
    """Catmull-Rom (uniform, tension 1/6) through P -> cubic Bezier path string."""
    n = len(P)
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".") if abs(v) >= 0.05 else "0"
    pt = lambda q: f"{f(q[0])},{f(q[1])}"
    d = [f"M{pt(P[0])}"]
    segs = n if closed else n - 1
    for i in range(segs):
        p0 = P[(i - 1) % n] if (closed or i > 0) else P[0]
        p1 = P[i]
        p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n] if (closed or i + 2 < n) else P[-1]
        c1 = p1 + (p2 - p0) / 6.0
        c2 = p2 - (p3 - p1) / 6.0
        d.append(f"C{pt(c1)} {pt(c2)} {pt(p2)}")
    if closed:
        d.append("Z")
    return "".join(d)


def cr_eval(P, closed, k=8):
    n = len(P); segs = n if closed else n - 1; out = []
    t = np.linspace(0, 1, k, endpoint=False)[:, None]
    for i in range(segs):
        p0 = P[(i - 1) % n] if (closed or i > 0) else P[0]
        p1 = P[i]; p2 = P[(i + 1) % n]
        p3 = P[(i + 2) % n] if (closed or i + 2 < n) else P[-1]
        c1 = p1 + (p2 - p0) / 6.0; c2 = p2 - (p3 - p1) / 6.0
        out.append((1 - t) ** 3 * p1 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p2)
    return np.vstack(out)


SVG_STEP = 2   # every 2nd JSON point (~6 units) keeps the curve within a fraction of a unit
paths = {}
for st in strokes:
    P = np.array([p[:2] for p in st["pts"]])
    if st["closed"]:
        Q = P[::SVG_STEP]
    else:
        Q = P[::SVG_STEP]
        if not np.allclose(Q[-1], P[-1]):
            Q = np.vstack([Q, P[-1]])
    # deviation check of the decimated curve vs the dense polyline
    from scipy.spatial import cKDTree
    dense = cr_eval(P, st["closed"], 6)
    dev = cKDTree(cr_eval(Q, st["closed"], 12)).query(dense)[0]
    if dev.max() > 0.6:
        Q = P
    paths[st["id"]] = (cr_path(Q, st["closed"]), dev.max())

lines = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {VW:g} {VH:g}" width="{VW:g}" height="{VH:g}">']
for g in ["outline", "holes", "swirls"]:
    lines.append(f'  <g id="{g}" fill="none" stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round">')
    for st in strokes:
        if st["group"] != g:
            continue
        wmed = float(np.median([p[2] for p in st["pts"]]))
        op = f' stroke-opacity="{st["tone"]:g}"' if st["tone"] < 1 else ""
        lines.append(f'    <path id="{st["id"]}" data-role="{st["role"]}" stroke-width="{wmed:.1f}"{op}')
        lines.append(f'          d="{paths[st["id"]][0]}"/>')
    lines.append("  </g>")
lines.append("</svg>")
svg = "\n".join(lines) + "\n"
open(os.path.join(EXT, "ball.svg"), "w").write(svg)
print("svg bytes", len(svg), "max decimation dev", {k: round(v[1], 2) for k, v in paths.items()})

# ---------- renders ----------
rs = "rsvg-convert"
subprocess.run([rs, "-w", "1200", "-b", "white", "-o", os.path.join(EXT, "ball-clean.png"),
                os.path.join(EXT, "ball.svg")], check=True)
red = svg.replace('stroke="#1a1a1a"', 'stroke="#e01010"')
red = red.replace("<svg ", '<svg opacity="0.62" ', 1)
open(os.path.join(WORK, "ball-red.svg"), "w").write(red)
OW = 1600
OH = int(round(OW * (Y1 - Y0) / (X1 - X0)))
subprocess.run([rs, "-w", str(OW), "-h", str(OH), "-o", os.path.join(WORK, "red.png"),
                os.path.join(WORK, "ball-red.svg")], check=True)
ph = ImageOps.exif_transpose(Image.open(SRC)).convert("L").crop((X0, Y0, X1, Y1))
ph = ph.resize((OW, OH), Image.LANCZOS)
ph = ph.point(lambda v: int(110 + v * 145 / 255)).convert("RGBA")
rl = Image.open(os.path.join(WORK, "red.png")).convert("RGBA")
Image.alpha_composite(ph, rl).convert("RGB").save(os.path.join(EXT, "ball-overlay.png"), optimize=True)
print("done")
