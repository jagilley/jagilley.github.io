"""Measure ruled-line spacing (lines run vertically) from a blueness projection profile."""
import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi, signal
im = ImageOps.exif_transpose(Image.open('/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg')).convert('RGB')
a = np.asarray(im).astype(np.float32)
blu = a[...,2]-a[...,0]          # blue rules: B >> R
def peaks_in(y0,y1,x0,x1):
    prof = blu[y0:y1, x0:x1].mean(0)
    prof = prof - ndi.uniform_filter1d(prof, 120)
    pk,_ = signal.find_peaks(prof, distance=120, height=prof.max()*0.3)
    # subpixel: centroid within +-6
    sub=[]
    for p in pk:
        lo,hi=max(p-6,0),min(p+7,len(prof)); w=np.clip(prof[lo:hi],0,None)
        sub.append(x0+(np.arange(lo,hi)*w).sum()/w.sum())
    return np.array(sub)
for (y0,y1,x0,x1,name) in [(0,3212,80,5400,'full'),(900,2450,1700,3800,'drawing band rows'),(600,900,1700,3800,'above drawing'),(2400,3100,1700,3800,'below drawing')]:
    p = peaks_in(y0,y1,x0,x1)
    d = np.diff(p)
    i = np.arange(len(p)); A=np.polyfit(i,p,1)
    print(name, 'n',len(p),'median diff %.2f'%np.median(d),'fit %.2f'%A[0], 'min/max %.1f %.1f'%(d.min(),d.max()))
    if name.startswith('drawing'): print(np.round(p,1)); print(np.round(d,1))
