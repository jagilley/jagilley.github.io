import numpy as np
from PIL import Image, ImageOps
im = ImageOps.exif_transpose(Image.open('/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg')).convert('RGB')
a = np.asarray(im).astype(np.float32)
print(a.shape)
# sample some pixels: paper, blue rule, ink, red line
# crop region scale: crop origin 1950,880, crop 1600 -> 1400 => f=1600/1400
f=1600/1400
def P(cx,cy): return int(1950+cx*f), int(880+cy*f)
for name,(cx,cy) in {'paper':(250,600),'ink_left':(100,700),'ink_bottom':(600,1278)}.items():
    x,y=P(cx,cy); print(name, x,y, a[y-3:y+4,x-3:x+4].reshape(-1,3).min(0), a[y-3:y+4,x-3:x+4].reshape(-1,3).mean(0))
# blue rule profile along a row
y=int(880+600*f)
row=a[y,1950:3550]
import sys
# print positions where B-R large
d=row[:,2]-row[:,0]
idx=np.where(d>60)[0]
print('blue idx sample', idx[:60])
print(row[idx[:10]])
# red line: around preview y=105 => full y~428
col=a[300:600, 1000]
for i in range(0,300,5): print(300+i, col[i])
