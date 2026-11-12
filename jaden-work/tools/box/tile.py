"""Render a zoomed tile (full-res coords) of mask+pruned skeleton+junction nodes with a coordinate grid.
usage: tile.py x0 y0 x1 y1 scale out.png [overlay_strokes.json]"""
import sys, json, pickle, numpy as np
from PIL import Image, ImageDraw, ImageFont
W='/Users/jasper/Code/jagilley.github.io/jaden-work'; DBG=W+'/tools/box/debug'
x0,y0,x1,y1=map(int,sys.argv[1:5]); s=float(sys.argv[5]); out=sys.argv[6]
OX,OY=1900,860
ink=np.load(DBG+'/ink_raw.npy'); sk=np.load(DBG+'/sk_pruned.npy')
nodes,edges=pickle.load(open(DBG+'/graph.pkl','rb'))
from PIL import ImageOps
photo=ImageOps.exif_transpose(Image.open('/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg')).convert('L').crop((x0,y0,x1,y1))
ph=np.asarray(photo).astype(np.float32); ph=255-(255-ph)*0.35
m=ink[y0:y1,x0:x1]
base=np.dstack([ph,ph,ph]); base[m]=base[m]*0.75
skc=np.zeros_like(m); 
yy0,yy1,xx0,xx1=y0-OY,y1-OY,x0-OX,x1-OX
skc=sk[max(yy0,0):yy1, max(xx0,0):xx1]
base[max(yy0,0)-yy0:max(yy0,0)-yy0+skc.shape[0], max(xx0,0)-xx0:max(xx0,0)-xx0+skc.shape[1]][skc]=(0,0,0)
img=Image.fromarray(base.astype(np.uint8)).resize((int((x1-x0)*s),int((y1-y0)*s)),Image.NEAREST)
d=ImageDraw.Draw(img)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 13)
for gx in range((x0//20+1)*20, x1, 20):
    c=(0,0,255) if gx%100==0 else (160,160,255)
    d.line([((gx-x0)*s,0),((gx-x0)*s,img.height)],fill=c+(0,),width=1 if gx%100 else 1)
    if gx%100==0: d.text(((gx-x0)*s+2,2),str(gx),fill=(0,0,255),font=font)
for gy in range((y0//20+1)*20, y1, 20):
    c=(0,0,255) if gy%100==0 else (160,160,255)
    d.line([(0,(gy-y0)*s),(img.width,(gy-y0)*s)],fill=c,width=1)
    if gy%100==0: d.text((2,(gy-y0)*s+2),str(gy),fill=(0,0,255),font=font)
for n in nodes:
    x,y=(n['x']+OX-x0)*s,(n['y']+OY-y0)*s
    d.ellipse([x-5,y-5,x+5,y+5],outline=(255,0,0) if n['kind']=='junc' else (0,170,0),width=2)
if len(sys.argv)>7:
    S=json.load(open(sys.argv[7]))
    cols=[(230,30,30),(30,150,30),(30,60,230),(200,0,200),(0,170,200),(230,130,0),(120,60,0),(0,0,0)]
    for i,st in enumerate(S):
        c=cols[i%len(cols)]
        p=[((x-x0)*s,(y-y0)*s) for x,y,*_ in st['pts_px']]
        d.line(p,fill=c,width=2)
        d.ellipse([p[0][0]-4,p[0][1]-4,p[0][0]+4,p[0][1]+4],fill=c)
        mid=p[len(p)//2]; d.text((mid[0]+5,mid[1]),st['id'],fill=c,font=font)
img.save(out)
