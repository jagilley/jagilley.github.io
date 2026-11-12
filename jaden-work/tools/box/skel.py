"""Skeleton + graph debug: renders numbered skeleton segments over the ink mask."""
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
W='/Users/jasper/Code/jagilley.github.io/jaden-work'; DBG=W+'/tools/box/debug'
ink = np.load(DBG+'/ink_raw.npy')
X0,Y0,X1,Y1 = 1900,860,3560,2460
m = ink[Y0:Y1,X0:X1]
# smooth mask edges a little before thinning (reduces spurs)
ms = ndi.gaussian_filter(m.astype(np.float32), 2.0) > 0.5
sk = skeletonize(ms)
dt = ndi.distance_transform_edt(ms)
np.save(DBG+'/sk.npy', sk); np.save(DBG+'/dt.npy', dt.astype(np.float32))
K = np.array([[1,1,1],[1,0,1],[1,1,1]])
nb = ndi.convolve(sk.astype(int), K, mode='constant')*sk
print('skel px', sk.sum(), 'endpoints', (nb==1).sum(), 'junction px', (nb>=3).sum())
print('median DT on skeleton', np.median(dt[sk]), 'width px ~', 2*np.median(dt[sk]))
# render
vis = np.dstack([np.where(m,200,255)]*3).astype(np.uint8)
vis[sk]=(0,0,0)
ys,xs=np.nonzero(nb==1); 
img=Image.fromarray(vis); d=ImageDraw.Draw(img)
for x,y in zip(xs,ys): d.ellipse([x-6,y-6,x+6,y+6],outline=(0,160,0),width=3)
ys,xs=np.nonzero(nb>=3)
for x,y in zip(xs,ys): d.ellipse([x-4,y-4,x+4,y+4],outline=(220,0,0),width=2)
img.save(DBG+'/skel_full.png')
