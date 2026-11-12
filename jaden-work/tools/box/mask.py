"""Step 1: ink mask for the gift box drawing.
Outputs (in tools/box/debug): norm max-channel map + raw mask; saves mask npy for later steps."""
import numpy as np, cv2, sys, json
from PIL import Image, ImageOps
from scipy import ndimage as ndi
from skimage import morphology, filters, measure

SRC='/Users/jasper/Code/jagilley.github.io/jaden-work/source/IMG_5773.jpg'
W='/Users/jasper/Code/jagilley.github.io/jaden-work'
DBG=W+'/tools/box/debug'
im = ImageOps.exif_transpose(Image.open(SRC)).convert('RGB')
a = np.asarray(im).astype(np.float32)
H,Wd,_ = a.shape

# --- background (paper) estimate per channel: closing on a 4x downsample, removes thin dark lines
k=4
small = cv2.resize(a,(Wd//k,H//k),interpolation=cv2.INTER_AREA)
bg = np.empty_like(small)
for c in range(3):
    ch = small[...,c]
    d = ndi.maximum_filter(ch, size=15)
    d = ndi.minimum_filter(d, size=15)
    bg[...,c] = ndi.gaussian_filter(d, 4)
bg = cv2.resize(bg,(Wd,H),interpolation=cv2.INTER_LINEAR)
norm = np.clip(a/np.maximum(bg,1),0,1.2)
mx = norm.max(axis=2)          # ink: low in every channel; blue rule: B high; red rule: R high
# extra penalty for chroma (bluish / reddish) pixels: ink is neutral, rule bleed is not
chroma = np.maximum(norm[...,2]-norm[...,0], 0) + np.maximum(norm[...,0]-norm[...,2]-0.05, 0)
score = mx + 0.8*chroma
np.save(DBG+'/score.npy', score.astype(np.float16))
Image.fromarray((np.clip(mx,0,1)*255).astype(np.uint8)).save(DBG+'/mx.png')

# --- hysteresis threshold
strong = score < 0.40
weak = score < 0.54
lab,n = ndi.label(weak, structure=np.ones((3,3)))
keep = np.zeros(n+1,bool); keep[np.unique(lab[strong])]=True; keep[0]=False
ink = keep[lab]
# --- restrict to the drawing area (exclude page edges / blue object); generous box
roi = np.zeros_like(ink); roi[700:2600, 1700:3800]=True
ink &= roi
# remove small specks
lab,n = ndi.label(ink, structure=np.ones((3,3)))
areas = ndi.sum(ink, lab, index=np.arange(1,n+1))
print('components', n, sorted(areas.astype(int))[-15:])
keep = np.zeros(n+1,bool); keep[1:] = areas > 400
ink = keep[lab]
# fill pinholes
ink = morphology.remove_small_holes(ink, 60)
np.save(DBG+'/ink_raw.npy', ink)
ys,xs = np.nonzero(ink); print('bbox', xs.min(), ys.min(), xs.max(), ys.max())
Image.fromarray((~ink*255).astype(np.uint8)).save(DBG+'/ink_raw.png')
