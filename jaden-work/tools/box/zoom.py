"""Zoomed overlay crops (photo + red strokes) for verification. usage: zoom.py name x0 y0 x1 y1 [scale]  (full-res photo px)"""
import sys, json, subprocess, numpy as np
from PIL import Image, ImageOps
W='/Users/jasper/Code/jagilley.github.io/jaden-work'; DBG=W+'/tools/box/debug'; OUT=W+'/extract/box'
doc=json.load(open(OUT+'/box.strokes.json')); VW,VH=doc['viewBox'][2:]
S=100/doc['spacing_px']
# recover origin from ink bbox: stored in debug by extract; recompute from box-ink size
name=sys.argv[1]; x0,y0,x1,y1=map(int,sys.argv[2:6]); sc=float(sys.argv[6]) if len(sys.argv)>6 else 3
org=json.load(open(DBG+'/origin.json'))
ox,oy=org['ox'],org['oy']
# render red svg at scale sc px per photo px
Wpx=int(round(VW/S*sc))
subprocess.run(['rsvg-convert','-w',str(Wpx),DBG+'/box-red.svg','-o',DBG+'/_red_big.png'],check=True)
red=Image.open(DBG+'/_red_big.png').convert('RGBA')
# crop region in red image coordinates
rx0,ry0=int((x0-ox)*sc),int((y0-oy)*sc); rx1,ry1=int((x1-ox)*sc),int((y1-oy)*sc)
redc=red.crop((rx0,ry0,rx1,ry1))
ph=ImageOps.exif_transpose(Image.open('/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg')).convert('L').crop((x0,y0,x1,y1)).resize(redc.size,Image.LANCZOS)
a=np.asarray(ph).astype(np.float32); a=255-(255-a)*0.6
base=Image.fromarray(a.astype(np.uint8)).convert('RGBA')
Image.alpha_composite(base,redc).convert('RGB').save(DBG+f'/z_{name}.png')
