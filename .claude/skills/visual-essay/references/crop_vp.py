"""Crop viewport captures from render.mjs (vp mode) to their element rect (+pad), using the .rect.json sidecar.
  python3 crop_vp.py /abs/shots-dir      -> overwrites each X.png that has X.png.rect.json with the crop
"""
import glob, json, os, sys
from PIL import Image
d = sys.argv[1]
for rj in sorted(glob.glob(os.path.join(d, "*.png.rect.json"))):
    png = rj[:-10]; meta = json.load(open(rj)); x, y, w, h = meta["rect"]; dpr = meta["dpr"]; pad = meta["pad"]
    im = Image.open(png); W, H = im.size
    box = (max(0, int((x - pad) * dpr)), max(0, int((y - pad) * dpr)), min(W, int((x + w + pad) * dpr)), min(H, int((y + h + pad) * dpr)))
    im.crop(box).save(png); os.remove(rj); print(os.path.basename(png), box)
