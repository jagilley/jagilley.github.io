"""Debug: each stroke in its own colour, start dot + arrow-ish label, on white. Units from box.strokes.json."""
import json, numpy as np
from PIL import Image, ImageDraw, ImageFont
W='/Users/jasper/Code/jagilley.github.io/jaden-work'
doc=json.load(open(W+'/extract/box/box.strokes.json'))
k=2.0; VW,VH=doc['viewBox'][2:]
img=Image.new('RGB',(int(VW*k),int(VH*k)),'white'); d=ImageDraw.Draw(img)
font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 16)
cols=[(220,30,30),(20,140,20),(30,60,220),(200,0,200),(0,160,190),(230,120,0),(110,60,0),(90,90,90),(150,150,0)]
for i,s in enumerate(doc['strokes']):
    c=cols[i%len(cols)]; P=[(x*k,y*k) for x,y,w in s['pts']]
    if s['closed']: P=P+[P[0]]
    d.line(P,fill=c,width=4)
    d.ellipse([P[0][0]-7,P[0][1]-7,P[0][0]+7,P[0][1]+7],fill=c)
    m=P[len(P)//3]; d.text((m[0]+6,m[1]-18),f"{i}:{s['id']}",fill=c,font=font)
img.save(W+'/tools/box/debug/strokemap.png')
img.crop((int(560*k),int(20*k),int(VW*k),int(260*k))).save(W+'/tools/box/debug/strokemap_bow.png')
