#!/usr/bin/env python3
"""Plain colour crops of Jasper's photos for the review page (review/photo/<fig>.jpg).

The crops match each figure's viewBox (figure units -> photo px via the JSON's spacing_px)."""
import json
from pathlib import Path
from PIL import Image, ImageOps

W = Path(__file__).resolve().parents[2]
SRC = Path('/Users/jasper/Code/jagilley.github.io/jaden-work/source')
OUT = W / 'review' / 'photo'
OUT.mkdir(parents=True, exist_ok=True)

def crop(fig, photo, x0, y0):
    d = json.loads((W / 'extract' / fig / f'{fig}.strokes.json').read_text())
    k = d['spacing_px'] / 100.0
    vw, vh = d['viewBox'][2], d['viewBox'][3]
    im = ImageOps.exif_transpose(Image.open(SRC / photo)).convert('RGB')
    im = im.crop((int(x0), int(y0), int(x0 + vw * k), int(y0 + vh * k)))
    s = 900 / im.size[0]
    im = im.resize((900, int(im.size[1] * s)), Image.LANCZOS)
    im.save(OUT / f'{fig}.jpg', quality=84)
    print(fig, im.size)

o = json.loads((W / 'tools/box/debug/origin.json').read_text())
crop('box', 'IMG_5773.jpg', o['ox'], o['oy'])
b = json.loads((W / 'extract/ball/ball.strokes.json').read_text())['source']['crop_px']
crop('ball', 'IMG_5774.jpg', b[0], b[1])
t = json.loads((W / 'extract/text/text.strokes.json').read_text())['crop_px']
crop('text', 'IMG_5775.jpg', t[0], t[1])
