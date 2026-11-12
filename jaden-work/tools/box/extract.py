"""Gift box: compose pen strokes from the skeleton graph and write all deliverables.

Inputs : tools/box/debug/{ink_raw.npy, sk_pruned.npy, dt.npy, graph.pkl}  (from mask.py, skel.py, graph.py)
Outputs: extract/box/{box.strokes.json, box.svg, box-ink.png, box-clean.png, box-overlay.png}

Strokes are defined by waypoints in full-resolution photo pixels. Consecutive waypoints are joined by the
shortest path along the pruned skeleton. Waypoints prefixed with 'L' are literal (not snapped), used to
restore tiny overshoots that spur-pruning removed.
"""
import json, pickle, subprocess, math
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi
from scipy.sparse import coo_matrix
from scipy.sparse.csgraph import dijkstra

W = '/Users/jasper/Code/jagilley.github.io/jaden-work'
DBG = W + '/tools/box/debug'
OUT = W + '/extract/box'
SRC = '/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg'
OX, OY = 1900, 860                 # skeleton crop origin (full-res px)
SPACING = 190.1                    # measured ruled-line spacing, px (spacing.py)
S = 100.0 / SPACING                # px -> units
MARGIN = 40.0                      # units

ink = np.load(DBG + '/ink_raw.npy')
sk = np.load(DBG + '/sk_pruned.npy')
dt = np.load(DBG + '/dt.npy')
nodes, edges = pickle.load(open(DBG + '/graph.pkl', 'rb'))
JUNC = np.array([[n['x'] + OX, n['y'] + OY] for n in nodes if n['kind'] == 'junc'])

# ---------------------------------------------------------------- skeleton pixel graph
ys, xs = np.nonzero(sk)
idx = -np.ones(sk.shape, int); idx[ys, xs] = np.arange(len(ys))
rows, cols, wts = [], [], []
for dy, dx in [(0, 1), (1, 0), (1, 1), (1, -1)]:
    y2, x2 = ys + dy, xs + dx
    ok = (y2 >= 0) & (y2 < sk.shape[0]) & (x2 >= 0) & (x2 < sk.shape[1])
    ok[ok] &= sk[y2[ok], x2[ok]]
    a = idx[ys[ok], xs[ok]]; b = idx[y2[ok], x2[ok]]
    w = math.hypot(dy, dx)
    rows += [a, b]; cols += [b, a]; wts += [np.full(len(a), w)] * 2
G = coo_matrix((np.concatenate(wts), (np.concatenate(rows), np.concatenate(cols))), shape=(len(ys),) * 2).tocsr()
PX = np.stack([xs + OX, ys + OY], 1).astype(float)


def snap(x, y):
    d = np.hypot(PX[:, 0] - x, PX[:, 1] - y)
    i = int(d.argmin())
    if d[i] > 14: print(f'  ! waypoint ({x},{y}) is {d[i]:.1f}px from skeleton')
    return i


def sk_path(i, j):
    _, pred = dijkstra(G, indices=i, return_predecessors=True)
    p = [j]
    while p[-1] != i:
        p.append(pred[p[-1]])
        if p[-1] < 0: raise RuntimeError('no path')
    return p[::-1]


# ---------------------------------------------------------------- stroke definitions (drawing order)
# (id, group, role, closed, waypoints, bridge-boxes [x0,y0,x1,y1] where skeleton pts are dropped & re-bridged)
STROKES = [
    # lid outline, drawn as one clockwise chain of four strokes
    ('lid-top', 'lid', 'lid-top', False,
     [(2047, 1060), (2500, 1062), (2836, 1076), (2878, 1084), (2920, 1077), (2966, 1082), (3009, 1071),
      (3067, 1074), (3111, 1074), (3188, 1076), (3339, 1082), (3447, 1095)],
     [(2998, 1040, 3194, 1100)]),
    ('lid-right', 'lid', 'lid-right', False,
     [(3447, 1095), (3439, 1120), (3438, 1148), (3420, 1197), (3411, 1238)], []),
    ('lid-bottom', 'lid', 'lid-bottom', False,
     [(3411, 1238), (3379, 1243), (3165, 1231), (3111, 1224), (2991, 1224), (2600, 1228), (2066, 1237),
      (2010, 1239)], []),
    ('lid-left', 'lid', 'lid-left', False,
     [(2010, 1239), (2024, 1172), (2035, 1130), (2047, 1060)], []),
    # the double line across the lid
    ('lid-band-upper', 'lid', 'lid-band-upper', False,
     [(2035, 1130), (2600, 1138), (3002, 1146), (3067, 1150), (3105, 1150), (3150, 1150), (3250, 1150),
      (3343, 1157), (3429, 1154), (3438, 1148), ('L', 3452, 1146)],
     [(3166, 1140, 3200, 1170), (3255, 1130, 3305, 1162)]),
    ('lid-band-lower', 'lid', 'lid-band-lower', False,
     [(2024, 1172), (2600, 1170), (2995, 1175), (3060, 1176), (3105, 1176), (3150, 1177), (3260, 1176),
      (3403, 1176)],
     [(3166, 1160, 3200, 1195)]),
    ('lid-dash', 'lid', 'lid-dash', False,
     [(3389, 1122), (3439, 1120)], []),
    # box body
    ('body-left', 'body', 'body-left', False,
     [(2066, 1237), (2044, 1700), (2044, 2230), (2052, 2252), (2062, 2254), (2067, 2333)], []),
    ('body-bottom', 'body', 'body-bottom', False,
     [(2067, 2333), (2700, 2345), (3317, 2351), (3401, 2359)], []),
    ('body-right', 'body', 'body-right', False,
     [(3379, 1243), (3350, 1800), (3317, 2351)], []),
    # ribbon: split where it crosses the lid's bottom edge, so the lid part can lift with the lid
    ('ribbon-left-lid', 'ribbon', 'ribbon-left-lid', False,
     [('L', 3030, 1058), (3009, 1074), (3002, 1150), (2991, 1224)], []),
    ('ribbon-left', 'ribbon', 'ribbon-left', False,
     [(2991, 1224), (2992, 1300), (2979, 1374), (2983, 1417), (2950, 1900), (2928, 2329)], []),
    ('ribbon-right-lid', 'ribbon', 'ribbon-right-lid', False,
     [('L', 3146, 1059), ('L', 3168, 1065), (3188, 1078), (3189, 1092), (3188, 1150), (3172, 1227), (3165, 1231)],
     [(3166, 1140, 3200, 1195)]),
    ('ribbon-right', 'ribbon', 'ribbon-right', False,
     [(3165, 1231), (3165, 1267), (3166, 1300), (3150, 1800), (3110, 2318)], []),
    # bow
    ('bow-loop-left', 'bow', 'bow-loop-left', True,
     [(3026, 1063), (2960, 1000), (2900, 957), (2830, 1010), (2836, 1076), (2920, 1097), (2966, 1082),
      (3009, 1071), (3026, 1063)], []),
    ('bow-loop-right', 'bow', 'bow-loop-right', True,
     [(3160, 1066), (3160, 1026), (3249, 971), (3329, 1031), (3339, 1082), (3300, 1140), (3273, 1143),
      (3214, 1109), (3189, 1092), (3173, 1074), (3160, 1066)],
     [(3150, 1052, 3200, 1100)]),
    ('bow-tail-left', 'bow', 'bow-tail-left', False,
     [('L', 3030, 1058), ('L', 3047, 1053), ('L', 3062, 1060), (3067, 1085), (3067, 1150), (3057, 1195), (3045, 1226), (2992, 1312), (2979, 1374),
      (2954, 1399)], []),
    ('bow-tail-right', 'bow', 'bow-tail-right', False,
     [('L', 3146, 1059), ('L', 3126, 1058), ('L', 3111, 1068), (3109, 1090), (3105, 1150), (3111, 1224), (3125, 1228), (3158, 1270), (3166, 1300),
      (3241, 1327)], []),
]
GROUP_ORDER = ['lid', 'body', 'ribbon', 'bow']


# ---------------------------------------------------------------- helpers
def resample(P, step):
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    n = max(int(round(d[-1] / step)), 1)
    t = np.linspace(0, d[-1], n + 1)
    return np.stack([np.interp(t, d, P[:, k]) for k in range(P.shape[1])], 1)


def smooth_open(P, sigma):
    """Gaussian smoothing that pins endpoints (odd reflection about each end)."""
    k = int(3 * sigma) + 1
    if len(P) < 3: return P
    k = min(k, len(P) - 1)
    pre = 2 * P[0] - P[1:k + 1][::-1]
    post = 2 * P[-1] - P[-k - 1:-1][::-1]
    Q = np.vstack([pre, P, post])
    Q = ndi.gaussian_filter1d(Q, sigma, axis=0, mode='nearest')
    return Q[k:k + len(P)]


def smooth_closed(P, sigma):
    return ndi.gaussian_filter1d(P, sigma, axis=0, mode='wrap')


def free_end_extension(p, q, wpx):
    """p = endpoint, q = point inward. March outward along (p-q) while on ink; return extended end."""
    v = p - q; v /= (np.linalg.norm(v) + 1e-9)
    L = 0
    for s in range(1, 25):
        x, y = p + v * s
        if not ink[int(round(y)), int(round(x))]: break
        L = s
    ext = min(max(L - wpx / 2, 0), 9)
    return p + v * ext


def meets_other(sid, x, y, tol=10):
    """True if (x, y) is at another stroke's waypoint (a shared corner / junction): don't extend that end."""
    for o in STROKES:
        if o[0] == sid: continue
        for wp in o[4]:
            q = wp[1:] if wp[0] == 'L' else wp
            if math.hypot(q[0] - x, q[1] - y) < tol: return True
    return False


def build(st):
    sid, group, role, closed, wps, bridges = st
    # 1. skeleton path through the waypoints
    # waypoints: snapped to the skeleton (joined by skeleton shortest paths) or literal ('L', x, y)
    pts, dts = [], []
    prev = None                                   # previous snapped skeleton index (or None if literal)
    lit_end = None
    for k, wp in enumerate(wps):
        if wp[0] == 'L':
            pts.append(np.array(wp[1:], float)); dts.append(np.nan); prev = None
            if k == len(wps) - 1: lit_end = pts[-1]
            continue
        i = snap(*wp)
        if prev is None:
            pts.append(PX[i]); dts.append(dt[ys[i], xs[i]])
        else:
            for j in sk_path(prev, i)[1:]:
                pts.append(PX[j]); dts.append(dt[ys[j], xs[j]])
        prev = i
    lit_start = wps[0][0] == 'L'
    P = np.array(pts, float); D = np.array(dts, float)
    # 2. drop points at straight-through junction crossings and in manual bridge boxes
    n = len(P)
    keep = np.ones(n, bool)
    wmed = np.nanmedian(2 * D - 1)
    R = 0.9 * wmed
    for J in JUNC:
        dj = np.hypot(P[:, 0] - J[0], P[:, 1] - J[1])
        i = int(dj.argmin())
        if dj[i] > 3: continue
        if i < 4 or i > n - 5:            # junction at a stroke end: keep the end pinned there
            continue
        a, b = max(i - int(2.2 * R), 0), min(i + int(2.2 * R), n - 1)
        v1 = P[i] - P[a]; v2 = P[b] - P[i]
        ang = math.degrees(math.acos(np.clip(v1 @ v2 / (np.linalg.norm(v1) * np.linalg.norm(v2) + 1e-9), -1, 1)))
        if ang < 40:
            keep &= ~(dj < R)
    for (x0, y0, x1, y1) in bridges:
        inside = (P[:, 0] > x0) & (P[:, 0] < x1) & (P[:, 1] > y0) & (P[:, 1] < y1)
        keep &= ~inside
    keep[0] = keep[-1] = True
    # widths: NaN where dropped or near any junction (DT inflated there)
    Wpx = 2 * D - 1
    for J in JUNC:
        Wpx[np.hypot(P[:, 0] - J[0], P[:, 1] - J[1]) < R * 1.3] = np.nan
    P, Wpx = P[keep], Wpx[keep]
    # 3. arc-length resample at 1 px (gaps bridged linearly), interpolate widths, smooth
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(P, axis=0).T))]
    good = ~np.isnan(Wpx)
    Wfill = np.interp(d, d[good], Wpx[good]) if good.sum() > 1 else np.full(len(d), wmed)
    Q = resample(np.c_[P, Wfill], 1.0)
    xy = Q[:, :2]
    if closed:
        xy = smooth_closed(xy[:-1], 5.0); xy = np.vstack([xy, xy[:1]])
    else:
        xy = smooth_open(xy, 5.0)
    w = ndi.gaussian_filter1d(Q[:, 2], 10, mode='wrap' if closed else 'nearest')
    # 4. free ends: extend so the round cap reaches the ink tip
    if not closed:
        jd0 = np.min(np.hypot(*(JUNC - xy[0]).T)); jd1 = np.min(np.hypot(*(JUNC - xy[-1]).T))
        if jd0 > 12 and not lit_start and not meets_other(sid, *wps[0][-2:]):
            e = free_end_extension(xy[0], xy[min(6, len(xy) - 1)], w[0])
            if np.linalg.norm(e - xy[0]) > 0.5: xy = np.vstack([e, xy]); w = np.r_[w[0], w]
        if jd1 > 12 and lit_end is None and not meets_other(sid, *wps[-1][-2:]):
            e = free_end_extension(xy[-1], xy[max(-7, -len(xy))], w[-1])
            if np.linalg.norm(e - xy[-1]) > 0.5: xy = np.vstack([xy, e]); w = np.r_[w, w[-1]]
    # 5. final sampling ~3 units
    F = resample(np.c_[xy, w], 3.0 / S)
    if closed: F = F[:-1]                  # don't duplicate the start point
    return dict(id=sid, group=group, role=role, closed=closed, pts_px=F)


built = [build(s) for s in STROKES]

# width clamp per figure (removes ink blobs at stroke ends / crossings)
allw = np.concatenate([b['pts_px'][:, 2] for b in built])
WMED = float(np.median(allw))
for b in built:
    b['pts_px'][:, 2] = np.clip(b['pts_px'][:, 2], 0.75 * WMED, 1.2 * WMED)

# ---------------------------------------------------------------- cleaned ink mask (= raw ink near kept strokes)
import cv2
cover = np.zeros(ink.shape, np.uint8)
for b in built:
    pts = b['pts_px']
    for (x0, y0, w0), (x1, y1, w1) in zip(pts[:-1], pts[1:]):
        cv2.line(cover, (int(round(x0 * 4)), int(round(y0 * 4))), (int(round(x1 * 4)), int(round(y1 * 4))), 1,
                 thickness=max(int(round(w0 / 2 + 5)) * 2, 1), lineType=cv2.LINE_8, shift=2)
    if b['closed']:
        x0, y0, w0 = pts[-1]; x1, y1, _ = pts[0]
        cv2.line(cover, (int(round(x0 * 4)), int(round(y0 * 4))), (int(round(x1 * 4)), int(round(y1 * 4))), 1,
                 thickness=max(int(round(w0 / 2 + 5)) * 2, 1), shift=2)
clean = ink & cover.astype(bool)
# drop specks left by the intersection
lab, nl = ndi.label(clean, np.ones((3, 3)))
ar = ndi.sum(clean, lab, np.arange(1, nl + 1))
clean = np.isin(lab, 1 + np.nonzero(ar >= 300)[0])

yy, xx = np.nonzero(clean)
bx0, by0, bx1, by1 = xx.min(), yy.min(), xx.max() + 1, yy.max() + 1
m_px = MARGIN / S
ORG = np.array([bx0 - m_px, by0 - m_px])
VW = round((bx1 - bx0) * S + 2 * MARGIN, 1); VH = round((by1 - by0) * S + 2 * MARGIN, 1)
print('ink bbox px', bx0, by0, bx1, by1, 'viewBox', VW, VH, 'median w units', round(WMED * S, 2))

# box-ink.png : black on transparent at photo resolution, cropped to the viewBox
cx0, cy0 = int(round(ORG[0])), int(round(ORG[1]))
cx1, cy1 = int(round(ORG[0] + VW / S)), int(round(ORG[1] + VH / S))
crop = clean[cy0:cy1, cx0:cx1]
rgba = np.zeros(crop.shape + (4,), np.uint8); rgba[..., 3] = crop * 255
Image.fromarray(rgba).save(OUT + '/box-ink.png')

# ---------------------------------------------------------------- JSON
def to_units(F):
    u = np.c_[(F[:, 0] - ORG[0]) * S, (F[:, 1] - ORG[1]) * S, F[:, 2] * S]
    return [[round(float(a), 1) for a in r] for r in u]

strokes_json, groups = [], {g: [] for g in GROUP_ORDER}
for b in built:
    strokes_json.append(dict(id=b['id'], role=b['role'], group=b['group'], closed=b['closed'],
                             pts=to_units(b['pts_px'])))
    groups[b['group']].append(b['id'])
doc = {'figure': 'box', 'unit': '100 = one ruled-line spacing', 'spacing_px': SPACING,
       'viewBox': [0, 0, VW, VH], 'groups': groups, 'strokes': strokes_json}
with open(OUT + '/box.strokes.json', 'w') as f:
    f.write('{\n')
    head = {k: doc[k] for k in ['figure', 'unit', 'spacing_px', 'viewBox', 'groups']}
    for k, v in head.items():
        f.write(f'  {json.dumps(k)}: {json.dumps(v)},\n')
    f.write('  "strokes": [\n')
    for i, s in enumerate(strokes_json):
        meta = ', '.join(f'{json.dumps(k)}: {json.dumps(s[k])}' for k in ['id', 'role', 'group', 'closed'])
        f.write(f'    {{{meta}, "pts": {json.dumps(s["pts"], separators=(",", ":"))}}}')
        f.write(',\n' if i < len(strokes_json) - 1 else '\n')
    f.write('  ]\n}\n')

# ---------------------------------------------------------------- SVG (Catmull-Rom -> cubic Bezier, adaptively thinned)
def cr_segments(P, closed):
    """Catmull-Rom through P as cubic Beziers, with chord-length (Bessel) tangents so that
    unevenly spaced points don't produce kinks or overshoot."""
    n = len(P)
    def nxt(i): return (i + 1) % n if closed else min(i + 1, n - 1)
    def prv(i): return (i - 1) % n if closed else max(i - 1, 0)
    T = []
    for i in range(n):
        a, b = P[prv(i)], P[nxt(i)]
        da, db = np.linalg.norm(P[i] - a), np.linalg.norm(b - P[i])
        if da < 1e-9 and db < 1e-9: T.append(np.zeros(2)); continue
        if da < 1e-9: T.append((b - P[i]) / db); continue
        if db < 1e-9: T.append((P[i] - a) / da); continue
        T.append((db * (P[i] - a) / da + da * (b - P[i]) / db) / (da + db))   # unit-speed tangent
    segs = []
    for i in (range(n) if closed else range(n - 1)):
        j = nxt(i); d = np.linalg.norm(P[j] - P[i])
        segs.append((P[i], P[i] + T[i] * d / 3, P[j] - T[j] * d / 3, P[j]))
    return segs


def bez(seg, t):
    p0, c1, c2, p3 = seg; t = t[:, None]
    return (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * c1 + 3 * (1 - t) * t ** 2 * c2 + t ** 3 * p3


def thin(P, closed, tol=0.5):
    """Pick a subset of the dense points whose Catmull-Rom curve stays within tol units of the dense polyline."""
    n = len(P)
    keep = sorted(set([0, n - 1] + list(range(0, n, 12))))
    if closed: keep = sorted(set(range(0, n, 12)))
    for _ in range(40):
        K = P[keep]
        segs = cr_segments(K, closed)
        worst = []
        for si, seg in enumerate(segs):
            a = keep[si]; b = keep[si + 1] if si + 1 < len(keep) else keep[0] + n
            ids = np.arange(a, b + 1) % n
            C = bez(seg, np.linspace(0, 1, 40))
            dd = np.min(np.hypot(P[ids][:, None, 0] - C[None, :, 0], P[ids][:, None, 1] - C[None, :, 1]), axis=1)
            j = int(dd.argmax())
            if dd[j] > tol and len(ids) > 2: worst.append(int(ids[j]))
        if not worst: break
        keep = sorted(set(keep) | set(worst))
    # try removing points greedily where possible (simplify)
    return P[keep]


def fmt(v):
    s = f'{v:.1f}'
    return s[:-2] if s.endswith('.0') else s


svg = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(VW)} {fmt(VH)}" width="{fmt(VW)}" height="{fmt(VH)}">',
       '  <!-- gift box: centerline pen strokes extracted from IMG_5773.jpg; 100 units = one ruled-line spacing -->',
       '  <g fill="none" stroke="#1a1a1a" stroke-linecap="round" stroke-linejoin="round">']
for g in GROUP_ORDER:
    svg.append(f'    <g id="{g}">')
    for s in strokes_json:
        if s['group'] != g: continue
        P = np.array(s['pts'])[:, :2]
        K = thin(P, s['closed'])
        segs = cr_segments(K, s['closed'])
        d = f'M{fmt(K[0][0])},{fmt(K[0][1])}'
        for (_, c1, c2, p3) in segs:
            d += f' C{fmt(c1[0])},{fmt(c1[1])} {fmt(c2[0])},{fmt(c2[1])} {fmt(p3[0])},{fmt(p3[1])}'
        if s['closed']: d += ' Z'
        sw = float(np.median(np.array(s['pts'])[:, 2]))
        svg.append(f'      <path id="{s["id"]}" data-role="{s["role"]}" stroke-width="{fmt(sw)}" d="{d}"/>')
    svg.append('    </g>')
svg += ['  </g>', '</svg>', '']
open(OUT + '/box.svg', 'w').write('\n'.join(svg))

# ---------------------------------------------------------------- renders
subprocess.run(['rsvg-convert', '-w', '1200', '-b', 'white', OUT + '/box.svg', '-o', OUT + '/box-clean.png'], check=True)
red = open(OUT + '/box.svg').read().replace('stroke="#1a1a1a"', 'stroke="#e01010" stroke-opacity="0.55"')
open(DBG + '/box-red.svg', 'w').write(red)
OW = 1600
subprocess.run(['rsvg-convert', '-w', str(OW), DBG + '/box-red.svg', '-o', DBG + '/red.png'], check=True)
photo = ImageOps.exif_transpose(Image.open(SRC)).convert('L').crop((cx0, cy0, cx1, cy1))
OH = int(round(OW * VH / VW))
photo = photo.resize((OW, OH), Image.LANCZOS)
ph = np.asarray(photo).astype(np.float32); ph = 255 - (255 - ph) * 0.45 + 10
base = Image.fromarray(np.clip(ph, 0, 255).astype(np.uint8)).convert('RGBA')
redimg = Image.open(DBG + '/red.png').convert('RGBA').resize((OW, OH), Image.LANCZOS)
Image.alpha_composite(base, redimg).convert('RGB').save(OUT + '/box-overlay.png')

json.dump({'ox': float(ORG[0]), 'oy': float(ORG[1])}, open(DBG + '/origin.json', 'w'))
# debug dump for tile.py overlays (full-res px)
json.dump([dict(id=b['id'], pts_px=b['pts_px'].tolist()) for b in built], open(DBG + '/strokes_px.json', 'w'))
for b in built:
    L = np.sum(np.hypot(*np.diff(b['pts_px'][:, :2], axis=0).T)) * S
    print(f"  {b['id']:18s} n={len(b['pts_px']):4d} len={L:6.1f}u  w_med={np.median(b['pts_px'][:,2])*S:.2f}")
