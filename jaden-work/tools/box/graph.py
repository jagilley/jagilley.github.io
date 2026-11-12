"""Skeleton graph: nodes (junction clusters / endpoints), edges (pixel chains), spur pruning.
Importable (build_graph) and runnable (renders numbered debug tiles)."""
import numpy as np
from scipy import ndimage as ndi
from PIL import Image, ImageDraw, ImageFont
W='/Users/jasper/Code/jagilley.github.io/jaden-work'; DBG=W+'/tools/box/debug'
N8=[(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

def build_graph(sk, spur_len=22):
    sk = sk.copy()
    for it in range(6):
        nodes, edges = _trace(sk)
        # prune short spurs: edge with one end a terminal (deg1) and other a junction
        deg = {}
        for e in edges:
            for n in (e['a'],e['b']): deg[n]=deg.get(n,0)+1
        removed=0
        for e in edges:
            a,b=e['a'],e['b']
            if a==b: continue
            ta = nodes[a]['kind']=='end'; tb = nodes[b]['kind']=='end'
            if (ta ^ tb) and len(e['px'])<spur_len and deg[b if ta else a]>=3:
                for (y,x) in e['px']:
                    if not nodes[b if ta else a]['mask'].get((y,x),False): sk[y,x]=False
                removed+=1
        if not removed: break
    nodes, edges = _trace(sk)
    return sk, nodes, edges

def _trace(sk):
    H,Wd=sk.shape
    K=np.ones((3,3),int); K[1,1]=0
    nb=ndi.convolve(sk.astype(int),K,mode='constant')*sk
    junc = (nb>=3)&sk
    # cluster junction pixels (8-conn, dilate by 1 to merge near-adjacent)
    jl,nj = ndi.label(ndi.binary_dilation(junc, np.ones((3,3)))&sk, np.ones((3,3)))
    nodes=[]; pix2node={}
    for i in range(1,nj+1):
        ys,xs=np.nonzero(jl==i)
        nid=len(nodes); nodes.append({'kind':'junc','y':ys.mean(),'x':xs.mean(),'mask':{}})
        for y,x in zip(ys,xs): pix2node[(y,x)]=nid; nodes[nid]['mask'][(y,x)]=True
    ys,xs=np.nonzero((nb==1)&sk)
    for y,x in zip(ys,xs):
        if (y,x) in pix2node: continue
        nid=len(nodes); nodes.append({'kind':'end','y':float(y),'x':float(x),'mask':{(y,x):True}}); pix2node[(y,x)]=nid
    visited=set(); edges=[]
    def nbrs(y,x):
        for dy,dx in N8:
            yy,xx=y+dy,x+dx
            if 0<=yy<H and 0<=xx<Wd and sk[yy,xx]: yield (yy,xx)
    for (py,px),nid in list(pix2node.items()):
        for q in nbrs(py,px):
            if q in pix2node: continue
            if (min((py,px),q),max((py,px),q)) in visited: continue
            chain=[q]; prev=(py,px); cur=q
            visited.add((min(prev,cur),max(prev,cur)))
            end=None
            while True:
                nxt=[r for r in nbrs(*cur) if r!=prev and r not in chain[-3:]]
                # prefer a node pixel if adjacent
                hit=[r for r in nxt if r in pix2node and r!=(py,px) or (r in pix2node and len(chain)>2)]
                if hit: end=pix2node[hit[0]]; visited.add((min(cur,hit[0]),max(cur,hit[0]))); break
                nxt=[r for r in nxt if r not in pix2node]
                if not nxt: end=None; break
                # 4-neighbours first to avoid corner skipping duplicates
                nxt.sort(key=lambda r: abs(r[0]-cur[0])+abs(r[1]-cur[1]))
                r=nxt[0]
                if (min(cur,r),max(cur,r)) in visited and r in chain: break
                visited.add((min(cur,r),max(cur,r)))
                prev,cur=cur,r; chain.append(cur)
            if end is None: continue
            edges.append({'a':nid,'b':end,'px':chain})
    # dedupe edges traced from both ends
    seen=set(); out=[]
    for e in edges:
        key=(min(e['a'],e['b']),max(e['a'],e['b']),len(e['px']), min(e['px'][0],e['px'][-1]))
        if key in seen: continue
        seen.add(key); out.append(e)
    # loops with no node (isolated closed curve) are ignored here (none expected)
    return nodes,out

if __name__=='__main__':
    sk=np.load(DBG+'/sk.npy'); 
    sk2,nodes,edges=build_graph(sk)
    np.save(DBG+'/sk_pruned.npy', sk2)
    print('nodes',len(nodes),'edges',len(edges), 'ends',sum(n['kind']=='end' for n in nodes))
    import pickle; pickle.dump((nodes,edges),open(DBG+'/graph.pkl','wb'))
    m=np.load(DBG+'/ink_raw.npy')[860:2460,1900:3560]
    base=np.dstack([np.where(m,215,255)]*3).astype(np.uint8)
    img=Image.fromarray(base); d=ImageDraw.Draw(img)
    rng=np.random.default_rng(3)
    try: font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 15)
    except Exception: font=None
    for i,e in enumerate(edges):
        c=tuple(int(v) for v in rng.integers(0,200,3))
        for (y,x) in e['px']: d.point((x,y),fill=c)
        pts=e['px']; 
        for (y,x) in pts: d.rectangle([x-1,y-1,x+1,y+1],fill=c)
        y,x=pts[len(pts)//2]
        d.text((x+4,y-8),str(i),fill=c,font=font)
    for j,n in enumerate(nodes):
        x,y=n['x'],n['y']
        d.ellipse([x-5,y-5,x+5,y+5],outline=(255,0,0) if n['kind']=='junc' else (0,170,0),width=2)
    # grid every 100 px (full-res coords)
    for gx in range(2000,3560,100):
        d.line([(gx-1900,0),(gx-1900,8)],fill=(0,0,255)); d.text((gx-1900+2,0),str(gx),fill=(0,0,255),font=font)
    for gy in range(900,2460,100):
        d.line([(0,gy-860),(8,gy-860)],fill=(0,0,255)); d.text((0,gy-860+2),str(gy),fill=(0,0,255),font=font)
    img.save(DBG+'/graph_full.png')
