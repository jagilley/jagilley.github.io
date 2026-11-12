"""Step 2: skeleton graph of the ink mask.

Writes extract/text/_work/graph.json (nodes + edges as pixel polylines in
photo coordinates, with local half-width) and numbered debug images
extract/text/_work/seg_*.png used to hand-compose the pen strokes.
"""
import json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
import cv2

W = '/Users/jasper/Code/jagilley.github.io/jaden-work'
WORK = f'{W}/extract/text/_work'
meta = json.load(open(f'{WORK}/meta.json'))
ink = np.asarray(Image.open(f'{WORK}/ink_full.png')) > 0

# smooth the outline a little so the skeleton has fewer spurs
sm = cv2.GaussianBlur(ink.astype(np.float32), (0, 0), 2.5) > 0.5
edt = ndi.distance_transform_edt(sm)
sk = skeletonize(sm)
# save only the writing region (disk is tight): float16, compressed, with offset
_ys, _xs = np.nonzero(sm)
_x0, _y0 = max(0, _xs.min() - 150), max(0, _ys.min() - 150)
_x1, _y1 = _xs.max() + 150, _ys.max() + 150
np.savez_compressed(f'{WORK}/edt_crop.npz', edt=edt[_y0:_y1, _x0:_x1].astype(np.float16), off=np.array([_x0, _y0]))

H, Wd = sk.shape
OFFS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def build_graph(sk):
    ys, xs = np.nonzero(sk)
    pix = set(zip(ys.tolist(), xs.tolist()))
    def nbrs(p):
        y, x = p
        return [(y + dy, x + dx) for dy, dx in OFFS if (y + dy, x + dx) in pix]
    deg = {p: len(nbrs(p)) for p in pix}
    nodepix = {p for p in pix if deg[p] != 2}
    # cluster node pixels (8-connected)
    node_of = {}
    nodes = []
    for p in nodepix:
        if p in node_of:
            continue
        stack = [p]; comp = []
        node_of[p] = len(nodes)
        while stack:
            q = stack.pop(); comp.append(q)
            for r in nbrs(q):
                if r in nodepix and r not in node_of:
                    node_of[r] = len(nodes); stack.append(r)
        cy = float(np.mean([c[0] for c in comp])); cx = float(np.mean([c[1] for c in comp]))
        nodes.append({'pix': comp, 'xy': (cx, cy)})
    edges = []
    visited = set()  # directed first steps (nodepix, nextpix)
    for ni, nd in enumerate(nodes):
        for p in nd['pix']:
            for q in nbrs(p):
                if q in nodepix:
                    if node_of[q] != ni and (p, q) not in visited:
                        # direct node-node adjacency (tiny edge)
                        visited.add((p, q)); visited.add((q, p))
                        edges.append({'a': ni, 'b': node_of[q], 'pts': [(p[1], p[0]), (q[1], q[0])]})
                    continue
                if (p, q) in visited:
                    continue
                path = [p, q]
                prev, cur = p, q
                while True:
                    nx = [r for r in nbrs(cur) if r != prev and r not in path[-3:]]
                    nn = [r for r in nx if r in nodepix]
                    if nn:
                        # reached a node
                        end = nn[0]
                        path.append(end)
                        break
                    if not nx:
                        end = None
                        break
                    prev, cur = cur, nx[0]
                    path.append(cur)
                if end is None:
                    continue
                visited.add((p, q)); visited.add((end, path[-2]))
                edges.append({'a': ni, 'b': node_of[end], 'pts': [(c[1], c[0]) for c in path]})
    # pure cycles (no node pixels)
    seen = set()
    for e in edges:
        for c in e['pts']:
            seen.add((c[1], c[0]))
    for p in pix:
        if p in seen or p in nodepix:
            continue
        # walk the cycle
        path = [p]; prev = None; cur = p
        while True:
            nx = [r for r in nbrs(cur) if r != prev]
            if prev is not None and p in nx and len(path) > 3:
                break
            nx = [r for r in nx if r not in path]
            if not nx:
                break
            prev, cur = cur, nx[0]; path.append(cur)
        for c in path:
            seen.add(c)
        ni = len(nodes)
        nodes.append({'pix': [p], 'xy': (float(p[1]), float(p[0]))})
        edges.append({'a': ni, 'b': ni, 'pts': [(c[1], c[0]) for c in path] + [(p[1], p[0])]})
    return nodes, edges


def plen(pts):
    a = np.asarray(pts, float)
    return float(np.sum(np.hypot(*np.diff(a, axis=0).T))) if len(a) > 1 else 0.0


nodes, edges = build_graph(sk)
print('raw', len(nodes), 'nodes', len(edges), 'edges')

# ---- prune spurs iteratively ----
def degree(edges, n):
    return sum((e['a'] == n) + (e['b'] == n) for e in edges)

changed = True
while changed:
    changed = False
    for e in list(edges):
        da, db = degree(edges, e['a']), degree(edges, e['b'])
        L = plen(e['pts'])
        if (da == 1) ^ (db == 1):
            j = e['b'] if da == 1 else e['a']
            jx, jy = nodes[j]['xy']
            r = edt[int(round(jy)), int(round(jx))]
            if L < max(20.0, 1.3 * r):
                if L >= 12:
                    print('pruned spur len %.0f r %.1f at' % (L, r), e['pts'][0], e['pts'][-1])
                edges.remove(e); changed = True
                break
    if changed:
        continue
    # merge degree-2 nodes
    for ni in range(len(nodes)):
        inc = [e for e in edges if e['a'] == ni or e['b'] == ni]
        if degree(edges, ni) == 2 and len(inc) == 2:
            e1, e2 = inc
            p1 = e1['pts'] if e1['b'] == ni else e1['pts'][::-1]
            a1 = e1['a'] if e1['b'] == ni else e1['b']
            p2 = e2['pts'] if e2['a'] == ni else e2['pts'][::-1]
            b2 = e2['b'] if e2['a'] == ni else e2['a']
            edges.remove(e1); edges.remove(e2)
            edges.append({'a': a1, 'b': b2, 'pts': p1 + p2[1:]})
            changed = True
            break

# drop isolated tiny bits (none expected)
edges = [e for e in edges if plen(e['pts']) > 6 or e['a'] != e['b']]
# order edges left-to-right by min x, top-to-bottom for stable numbering
def key(e):
    a = np.asarray(e['pts'])
    line = 0 if a[:, 1].mean() < 1640 else 1
    return (line, a[:, 0].min())
edges.sort(key=key)

out_nodes = {}
for e in edges:
    for k in ('a', 'b'):
        n = e[k]
        out_nodes[n] = nodes[n]['xy']
gj = {'nodes': {str(k): v for k, v in out_nodes.items()},
      'edges': []}
for i, e in enumerate(edges):
    pts = e['pts']
    rr = [float(edt[y, x]) for x, y in pts]
    gj['edges'].append({'id': i, 'a': e['a'], 'b': e['b'], 'pts': pts, 'r': rr,
                        'len': plen(pts)})
json.dump(gj, open(f'{WORK}/graph.json', 'w'))
print('final', len(out_nodes), 'nodes', len(edges), 'edges')
for i, e in enumerate(gj['edges']):
    a = np.asarray(e['pts'])
    print(i, 'a', e['a'], 'b', e['b'], 'len %.0f' % e['len'], 'x %d-%d y %d-%d' % (a[:, 0].min(), a[:, 0].max(), a[:, 1].min(), a[:, 1].max()))

# ---- debug renders ----
pal = [(230, 25, 75), (60, 180, 75), (0, 130, 200), (245, 130, 48), (145, 30, 180),
       (70, 200, 200), (240, 50, 230), (128, 128, 0), (0, 0, 128), (170, 110, 40),
       (128, 0, 0), (0, 128, 128)]
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 22)
except Exception:
    font = ImageFont.load_default()

regions = {
    'happy': (1540, 1120, 2640, 1650),
    'birthday1': (2950, 1040, 3700, 1520),
    'birthday2': (3520, 1040, 4520, 1530),
    'jaden': (1660, 1620, 2700, 2020),
    'jaden2': (2600, 1500, 3720, 2020),
}
for name, (x0, y0, x1, y1) in regions.items():
    sc = 1.5
    base = np.where(ink[y0:y1, x0:x1], 215, 255).astype(np.uint8)
    im = Image.fromarray(base).convert('RGB').resize((int((x1 - x0) * sc), int((y1 - y0) * sc)))
    d = ImageDraw.Draw(im)
    for i, e in enumerate(gj['edges']):
        a = np.asarray(e['pts'], float)
        if a[:, 0].max() < x0 or a[:, 0].min() > x1 or a[:, 1].max() < y0 or a[:, 1].min() > y1:
            continue
        col = pal[i % len(pal)]
        q = [((x - x0) * sc, (y - y0) * sc) for x, y in a]
        d.line(q, fill=col, width=3)
        # arrow-ish marker at start (small circle) to show stored direction
        sx, sy = q[0]
        d.ellipse([sx - 4, sy - 4, sx + 4, sy + 4], outline=col, width=2)
        mx, my = q[len(q) // 2]
        d.text((mx + 4, my - 12), str(i), fill=col, font=font, stroke_width=2, stroke_fill=(255, 255, 255))
    for k, (x, y) in gj['nodes'].items():
        if x0 <= x <= x1 and y0 <= y <= y1:
            X, Y = (x - x0) * sc, (y - y0) * sc
            d.rectangle([X - 3, Y - 3, X + 3, Y + 3], fill=(0, 0, 0))
    im.save(f'{WORK}/seg_{name}.png')
