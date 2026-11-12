"""Step 4: check renders for the text figure.

  text-clean.png    SVG alone, black on white, ~1600 px wide
  text-overlay.png  lightened grayscale photo crop + SVG in translucent red
  text-order.png    strokes coloured by writing order, numbered, with arrows
Optional argv: x0 y0 x1 y1 (units) to also write zoomed _work/zoom_*.png crops.
"""
import json, math, subprocess, sys, os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps, ImageEnhance

W = '/Users/jasper/Code/jagilley.github.io/jaden-work'
OUT = f'{W}/extract/text'
WORK = f'{OUT}/_work'
doc = json.load(open(f'{OUT}/text.strokes.json'))
VBW, VBH = doc['viewBox'][2], doc['viewBox'][3]
X0, Y0, X1, Y1 = doc['crop_px']
PXW = 1600


def render_svg(svg_path, png_path, width):
    subprocess.run(['rsvg-convert', '-w', str(width), '-b', 'white', svg_path, '-o', png_path], check=True)


# clean
render_svg(f'{OUT}/text.svg', f'{OUT}/text-clean.png', PXW)

# overlay: red version of the svg on transparent
svg = open(f'{OUT}/text.svg').read().replace('stroke="#1a1a1a"', 'stroke="#e0201a"')
open(f'{WORK}/red.svg', 'w').write(svg)


def overlay(width, box_u=None, name=None):
    subprocess.run(['rsvg-convert', '-w', str(width), f'{WORK}/red.svg', '-o', f'{WORK}/red.png'], check=True)
    red = Image.open(f'{WORK}/red.png').convert('RGBA')
    photo = ImageOps.exif_transpose(Image.open('/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5775.jpg'))
    photo = photo.crop((X0, Y0, X1, Y1)).convert('L').resize(red.size, Image.LANCZOS)
    photo = Image.eval(photo, lambda v: int(110 + v * 145 / 255))  # lighten
    base = photo.convert('RGBA')
    a = np.asarray(red).astype(np.float32)
    a[..., 3] *= 0.55
    out = Image.alpha_composite(base, Image.fromarray(a.astype(np.uint8)))
    return out.convert('RGB')

overlay(PXW).save(f'{OUT}/text-overlay.png')

# order image
sc = PXW / VBW
img = Image.new('RGB', (PXW, int(round(VBH * sc))), 'white')
d = ImageDraw.Draw(img)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
except Exception:
    font = ImageFont.load_default()
S = doc['strokes']
N = len(S)


def grad(t):
    # blue -> magenta -> orange
    stops = [(0.0, (40, 90, 220)), (0.5, (200, 40, 160)), (1.0, (240, 140, 0))]
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        if t <= t1:
            u = (t - t0) / (t1 - t0)
            return tuple(int(c0[i] + u * (c1[i] - c0[i])) for i in range(3))
    return stops[-1][1]


for n, s in enumerate(S):
    col = grad(n / max(1, N - 1))
    a = np.array(s['pts'])[:, :2] * sc
    sw = max(2, int(np.median(np.array(s['pts'])[:, 2]) * sc * (1.0 if s['dot'] else 0.45)))
    if len(a) > 1:
        d.line([tuple(p) for p in a], fill=col, width=sw, joint='curve')
    # start marker
    d.ellipse([a[0][0] - 4, a[0][1] - 4, a[0][0] + 4, a[0][1] + 4], fill=col)
    # arrowheads along the stroke
    seg = np.hypot(*np.diff(a, axis=0).T) if len(a) > 1 else np.array([0])
    L = seg.sum()
    cs = np.concatenate([[0], np.cumsum(seg)])
    nar = max(1, int(L // 70))
    for j in range(nar):
        t = (j + 0.5) / nar * L if L > 0 else 0
        i = min(int(np.searchsorted(cs, t)), len(a) - 1)
        i0 = max(i - 1, 0); i1 = min(i + 1, len(a) - 1)
        v = a[i1] - a[i0]
        nv = np.hypot(*v)
        if nv < 1e-6:
            continue
        v /= nv
        nrm = np.array([-v[1], v[0]])
        tip = a[i] + v * 5
        p1 = tip - v * 9 + nrm * 5; p2 = tip - v * 9 - nrm * 5
        d.polygon([tuple(tip), tuple(p1), tuple(p2)], fill=(0, 0, 0))
    lx, ly = a[0]
    d.text((lx + 5, ly - 18), str(n + 1), fill=col, font=font, stroke_width=2, stroke_fill=(255, 255, 255))
img.save(f'{OUT}/text-order.png')

if len(sys.argv) > 1:
    # zoomed overlay crops for checking: name x0 y0 x1 y1 (units), repeated
    args = sys.argv[1:]
    big = overlay(3200)
    s2 = 3200 / VBW
    o2 = img.resize(big.size)
    for k in range(0, len(args), 5):
        name = args[k]; x0, y0, x1, y1 = map(float, args[k + 1:k + 5])
        box = tuple(int(v * s2) for v in (x0, y0, x1, y1))
        a = big.crop(box); b = o2.crop(box)
        both = Image.new('RGB', (a.width, a.height * 2), 'white')
        both.paste(a, (0, 0)); both.paste(b, (0, a.height))
        both.save(f'{WORK}/zoom_{name}.png')
print('rendered')
