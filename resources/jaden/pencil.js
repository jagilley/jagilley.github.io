/*
 * pencil.js: vector strokes -> canvas, drawn as graphite + coloured pencil + marker on paper.
 *
 *   Pencil.render(ctx, figure, {seed, color, draw, groups, scale, x, y, layers, clip, blend})
 *
 * `figure` is window.JADEN.<name> = {strokes, style} (see style/README.md).
 * Everything is drawn in figure units (100 = one ruled-line spacing) under ctx's current
 * transform, then `x, y, scale`. Media are multiplied onto whatever is underneath, so draw
 * onto paper (Pencil.paper) or another opaque backdrop; pass blend:'normal' for a transparent canvas.
 *
 * Determinism: the same {seed, color, draw, groups} on the same transform gives the same pixels.
 * Geometry is cached per figure (seed independent) and per seed (jitter, hatching, paths).
 */
(function (root) {
  'use strict';

  const PI = Math.PI;
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ------------------------------------------------------------------ config */
  const config = {
    toothScale: 0.42,      // paper-tooth texel size in figure units (never finer than 1 device px)
    baseLevel: 0.8,        // graphite key-line pressure at weight 1 (~ fraction of the tooth it fills)
    weightGain: 0.7,       // how far line weight moves pressure: p = base * (1 + gain * (weight - 1))
    widthScale: 0.92,      // key-line width relative to the extracted pen width
    minDensity: 0.38,      // even a light stroke never drops below this much graphite in the pits (stays continuous)
    boil: { amp: 1.1, rot: 0.0035, width: 0.04 },   // per-seed rigid nudge of each stroke (units, rad) + width breathing
    register: [2.2, -1.6], // colour sits a touch up-right of the line (units)
    hatchAngle: 62,        // degrees, rising lower-left -> upper-right
  };

  /* ------------------------------------------------------- deterministic rng */
  function hashStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry(a) {
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rng = (...k) => mulberry(hashStr(k.join('|')));
  /** smooth value noise f(t) in [-1,1] with feature size `period` (same units as t) */
  function noise1(rand, period) {
    const K = 256, knots = new Float32Array(K);
    for (let i = 0; i < K; i++) knots[i] = rand() * 2 - 1;
    const off = rand() * K;
    return (t) => {
      const x = t / period + off, i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
      const a = knots[((i % K) + K) % K], b = knots[(((i + 1) % K) + K) % K];
      return a + (b - a) * u;
    };
  }

  /* ------------------------------------------------------------- colour */
  function hexRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  /** colour that, multiplied onto paper, reads as `target` */
  function onPaper(target, paper) {
    const t = hexRgb(target), p = hexRgb(paper);
    return t.map((v, i) => Math.min(255, Math.round((v / p[i]) * 255)));
  }

  /* ---------------------------------------------------------- paper tooth */
  // A tileable height field (0 = valley, 1 = peak), rank-equalised so a pressure p fills ~p of it.
  const TN = 256;
  let tooth = null;
  function getTooth() {
    if (tooth) return tooth;
    const N = TN, h = new Float32Array(N * N), r = rng('tooth', 1);
    // [cellX, cellY, amp]: fine 2-4 texel pits only (low octaves read as a camouflage filter)
    const layers = [[4, 4, 0.45], [2, 2, 0.55]];
    for (const [cx, cy, amp] of layers) {
      const gx = N / cx, gy = N / cy, lat = new Float32Array(gx * gy);
      for (let i = 0; i < lat.length; i++) lat[i] = r();
      for (let y = 0; y < N; y++) {
        const fy = y / cy, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
        const y0 = iy % gy, y1 = (iy + 1) % gy;
        for (let x = 0; x < N; x++) {
          const fx = x / cx, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
          const x0 = ix % gx, x1 = (ix + 1) % gx;
          const a = lat[y0 * gx + x0], b = lat[y0 * gx + x1], c = lat[y1 * gx + x0], d = lat[y1 * gx + x1];
          const top = a + (b - a) * sx, bot = c + (d - c) * sx;
          h[y * N + x] += amp * (top + (bot - top) * sy);
        }
      }
    }
    const idx = new Uint32Array(N * N);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    idx.sort((a, b) => h[a] - h[b]);
    const eq = new Float32Array(N * N);
    for (let i = 0; i < idx.length; i++) eq[idx[i]] = i / (idx.length - 1);
    tooth = { N, h: eq };
    return tooth;
  }

  // Patterns: colour deposited on the tooth. kind 'pencil': peaks fill first as pressure rises.
  // 'valley': alpha in the deepest pits (used to knock grain into marker colour).
  // 'paper': faint shading of the pits, for the paper itself.
  const patCache = new Map();
  let patCtx = null;
  function pattern(rgb, level, kind, soft) {
    level = Math.round(clamp01(level) * 40) / 40;
    soft = soft === undefined ? 0.12 : Math.round(soft * 20) / 20;
    const key = kind + rgb.join(',') + '|' + level + '|' + soft;
    let p = patCache.get(key);
    if (p) return p;
    const T = getTooth(), N = T.N;
    const cv = makeCanvas(N, N), c = cv.getContext('2d');
    const img = c.createImageData(N, N), d = img.data;
    // light pressure catches only the peaks (broken, grainy); heavy pressure fills the tooth
    const dens = 0.34 + 0.56 * level, thr = 1 - level, grain = 0.92 - 0.62 * level;
    for (let i = 0; i < N * N; i++) {
      const h = T.h[i];
      let a;
      if (kind === 'cov') {
        // graphite coverage at pressure `level` as opaque grey: peaks fill first, pits keep at least
        // minDensity (so a light line stays one line), and even full pressure leaves ~10% of the pits
        // showing (heavy = the same pencil pressed harder). `soft` widens the threshold when the tooth
        // is sub-pixel, so small renders average out instead of stippling.
        const md = config.minDensity, dn = 0.5 + 0.5 * level;
        const v = dn * (md + (1 - md) * smoothstep(1 - level - soft, 1 - level + soft, h));
        d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = Math.round(v * 255); d[i * 4 + 3] = 255;
        continue;
      }
      if (kind === 'pencil') a = dens * (1 - grain + grain * smoothstep(thr - 0.16, thr + 0.16, h));
      else if (kind === 'valley') a = level * smoothstep(0.45, 0.0, h);
      else a = level * smoothstep(0.6, 0.0, h);
      d[i * 4] = rgb[0]; d[i * 4 + 1] = rgb[1]; d[i * 4 + 2] = rgb[2]; d[i * 4 + 3] = Math.round(a * 255);
    }
    c.putImageData(img, 0, 0);
    if (!patCtx) patCtx = makeCanvas(1, 1).getContext('2d');
    p = patCtx.createPattern(cv, 'repeat');
    patCache.set(key, p);
    return p;
  }
  function makeCanvas(w, h) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  /**
   * Anchor a tooth pattern to the canvas (device pixels), whatever transform `c` currently has, so
   * every medium and the paper itself share one sheet of tooth: moving parts and boil frames slide
   * over the grain instead of re-rolling it. S.tex = device px per tooth texel.
   */
  function placePattern(p, S, c, angle, stretch) {
    let dev = new DOMMatrix([S.tex, 0, 0, S.tex, 0, 0]);
    // coloured pencil laid along a stroke: grain streaks along its direction
    if (angle !== undefined) dev = dev.rotate((angle * 180) / PI).scale(stretch || 3, 1 / (stretch || 3) ** 0.5);
    p.setTransform(c.getTransform().inverse().multiply(dev));
    return p;
  }
  /**
   * Tooth sizing for a ctx transform and figure scale (units -> ctx px): k = device px per unit,
   * tex = device px per tooth texel. When a tooth pit is smaller than a pixel the grain should average
   * out: `soft` widens the graphite threshold and `erode` (how much lighter the outer edge of a line
   * is) halves, so small renders don't crumble into dots.
   */
  function toothFor(tr, scale) {
    const k = (Math.sqrt(Math.abs(tr.a * tr.d - tr.b * tr.c)) || 1) * (scale || 1);
    const ideal = config.toothScale * k;
    const q = smoothstep(0.5, 2.5, ideal);
    return { k, tex: Math.max(1, ideal), soft: lerp(0.4, 0.12, q), erode: lerp(0.9, 0.78, q) };
  }
  /** a pattern laid in the current user space (moves with whatever is drawn), texel = t units */
  function placeLocal(p, t, angle, stretch) {
    let m = new DOMMatrix([t, 0, 0, t, 0, 0]);
    if (angle !== undefined) m = new DOMMatrix().rotate((angle * 180) / PI).scale(t * (stretch || 3), t / (stretch || 3) ** 0.5);
    p.setTransform(m);
    return p;
  }

  /* --------------------------------------------------------- polyline core */
  /**
   * A pencil "track": centreline arrays plus half-width per sample.
   * pieces are split where the half width vanishes (breaks, taper) or the curve is tighter
   * than the line is wide (so offset outlines never fold back on themselves).
   */
  function resamplePts(pts, step, extra) {
    // pts: [[x,y,(w)],...]. Returns {x,y,w,s,L,src} sampled every ~step along the length.
    const n = pts.length, cum = new Float64Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const L = cum[n - 1], m = Math.max(2, Math.round(L / step) + 1);
    const x = new Float32Array(m), y = new Float32Array(m), w = new Float32Array(m), s = new Float32Array(m), src = new Float32Array(m);
    let j = 0;
    for (let i = 0; i < m; i++) {
      const t = (L * i) / (m - 1);
      while (j < n - 2 && cum[j + 1] < t) j++;
      const seg = cum[j + 1] - cum[j] || 1, f = Math.min(1, Math.max(0, (t - cum[j]) / seg));
      x[i] = lerp(pts[j][0], pts[j + 1][0], f);
      y[i] = lerp(pts[j][1], pts[j + 1][1], f);
      w[i] = lerp(pts[j][2] || extra || 0, pts[j + 1][2] || extra || 0, f);
      s[i] = t;
      src[i] = j + f;
    }
    return { x, y, w, s, L, src };
  }

  function normalsOf(x, y) {
    const n = x.length, nx = new Float32Array(n), ny = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
      let tx = x[b] - x[a], ty = y[b] - y[a];
      const l = Math.hypot(tx, ty) || 1;
      tx /= l; ty /= l;
      nx[i] = -ty; ny[i] = tx;
    }
    return { nx, ny };
  }

  function smoothArr(a, r) {
    if (r <= 0) return a;
    const n = a.length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let acc = 0, wt = 0;
      for (let k = -r; k <= r; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k)), g = 1 - Math.abs(k) / (r + 1);
        acc += a[j] * g; wt += g;
      }
      out[i] = acc / wt;
    }
    return out;
  }

  /** Append the outline of samples [i0..i1] to `path`: left side, round end, right side back, round start. */
  function addRibbon(path, X, Y, NX, NY, H, i0, i1) {
    path.moveTo(X[i0] + NX[i0] * H[i0], Y[i0] + NY[i0] * H[i0]);
    for (let i = i0 + 1; i <= i1; i++) path.lineTo(X[i] + NX[i] * H[i], Y[i] + NY[i] * H[i]);
    const ae = Math.atan2(NY[i1], NX[i1]);
    path.arc(X[i1], Y[i1], Math.max(H[i1], 0.01), ae, ae + PI, true);
    for (let i = i1 - 1; i >= i0; i--) path.lineTo(X[i] - NX[i] * H[i], Y[i] - NY[i] * H[i]);
    const as = Math.atan2(NY[i0], NX[i0]);
    path.arc(X[i0], Y[i0], Math.max(H[i0], 0.01), as + PI, as, true);
    path.closePath();
  }

  /** Split into drawable runs and add them to path. Samples [first..last] (inclusive). */
  function addTrack(path, T, H, last, minH, first) {
    const { x, y, nx, ny } = T;
    const n = last === undefined ? x.length - 1 : last;
    minH = minH || 0.08;
    let i0 = -1;
    for (let i = first || 0; i <= n; i++) {
      const on = H[i] > minH;
      if (on && i0 < 0) i0 = i;
      let cut = !on || i === n;
      // fold guard: turning faster than the half-width allows
      if (on && i0 >= 0 && i > i0 && i < n) {
        const ax = x[i] - x[i - 1], ay = y[i] - y[i - 1], bx = x[i + 1] - x[i], by = y[i + 1] - y[i];
        const la = Math.hypot(ax, ay) || 1, lb = Math.hypot(bx, by) || 1;
        const turn = Math.acos(Math.max(-1, Math.min(1, (ax * bx + ay * by) / (la * lb))));
        if ((turn / (0.5 * (la + lb))) * H[i] > 0.7) cut = true;
      }
      if (cut && i0 >= 0) {
        const i1 = on ? i : i - 1;
        if (i1 >= i0) addRibbon(path, x, y, nx, ny, H, i0, i1);
        i0 = on && i < n ? i : -1;
      }
    }
  }

  /*
   * Graphite is drawn as *pressure*: each stroke adds grey (= pressure) to a black buffer with
   * 'lighten', so overlaps take the max and runs join without seams. The paper tooth is then
   * thresholded against it (see drawGraphite). Each stroke goes in as three nested widths with a
   * little less pressure toward the edge, so the tooth eats the outside of the line first.
   */
  const NEST = [1.0, 0.78, 0.55];   // ring widths; ring 0 (the edge) is drawn lighter by S.erode at render time
  const PQ = 32;   // pressure quantisation
  /** bucket key -> pressure, applying the scale-dependent edge erosion */
  function keyPressure(key, S) {
    const ring = Math.floor(key / 1000), lvl = (key % 1000) / PQ;
    return lvl * (ring === 0 ? S.erode : ring === 1 ? 0.5 + 0.5 * S.erode + 0.06 : 1);
  }
  function addPressure(buckets, T, H, P, last) {
    const n = last === undefined ? T.x.length - 1 : last;
    const Hk = new Float32Array(H.length);
    for (let ring = 0; ring < NEST.length; ring++) {
      const wk = NEST[ring];
      for (let i = 0; i <= n; i++) Hk[i] = H[i] * wk;
      const q = (i) => Math.round(clamp01(P[i]) * PQ);
      let i0 = 0;
      for (let i = 1; i <= n + 1; i++) {
        if (i <= n && q(i) === q(i0)) continue;
        const lvl = q(i0);
        if (lvl > 0) {
          const key = ring * 1000 + lvl;
          let path = buckets.get(key);
          if (!path) buckets.set(key, (path = new Path2D()));
          addTrack(path, T, Hk, Math.min(n, i), 0.08, Math.max(0, i0 - 1));
        }
        i0 = i;
      }
    }
    return buckets;
  }

  /** A truncated copy of a track up to arc length sEnd (for write-on). */
  function truncTrack(T, H, sEnd, P) {
    const s = T.s, n = s.length;
    if (sEnd >= s[n - 1]) return { T, H, P, last: n - 1 };
    let j = 0;
    while (j < n - 2 && s[j + 1] < sEnd) j++;
    const f = clamp01((sEnd - s[j]) / ((s[j + 1] - s[j]) || 1));
    const m = j + 2, cp = (a) => { const o = new Float32Array(m); o.set(a.subarray(0, j + 1)); o[j + 1] = lerp(a[j], a[j + 1], f); return o; };
    const T2 = { x: cp(T.x), y: cp(T.y), nx: cp(T.nx), ny: cp(T.ny), s: cp(T.s) };
    return { T: T2, H: cp(H), P: P ? cp(P) : null, last: m - 1 };
  }

  /** jittered copy of a centreline (boil): wander along the normal + width breathing */
  function jitterTrack(base, rand, amp, period) {
    const nA = noise1(rand, period), nB = noise1(rand, period * 0.37);
    const n = base.x.length, x = new Float32Array(n), y = new Float32Array(n);
    const dx = (rand() - 0.5) * amp * 0.5, dy = (rand() - 0.5) * amp * 0.5;
    for (let i = 0; i < n; i++) {
      const d = amp * (0.8 * nA(base.s[i]) + 0.2 * nB(base.s[i]));
      x[i] = base.x[i] + base.nx[i] * d + dx;
      y[i] = base.y[i] + base.ny[i] * d + dy;
    }
    const nn = normalsOf(x, y);
    return { x, y, nx: nn.nx, ny: nn.ny, s: base.s };
  }

  function taperProfile(s, L, a, b, startMin, endMin) {
    const t0 = a > 0 ? lerp(startMin, 1, smoothstep(0, a, s)) : 1;
    const t1 = b > 0 ? lerp(endMin, 1, smoothstep(0, b, L - s)) : 1;
    return t0 * t1;
  }

  /** Build a simple tapered pencil track from a polyline (construction, edges, hatches, accents). */
  function simpleTrack(pts, width, taper, rand, amp, step) {
    const R = resamplePts(pts, step || 2, width);
    const nn = normalsOf(R.x, R.y);
    const base = { x: R.x, y: R.y, nx: nn.nx, ny: nn.ny, s: R.s };
    const T = rand && amp ? jitterTrack(base, rand, amp, 38) : base;
    const n = R.x.length, H = new Float32Array(n);
    const nw = rand ? noise1(rand, 20) : () => 0;
    const a = taper ? taper[0] : 8, b = taper ? taper[1] : 12;
    for (let i = 0; i < n; i++) H[i] = 0.5 * width * taperProfile(R.s[i], R.L, Math.min(a, R.L * 0.4), Math.min(b, R.L * 0.5), 0.3, 0.1) * (1 + 0.1 * nw(R.s[i]));
    return { T, H, L: R.L };
  }

  /* ---------------------------------------------------------- figure prep */
  function prepare(fig) {
    if (fig._pencil) return fig._pencil;
    const st = fig.style, P = st.palette, data = fig.strokes;
    // Jasper's strokes, then any designed extras (e.g. the box rim, hidden unless opts.show asks)
    const all = data.strokes.concat((st.extraStrokes || []).map((e) => Object.assign({ extra: true }, e)));
    const strokes = all.map((s, idx) => {
      const hint = Object.assign({}, (st.lines && st.lines[s.id]) || {}, s.extra ? s : {});
      const R = resamplePts(s.pts, 1.6);
      const nn = normalsOf(R.x, R.y);
      const n = R.x.length;
      // weight per resampled point (interpolated from the per-source-point weights)
      const wt = new Float32Array(n), W = hint.weight;
      for (let i = 0; i < n; i++) {
        if (!W) { wt[i] = 1; continue; }
        const k = Math.min(W.length - 1, Math.floor(R.src[i])), f = R.src[i] - k;
        wt[i] = lerp(W[k], W[Math.min(W.length - 1, k + 1)], f);
      }
      const w = smoothArr(R.w, 4);
      return {
        id: s.id, idx, group: hint.group || s.group || s.word || 'all', dot: !!(hint.dot || s.dot),
        closed: !!s.closed, base: { x: R.x, y: R.y, nx: nn.nx, ny: nn.ny, s: R.s }, L: R.L, w, wt,
        taper: hint.taper || [9, 13], tip: hint.tip || [0.4, 0.14], land: hint.land || 0,
        breaks: hint.breaks || [], fade: hint.fade || [], level: hint.level || 1,
        widthMul: hint.width || 1, extra: !!s.extra, hidden: !!hint.hidden,
      };
    });
    const byId = {};
    strokes.forEach((s) => (byId[s.id] = s));
    // write-on timing (ms): the pen eases in at each start and through tight turns, runs faster on the
    // straights, eases out at the end; a pen lift costs time in proportion to the travel, plus a beat
    // at a word gap and a longer one at a line break. Dots are quick dabs.
    const speed = st.penSpeed || 900;            // units per second on a straight run
    let T = 0, prev = null;
    const timeline = strokes.map((S) => {
      if (S.extra && S.hidden) return null;
      const src = data.strokes[S.idx] || {}, b = S.base, n = b.x.length;   // designed extras have no word/line
      if (prev) {
        const pb = prev.S.base, m = pb.x.length - 1;
        let lift = 100 + 0.2 * Math.hypot(b.x[0] - pb.x[m], b.y[0] - pb.y[m]);
        if (src.word && prev.src.word && src.word !== prev.src.word) lift += 150;
        if (src.line && prev.src.line && src.line !== prev.src.line) lift += 300;
        T += lift;
      }
      const ct = new Float32Array(n);
      if (S.dot) for (let i = 0; i < n; i++) ct[i] = (70 * i) / Math.max(1, n - 1);
      else {
        const kap = new Float32Array(n);
        for (let i = 1; i < n - 1; i++) {
          const ax = b.x[i] - b.x[i - 1], ay = b.y[i] - b.y[i - 1], bx = b.x[i + 1] - b.x[i], by = b.y[i + 1] - b.y[i];
          const c = (ax * bx + ay * by) / ((Math.hypot(ax, ay) * Math.hypot(bx, by)) || 1);
          kap[i] = Math.acos(Math.max(-1, Math.min(1, c))) / (0.5 * (Math.hypot(ax, ay) + Math.hypot(bx, by)) || 1);
        }
        const ks = smoothArr(kap, 3);
        for (let i = 1; i < n; i++) {
          const sv = b.s[i], ds = sv - b.s[i - 1];
          const v = speed * (0.28 + 0.72 * smoothstep(0, 18, sv)) * (0.6 + 0.4 * smoothstep(0, 10, S.L - sv)) / (1 + 9 * ks[i]);
          ct[i] = ct[i - 1] + (1000 * ds) / Math.max(1, v);
        }
      }
      S.ct = ct;
      S.ms = ct[n - 1];
      const t = [T, T + S.ms];
      T += S.ms;
      prev = { S, src };
      return t;
    });
    const totalMs = T || 1;
    timeline.forEach((t) => { if (t) { t.push(t[0], t[1]); t[0] /= totalMs; t[1] /= totalMs; } });

    const regions = {};
    for (const name of st.regionOrder || Object.keys(st.regions || {})) {
      const r = st.regions[name];
      const polys = r.polys || (r.poly ? [r.poly] : []);
      regions[name] = Object.assign({ name }, r, {
        pieces: polys.map((p, i) => ({ name: name + '#' + i, ring: densify(p, 5) })),
        polysAll: polys, holePaths: r.holes || [],
      });
    }
    const multiply = {};
    for (const k in P) multiply[k] = onPaper(P[k], P.paper);
    const raw = {};
    for (const k in P) raw[k] = hexRgb(P[k]);
    // each group's extent (for squash/stretch about its base)
    const groupBox = {};
    const grow = (g, x, y) => {
      const b = groupBox[g] || (groupBox[g] = [Infinity, Infinity, -Infinity, -Infinity]);
      b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
    };
    for (const S of strokes) for (let i = 0; i < S.base.x.length; i += 4) grow(S.group, S.base.x[i], S.base.y[i]);
    for (const name in regions) for (const q of regions[name].polysAll) for (const p of q) grow(regions[name].group, p[0], p[1]);
    fig._pencil = { strokes, byId, timeline, totalMs, regions, groupBox, colors: { multiply, normal: raw }, nudges: new Map() };
    return fig._pencil;
  }

  function densify(poly, step) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(L / step));
      for (let j = 0; j < k; j++) out.push([lerp(a[0], b[0], j / k), lerp(a[1], b[1], j / k)]);
    }
    // perimeter arc length for noise, outward normals (polygons are clockwise on screen)
    const n = out.length, s = new Float32Array(n), nx = new Float32Array(n), ny = new Float32Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + Math.hypot(out[i][0] - out[i - 1][0], out[i][1] - out[i - 1][1]);
    for (let i = 0; i < n; i++) {
      const p = out[(i - 2 + n) % n], q = out[(i + 2) % n];
      let tx = q[0] - p[0], ty = q[1] - p[1];
      const l = Math.hypot(tx, ty) || 1;
      nx[i] = ty / l; ny[i] = -tx / l;      // outward for clockwise-on-screen polygons
    }
    // local thickness: distance to the far side along the inward normal (caps how far colour can retreat)
    const thick = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const px = out[i][0], py = out[i][1], dx = -nx[i], dy = -ny[i];
      let best = 1e9;
      for (let j = 0; j < n; j++) {
        const a = out[j], b = out[(j + 1) % n];
        if (j === i || (j + 1) % n === i || j === (i - 1 + n) % n) continue;
        const ex = b[0] - a[0], ey = b[1] - a[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - px) * ey - (a[1] - py) * ex) / den;
        const u = ((a[0] - px) * dy - (a[1] - py) * dx) / den;
        if (t > 0.5 && u >= 0 && u <= 1 && t < best) best = t;
      }
      thick[i] = best;
    }
    return { pts: out, s, nx, ny, thick };
  }

  function polyPath(poly, path) {
    path = path || new Path2D();
    path.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
    path.closePath();
    return path;
  }

  /* ----------------------------------------------------- design build + boil */
  /**
   * All geometry is built once per figure from the design seed (the "design build"). A boil seed only
   * picks a small rigid nudge per item (nudgeFor), and the tooth travels with each item. So a fresh seed
   * for every drawing costs next to nothing, and a stroke's grain never re-rolls.
   */
  function designBuild(fig, prep) {
    if (prep.D) return prep.D;
    const st = fig.style, ds = st.designSeed || 1, cfg = config;
    const D = { lines: {}, second: [], cons: [], hatch: [], edges: [], hl: [], accents: {}, colorStrokes: [], passes: {}, marks: [] };
    const centre = (T) => {
      let cx = 0, cy = 0;
      const n = T.x.length;
      for (let i = 0; i < n; i++) { cx += T.x[i]; cy += T.y[i]; }
      return [cx / n, cy / n];
    };
    const track = (pts, width, taper, key, amp, step) => {
      const tr = simpleTrack(pts, width, taper, rng(ds, key), amp, step);
      const path = new Path2D();
      addTrack(path, tr.T, tr.H);
      const [cx, cy] = centre(tr.T);
      return { tr, path, L: tr.L, cx, cy };
    };

    // key lines: one ribbon per stroke whose pressure (density in the tooth) follows the line weight
    for (const S of prep.strokes) {
      const T = S.base, n = T.x.length;
      const H = new Float32Array(n), P = new Float32Array(n);
      const nd = noise1(rng(ds, S.id, 'press'), 16);
      const [ta, tb] = S.taper, [m0, m1] = S.tip;
      for (let i = 0; i < n; i++) {
        const s = T.s[i], u = s / (S.L || 1);
        const tp = S.dot ? 1 : taperProfile(s, S.L, ta, tb, m0, m1);
        let h = 0.5 * S.w[i] * cfg.widthScale * S.widthMul * Math.pow(S.wt[i], 0.7) * tp;
        let p = cfg.baseLevel * S.level * (1 + cfg.weightGain * (S.wt[i] - 1)) * (0.62 + 0.38 * tp) * (1 + 0.05 * nd(s));
        if (S.land) p *= 1 + S.land * (1 - smoothstep(0, 8, s));
        if (S.dot) { h *= lerp(1.06, 0.6, u); p = lerp(0.95, 0.58, u) * S.level; }   // lands heavy, lifts light
        for (const br of S.breaks) {
          const a = br[0] * S.L, b = br[1] * S.L, ramp = br[2] || 7;
          const dd = s < a ? a - s : s > b ? s - b : -1;
          const f = dd < 0 ? 0 : smoothstep(0, ramp, dd);
          h *= f; p *= 0.55 + 0.45 * f;
        }
        for (const [f0, f1, mn] of S.fade) {
          const a = f0 * S.L, b = f1 * S.L;
          if (s > a && s < b) { const k = Math.sin((PI * (s - a)) / (b - a)); h *= 1 - (1 - mn) * k; p *= 1 - 0.5 * (1 - mn) * k; }
        }
        H[i] = h;
        P[i] = Math.min(0.95, Math.max(0, p));
      }
      const [cx, cy] = centre(T);
      D.lines[S.id] = { T, H, P, cx, cy, buckets: addPressure(new Map(), T, H, P) };
    }

    // searching second passes (they boil with their stroke)
    for (const sp of st.second || []) {
      const S = prep.byId[sp.stroke];
      if (!S) continue;
      const L0 = D.lines[sp.stroke];
      const nz = noise1(rng(ds, 'second', sp.seed || 0), 60), nb = noise1(rng(ds, 'second2', sp.stroke, sp.from), 40);
      const a = sp.from * S.L, b = sp.to * S.L, pts = [];
      for (let i = 0; i < L0.T.x.length; i++) {
        const s = L0.T.s[i];
        if (s < a || s > b) continue;
        const u = (s - a) / (b - a);
        const o = sp.offset * (0.3 + 0.7 * Math.pow(Math.sin(PI * Math.min(1, u * 1.15)), 0.7) + 0.35 * nz(s)) + 0.4 * nb(s);
        pts.push([L0.T.x[i] + L0.T.nx[i] * o, L0.T.y[i] + L0.T.ny[i] * o]);
      }
      if (pts.length < 3) continue;
      const wd = 0.5 * (S.w[0] || 6) * cfg.widthScale;
      const tr = simpleTrack(pts, wd, [(b - a) * 0.3, (b - a) * 0.35], null, 0, 2);
      const P = new Float32Array(tr.H.length).fill(sp.level || 0.4);
      D.second.push({ stroke: sp.stroke, from: sp.from, to: sp.to, group: S.group, buckets: addPressure(new Map(), tr.T, tr.H, P) });
    }

    // construction marks (blue col-erase), in the order they were laid down
    for (const [i, c] of (st.construction || []).entries()) {
      D.cons.push(Object.assign({ group: c.group, level: c.level || 0.5, key: 'C' + i },
        track(c.pts, c.width || 2.8, c.taper || [20, 30], 'cons' + i, 0.6, 2.5)));
    }

    // shadow boundaries (red) + highlight boundaries (blue)
    for (const sh of st.shadows || []) {
      for (const [j, e] of (sh.edge || []).entries()) {
        if (e.length < 2) continue;
        D.edges.push(Object.assign({ group: sh.group, color: sh.hatch && sh.hatch.color === 'graphite' ? 'graphite' : 'red', tone: sh.tone, key: 'E' + sh.id + j },
          track(e, 2.5, [10, 14], 'edge' + sh.id + j, 0.45, 2)));
      }
    }
    for (const hl of st.highlights || []) {
      for (const [j, e] of (hl.edge || []).entries()) {
        if (e.length < 2) continue;
        D.hl.push(Object.assign({ group: hl.group, key: 'H' + hl.id + j }, track(e, 2.3, [8, 12], 'hl' + hl.id + j, 0.4, 2)));
      }
    }

    // hatching, in the order the hand laid it (the layout sweeps across each shape)
    for (const sh of st.shadows || []) {
      if (!sh.hatch) continue;
      const lay = hatchLayout(sh, ds);
      const items = [], paths = [new Path2D(), new Path2D()];
      let sx = 0, sy = 0;
      for (const h of lay) {
        const ux = Math.cos(h.ang), uy = -Math.sin(h.ang), px = -uy, py = ux;
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6 - 0.5, b = h.bow * (1 - 4 * t * t);
          pts.push([h.cx + ux * t * h.len + px * b, h.cy + uy * t * h.len + py * b]);
        }
        const tr = simpleTrack(pts, h.width, [h.len * 0.25, h.len * 0.45], null, 0, 1.5);
        addTrack(paths[h.bucket], tr.T, tr.H);
        items.push({ tr, bucket: h.bucket });
        sx += h.cx; sy += h.cy;
      }
      const n = Math.max(1, lay.length);
      D.hatch.push({ id: sh.id, group: sh.group, color: sh.hatch.color || 'red', level: sh.hatch.level || 0.5, paths, items, tone: sh.tone,
        keep: sh.hatch.keep !== undefined ? sh.hatch.keep : sh.hatch.color === 'graphite' && !sh.tone ? 0.25 : 0.4,
        key: 'X' + sh.id, cx: sx / n, cy: sy / n });
    }

    // optional accents (e.g. the greeting's pink underline)
    for (const name in st.accents || {}) {
      D.accents[name] = st.accents[name].map((a, i) => Object.assign({ group: a.group, color: a.color, level: a.level || 0.7, span: a.span || [0, 1], key: 'A' + name + i },
        track(a.pts, a.width || 6, a.taper || [10, 30], 'accent' + name + i, 0.6, 2)));
    }

    // coloured-pencil strokes (ball swirls): pressure runs with grain along the stroke
    for (const cs of st.colorStrokes || []) {
      const pts = cs.pts;
      const tr = simpleTrack(pts.map((q) => [q[0], q[1], q[2]]), 1, [0, 0], null, 0, 1.8);
      const R = resamplePts(pts.map((q) => [q[0], q[1], q[3]]), 1.8);
      const Rw = resamplePts(pts, 1.8);
      const n = tr.T.x.length, H = new Float32Array(n), P = new Float32Array(n);
      let wmax = 0;
      for (let i = 0; i < n; i++) { H[i] = 0.5 * Rw.w[Math.min(i, Rw.w.length - 1)]; P[i] = R.w[Math.min(i, R.w.length - 1)]; wmax = Math.max(wmax, 2 * H[i]); }
      const runs = [];
      let i0 = 0;
      const q = (i) => Math.round(P[i] * 20) / 20;
      for (let i = 1; i <= n; i++) {
        if (i < n && q(i) === q(i0) && i - i0 < 30) continue;
        const path = new Path2D();
        addTrack(path, tr.T, H, Math.min(n - 1, i), 0.08, Math.max(0, i0 - 1));
        const a = Math.max(0, i0 - 1), b = Math.min(n - 1, i);
        runs.push([q(i0), path, Math.atan2(tr.T.y[b] - tr.T.y[a], tr.T.x[b] - tr.T.x[a])]);
        i0 = i;
      }
      const [cx, cy] = centre(tr.T);
      D.colorStrokes.push({ id: cs.id, group: cs.group, color: cs.color, frontOf: cs.frontOf, opacity: cs.opacity, runs, tr, wmax, cx, cy, key: 'S' + cs.id });
    }

    // ground passes (uneven marker strokes) and contact marks
    for (const sh of st.shadows || []) {
      if (!sh.passes) continue;
      D.passes[sh.id] = sh.passes.map((ps, j) => Object.assign({ width: ps.width || 10, key: 'P' + sh.id + j },
        track(ps.pts, ps.width || 10, [(ps.width || 10) * 2, (ps.width || 10) * 3], 'pass' + sh.id + j, 0.8, 2)));
    }
    for (const [i, m] of (st.marks || []).entries()) {
      D.marks.push(Object.assign({ group: m.group, color: m.color || 'graphite', level: m.level || 0.6, key: 'M' + i },
        track(m.pts, m.width || 4, m.taper || [12, 20], 'mark' + i, 0.5, 2)));
    }

    prep.D = D;
    return D;
  }

  /** A boil seed's small rigid nudge for one item, cached per seed (amp in units, rot in radians). */
  function nudgeFor(prep, seed, key, cx, cy, amp, rot) {
    let M = prep.nudges.get(seed);
    if (!M) {
      M = new Map();
      prep.nudges.set(seed, M);
      if (prep.nudges.size > 48) prep.nudges.delete(prep.nudges.keys().next().value);
    }
    let m = M.get(key);
    if (!m) {
      const r = rng(seed, key, 'nudge');
      const a = (r() - 0.5) * 2 * rot;
      m = new DOMMatrix().translate((r() - 0.5) * 2 * amp, (r() - 0.5) * 2 * amp).translate(cx, cy).rotate((a * 180) / PI).translate(-cx, -cy);
      M.set(key, m);
    }
    return m;
  }
  const GENGA_NUDGE = [0.6, 0.002];   // construction, red/blue boundaries, hatching, marks, accents

  /** How far along a sequence of marks laid one after another (with a short lift between each). */
  function seqProgress(lengths, p, gap) {
    const n = lengths.length, out = new Float32Array(n);
    if (p >= 1) return out.fill(1);
    if (p <= 0) return out;
    gap = gap === undefined ? 20 : gap;
    let total = 0;
    for (const L of lengths) total += L + gap;
    let t = p * total;
    for (let i = 0; i < n; i++) {
      out[i] = clamp01(t / (lengths[i] || 1));
      t -= lengths[i] + gap;
    }
    return out;
  }

  /** a mark drawn on to fraction f along its length (whole Path2D when f >= 1) */
  function partialPath(item, f) {
    if (f >= 1) return item.path;
    const t = truncTrack(item.tr.T, item.tr.H, f * item.tr.L);
    const p = new Path2D();
    addTrack(p, t.T, t.H, t.last);
    return p;
  }

  /**
   * Hatch strokes for one shadow shape: a right-handed slant with varied spacing, length and angle.
   * Long runs are broken into overlapping rows, and the hatching thins out toward the light so the
   * shape is "found" on its dark side and left open on its lit side.
   */
  function hatchLayout(sh, ds) {
    if (sh._layout) return sh._layout;
    const r = rng(ds, 'hatchlayout', sh.id), hp = sh.hatch;
    const base = ((hp.angle || config.hatchAngle) * PI) / 180;
    const ux = Math.cos(base), uy = -Math.sin(base), vx = -uy, vy = ux;   // u along stroke, v across
    const lx = -0.6, ly = -0.8;                                           // toward the light
    const fade = hp.fade !== undefined ? hp.fade : 0.55, maxLen = hp.maxLen || 46;
    const out = [];
    let l0 = Infinity, l1 = -Infinity;
    for (const poly of sh.polys) for (const p of poly) { const l = p[0] * lx + p[1] * ly; l0 = Math.min(l0, l); l1 = Math.max(l1, l); }
    const litAt = (x, y) => ((x * lx + y * ly) - l0) / ((l1 - l0) || 1);
    for (const poly of sh.polys) {
      let t0 = Infinity, t1 = -Infinity;
      for (const p of poly) { const t = p[0] * vx + p[1] * vy; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      let t = t0 + hp.spacing * (0.2 + 0.6 * r());
      while (t < t1) {
        const hits = [];
        scanLine(poly, t, ux, uy, vx, vy, hits);
        hits.sort((a, b) => a.u - b.u);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          let a = hits[i].u, b = hits[i + 1].u;
          if (b - a < 4) continue;
          if (hp.full) { a += 0.3 + r() * 1.2; b += (r() - 0.45) * 2.5; }   // line to boundary
          else { a += 1 + r() * 3.5; b += (r() < 0.25 ? 1.5 : -1) * r() * 4.5; }
          const segs = b - a > maxLen ? Math.ceil((b - a) / maxLen) : 1;
          for (let k = 0; k < segs; k++) {
            const sa = lerp(a, b, k / segs) - (k ? 3 + r() * 5 : 0), sb = lerp(a, b, (k + 1) / segs);
            const mid = (sa + sb) / 2, tt = t + (r() - 0.5) * 1.6;
            const cx = ux * mid + vx * tt, cy = uy * mid + vy * tt;
            const lit = clamp01(litAt(cx, cy));
            if (r() < (hp.skip !== undefined ? hp.skip : 0.05) + fade * Math.pow(lit, 1.6)) continue;
            const len = (sb - sa) * (hp.full ? 1 : 1 - 0.45 * lit * r());
            if (len < 3) continue;
            out.push({
              cx, cy, len, ang: base + (r() - 0.5) * 0.2, bow: (r() - 0.3) * 2.2,
              width: (hp.width || 2.3) * (0.75 + 0.45 * r()) * (1 - 0.25 * lit), bucket: r() < 0.25 + 0.5 * lit ? 1 : 0,
            });
          }
        }
        let step = hp.spacing * (0.55 + 0.9 * r());
        if (r() < 0.1) step *= 0.5;
        t += step;
      }
    }
    sh._layout = out;
    return out;
  }

  /* ------------------------------------------------------------- groups */
  /**
   * Group transforms: translate(x, y), then rotate/scale about `pivot`, then squash/stretch `sx`/`sy`
   * about (ox, oy), which defaults to the group's base centre (the middle of the bottom of its extent).
   * Parents compose and alpha multiplies down the chain. `only` (a name or list) renders just those
   * groups and their children.
   */
  function resolveGroups(st, groupsOpt, prep, only) {
    const defs = Object.assign({}, st.groups || {});
    const G = {};
    const onlySet = only ? new Set([].concat(only)) : null;
    const inOnly = (name) => {
      for (let g = name, k = 0; g && k < 16; g = (defs[g] || {}).parent, k++) if (onlySet.has(g)) return true;
      return false;
    };
    const get = (name) => {
      if (G[name]) return G[name];
      const def = defs[name] || {};
      const o = (groupsOpt && groupsOpt[name]) || {};
      const pv = o.pivot || def.pivot || [0, 0];
      let m = new DOMMatrix();
      if (o.x || o.y) m = m.translate(o.x || 0, o.y || 0);
      if (o.rot || (o.scale !== undefined && o.scale !== 1)) {
        m = m.translate(pv[0], pv[1]);
        if (o.rot) m = m.rotate((o.rot * 180) / PI);
        if (o.scale !== undefined) m = m.scale(o.scale, o.scale);
        m = m.translate(-pv[0], -pv[1]);
      }
      if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) {
        const gb = (prep && prep.groupBox[name]) || st.bounds;
        const ox = o.ox !== undefined ? o.ox : (gb[0] + gb[2]) / 2, oy = o.oy !== undefined ? o.oy : gb[3];
        m = m.translate(ox, oy).scale(o.sx !== undefined ? o.sx : 1, o.sy !== undefined ? o.sy : 1).translate(-ox, -oy);
      }
      let alpha = o.alpha !== undefined ? o.alpha : 1;
      let shown = o.visible !== false;          // explicit visibility inherits; the `only` filter doesn't
      if (def.parent) {
        const p = get(def.parent);
        m = p.m.multiply(m);
        alpha *= p.alpha;
        shown = shown && p.shown;
      }
      const visible = shown && (!onlySet || inOnly(name));
      G[name] = { m, alpha, shown, visible: visible && alpha > 0.001 };
      return G[name];
    };
    return get;
  }

  /* ------------------------------------------------------------ colour layer */
  let layerCanvas = null;
  function getLayer(w, h) {
    if (!layerCanvas || layerCanvas.width < w || layerCanvas.height < h) {
      layerCanvas = makeCanvas(Math.max(w, layerCanvas ? layerCanvas.width : 0), Math.max(h, layerCanvas ? layerCanvas.height : 0));
    }
    return layerCanvas;
  }
  const LX = -0.6, LY = -0.8;   // toward the key light

  /**
   * The colourist's edge for a region. By default the marker runs a little *under* the line (so no
   * paper outline traces the shape); now and then it leaves an irregular 0-5 unit gap, spills a little
   * past shadow-side edges, and pulls back from lit edges while the colour is still arriving.
   */
  function colourRing(reg, seed, cov, ds, cseed) {
    const path = new Path2D();
    for (const pc of reg.pieces) ringPath(pc, reg, seed, cov, ds, path, cseed);
    for (const h of reg.holePaths) polyPath(h, path);
    return path;
  }
  /** noise that wraps around a closed loop of length L (no step where the polygon closes) */
  function loopNoise(fn, L) {
    const B = Math.min(60, L * 0.25);
    return (s) => (s < L - B ? fn(s) : lerp(fn(s), fn(s - L), smoothstep(L - B, L, s)));
  }
  function ringPath(pc, reg, seed, cov, ds, path, cseed) {
    const R = pc.ring, n = R.pts.length, Lp = R.s[n - 1] + Math.hypot(R.pts[0][0] - R.pts[n - 1][0], R.pts[0][1] - R.pts[n - 1][1]);
    const r = rng(ds, 'ring', pc.name), rb = rng(seed, 'ring', pc.name);
    const nz = loopNoise(noise1(r, 38), Lp), nb = loopNoise(noise1(rb, 30), Lp), nf = loopNoise(noise1(r, 120), Lp);
    const ng = loopNoise(noise1(r, 55), Lp), ns = loopNoise(noise1(r, 34), Lp);
    const nc = cseed ? loopNoise(noise1(rng(cseed, 'ringc', pc.name), 26), Lp) : null;   // re-coloured by hand
    const base = reg.inset !== undefined ? reg.inset : -1.4;
    const O = reg.outset !== undefined ? reg.outset : 3.2;
    const I1 = 30 * (reg.retreat !== undefined ? reg.retreat : 1);
    const sliverAt = reg.slivers ? 0.32 : 0.5;
    for (let i = 0; i < n; i++) {
      const s = R.s[i];
      const lit = R.nx[i] * LX + R.ny[i] * LY;
      let d = base + 1.0 * nz(s) + 0.5 * nb(s) + (nc ? 0.9 * nc(s) : 0);
      // the occasional gap where the marker didn't quite reach the line
      const gap = reg.inset !== undefined ? 0 : Math.max(0, ng(s) - (lit > 0.2 ? 0.38 : sliverAt)) * 2.2;
      d += gap * (5 + 4 * Math.abs(ns(s)));
      if (lit > 0) d += Math.pow(lit, 1.3) * I1 * (1 - cov) * (0.7 + 0.5 * nf(s));
      else d += lit * O * (0.3 + 1.7 * Math.max(0, nf(s) + 0.2));
      if (d > 0) d = Math.min(d, 0.38 * R.thick[i]);
      const x = R.pts[i][0] - R.nx[i] * d, y = R.pts[i][1] - R.ny[i] * d;
      if (i) path.lineTo(x, y); else path.moveTo(x, y);
    }
    path.closePath();
  }

  function regionPath(reg) {
    if (reg._path) return reg._path;
    const p = new Path2D();
    for (const q of reg.polysAll) polyPath(q, p);
    for (const h of reg.holePaths) polyPath(h, p);
    reg._path = p;
    return p;
  }

  function regionGeom(R) {
    if (R._geom) return R._geom;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of R.polysAll) for (const p of q) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    let rad = 0;
    for (const q of R.polysAll) for (const p of q) rad = Math.max(rad, Math.hypot(p[0] - cx, p[1] - cy));
    let l0 = Infinity, l1 = -Infinity;
    for (const q of R.polysAll) for (const p of q) { const l = p[0] * LX + p[1] * LY; l0 = Math.min(l0, l); l1 = Math.max(l1, l); }
    R._geom = { x0, y0, x1, y1, cx, cy, rad, l0, l1 };
    return R._geom;
  }

  /**
   * Where the colourist stopped on the lit side: a union of broad marker strokes that run head-on
   * into the lit edge (toward the light on a broad region, along a thin strip, radially on the ball
   * and loops) and stop short on a loose curve. Their rounded-chisel ends vary strongly in length;
   * the odd stroke reaches further or stops early, and neighbours overlap a little.
   *   litFade  f: the most-lit fraction f of the region is left bare (box);
   *   crescent t: a bare crescent hugging the lit pole, t of the region's radius thick (ball, loops).
   * Lower colour values pull the front back toward the shadow side; a colorSeed re-rolls the ends
   * subtly. Returns {clip, tips} (Path2Ds: the coloured side, and the overlapping stroke ends where the
   * ink went down twice) or null.
   */
  function litFront(R, ds, seed, cov, cseed) {
    const fade = R.litFade || 0, cres = R.crescent || 0;
    if (!fade && !cres) return null;
    const amt = Math.round((1 - cov) * 40);
    const key = seed + '|' + amt + '|' + (cseed || 0);
    R._fronts = R._fronts || new Map();
    if (R._fronts.has(key)) return R._fronts.get(key);
    const g = regionGeom(R);
    const r = rng(ds, 'front', R.name), rb = rng(seed, 'front', R.name);
    const rc = cseed ? rng(cseed, 'front', R.name) : null;
    const W = Math.max(R.strokeWidth || 16, 0.075 * g.rad);       // a broad nib on a big shape
    const wave = noise1(rng(ds, 'frontwave', R.name), 4 * W);
    const phase = rc ? (rc() - 0.5) * 2.4 * W : 0;
    const clip = new Path2D(), tips = [];
    // one marker stroke from base point (bx, by) along unit d to its end, rounded-chisel tip
    const stroke = (bx, by, dx, dy, len, w, slant, cap) => {
      const nx = -dy, ny = dx, h = w / 2;
      const ex = bx + dx * len, ey = by + dy * len;
      const pts = [[bx - nx * h, by - ny * h], [ex - nx * h + dx * slant * -0.5, ey - ny * h + dy * slant * -0.5]];
      for (let k = 1; k < 8; k++) {   // the cap: half an ellipse, tipped by the chisel slant
        const th = -PI / 2 + (PI * k) / 8, cs = Math.cos(th), sn = Math.sin(th);
        pts.push([ex + dx * (cap * cs + slant * 0.5 * sn) + nx * h * sn, ey + dy * (cap * cs + slant * 0.5 * sn) + ny * h * sn]);
      }
      pts.push([ex + nx * h + dx * slant * 0.5, ey + ny * h + dy * slant * 0.5], [bx + nx * h, by + ny * h]);
      clip.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) clip.lineTo(pts[i][0], pts[i][1]);
      clip.closePath();
      // the end of some strokes: where neighbouring passes overlap, the ink goes down twice
      if (r() < 0.55) {
        const tl = Math.min(len, (1.2 + 1.6 * r()) * w), sx = ex - dx * tl, sy = ey - dy * tl, tp = new Path2D();
        tp.moveTo(sx - nx * h, sy - ny * h);
        for (let i = 1; i < pts.length - 1; i++) tp.lineTo(pts[i][0], pts[i][1]);
        tp.lineTo(sx + nx * h, sy + ny * h);
        tp.closePath();
        tips.push(tp);
      }
    };
    // how far one stroke ends past (+) or short of (-) the envelope: the big variety rides on a slow
    // wave (a loose curve); neighbours stay within about a stroke width of each other, so there are
    // no deep slots or bars; now and then one reaches further or stops early
    const endOffset = (vary, along, w) => {
      const k = r(), c = rc ? (rc() - 0.5) * 0.3 * W : 0;
      const env = 0.95 * vary * wave(along + phase);
      if (k < 0.08) return env + (0.7 + 0.5 * r()) * w + c;      // reaches further
      if (k < 0.13) return env - (0.9 + 0.5 * r()) * w + c;      // stops early: a gap
      return env + (r() + r() - 1) * 0.45 * w + (rb() - 0.5) * 1.5 + c;
    };
    const tipShape = (w) => [(r() - 0.5) * 1.2 * w, w * (0.15 + 0.17 * r())];   // [chisel slant, cap depth]

    if (cres) {
      // the ball and the loops: strokes run radially toward the lit pole
      const d = 0.35 * g.rad, t = cres * g.rad * (1 + 2.6 * (1 - cov));
      const sx = g.cx - LX * d, sy = g.cy - LY * d, rs = g.rad + d - t;
      const vary = Math.max(8, Math.min(1.3 * W, 0.55 * t));
      const pole = Math.atan2(LY, LX);
      const inner = rs * 0.35;
      polyPath(Array.from({ length: 24 }, (_, i) => [sx + inner * 1.1 * Math.cos((i / 24) * 2 * PI), sy + inner * 1.1 * Math.sin((i / 24) * 2 * PI)]), clip);
      let a = pole - PI;
      while (a < pole + PI) {
        const w = W * (0.7 + 0.7 * r());
        const da = (w * 0.78) / rs;                                 // neighbours overlap a little
        const mid = a + da / 2;
        const off = Math.abs(Math.atan2(Math.sin(mid - pole), Math.cos(mid - pole)));
        const near = 1 - smoothstep(PI * 0.42, PI * 0.75, off);       // only the lit side is left unfinished
        const rEnd = lerp(rs + 2.5 * vary + 60, rs + endOffset(vary, mid * rs, w), near);
        const [slant, cap] = tipShape(w);
        const dx = Math.cos(mid), dy = Math.sin(mid);
        stroke(sx + dx * inner, sy + dy * inner, dx, dy, Math.max(4, rEnd - inner - cap), w, slant * near, cap);
        a += da;
      }
    } else {
      // the box: strokes run toward the light on a broad region, along the strip on a thin one
      const depth = (fade + 0.22 * (1 - cov)) * (g.l1 - g.l0);
      const round = Math.min(g.x1 - g.x0, g.y1 - g.y0) / Math.max(g.x1 - g.x0, g.y1 - g.y0);
      const cut = g.l1 - depth * (1 - 0.3 * round);
      const mx = g.cx * -LY + g.cy * LX, span = Math.max(40, g.rad);
      const f = (x, y) => { const a = Math.max(-1.4, Math.min(1.4, (x * -LY + y * LX - mx) / span)); return x * LX + y * LY - cut + 0.45 * round * depth * (1 - a * a); };
      const vary = Math.max(8, Math.min(1.4 * W, 0.45 * depth));
      let ux = LX, uy = LY;
      if (round < 0.35) {   // a thin strip: along its long axis, toward its lit end
        const wide = g.x1 - g.x0 >= g.y1 - g.y0;
        ux = wide ? (LX < 0 ? -1 : 1) : 0; uy = wide ? 0 : (LY < 0 ? -1 : 1);
      }
      const vx = -uy, vy = ux;
      const pad = 30, corners = [[g.x0 - pad, g.y0 - pad], [g.x1 + pad, g.y0 - pad], [g.x1 + pad, g.y1 + pad], [g.x0 - pad, g.y1 + pad]];
      let t0 = Infinity, t1 = -Infinity, u0 = Infinity, u1 = -Infinity;
      for (const [x, y] of corners) { const t = x * vx + y * vy, u = x * ux + y * uy; t0 = Math.min(t0, t); t1 = Math.max(t1, t); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
      for (let t = t0; t < t1; ) {
        const w = W * (0.7 + 0.7 * r());
        const tc = t + w / 2;
        // walk from the shadow side toward the light: the stroke ends where it leaves the coloured side
        let uEnd = null, inside = false;
        for (let u = u0; u <= u1; u += 2) {
          const x = ux * u + vx * tc, y = uy * u + vy * tc;
          if (f(x, y) < 0) inside = true;
          else if (inside) { uEnd = u; break; }
        }
        if (inside && uEnd === null) uEnd = u1 + 40;
        if (uEnd !== null) {
          uEnd += endOffset(vary, tc, w);
          const [slant, cap] = tipShape(w);
          const b0 = u0 - 20, len = Math.max(4, uEnd - b0 - cap);
          stroke(ux * b0 + vx * tc, uy * b0 + vy * tc, ux, uy, len, w, slant, cap);
        }
        t += w * 0.78;                                              // neighbours overlap a little
      }
    }
    const out = { clip, tips };
    R._fronts.set(key, out);
    if (R._fronts.size > 40) R._fronts.delete(R._fronts.keys().next().value);
    return out;
  }

  /** Intersections of the line {p . v = t} with a polygon, as sorted u-coordinates + edge normals. */
  function scanLine(poly, t, ux, uy, vx, vy, out) {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i], b = poly[(i + 1) % poly.length];
      const ta = a[0] * vx + a[1] * vy, tb = b[0] * vx + b[1] * vy;
      if ((ta - t) * (tb - t) < 0) {
        const f = (t - ta) / (tb - ta);
        const X = lerp(a[0], b[0], f), Y = lerp(a[1], b[1], f);
        let ex = b[0] - a[0], ey = b[1] - a[1];
        const l = Math.hypot(ex, ey) || 1;
        out.push({ u: X * ux + Y * uy, nx: ey / l, ny: -ex / l });   // outward for clockwise polygons
      }
    }
    return out;
  }

  /** shade/base ratio, so a kage multiplied over the base reads as the shade, and darkens what's on it */
  function ratioColour(cols, base, shade) {
    const b = cols[base], s = cols[shade];
    return `rgb(${s.map((v, i) => Math.min(255, Math.round((255 * v) / Math.max(1, b[i])))).join(',')})`;
  }

  /* ---------------------------------------------------------- build-up: marker passes */
  let hitCtx = null;
  const inPath = (path, x, y) => (hitCtx || (hitCtx = makeCanvas(1, 1).getContext('2d'))).isPointInPath(path, x, y);
  /** add a polygon wound clockwise on screen, so overlapping pieces of one Path2D union under nonzero */
  function cwPoly(pts, path) {
    let a = 0;
    for (let i = 0, n = pts.length; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; }
    if (a < 0) pts.reverse();
    path.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i][0], pts[i][1]);
    path.closePath();
    return path;
  }

  /**
   * How a colourist fills a shape with a broad chisel marker: passes laid side by side across it, each
   * one long stroke along (ux, uy) with its own width (0.7-1.3x), angle (within ±6°, drifting from pass
   * to pass) and slightly wobbly edges, overlapping its neighbour a little. Passes start on the shadow
   * side (across the light: from the right). fixed: every pass travels along (ux, uy), head-on toward
   * the lit edge where the colourist stops; otherwise they zig-zag. Built once per shape.
   */
  function markerPasses(polys, ux0, uy0, sw, key, ds, fixed) {
    const r = rng(ds, 'passes', key), drift = noise1(rng(ds, 'passdrift', key), 2.6);
    const vx0 = -uy0, vy0 = ux0;
    let t0 = Infinity, t1 = -Infinity, u0 = Infinity, u1 = -Infinity, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of polys) for (const p of q) {
      const t = p[0] * vx0 + p[1] * vy0, u = p[0] * ux0 + p[1] * uy0;
      t0 = Math.min(t0, t); t1 = Math.max(t1, t); u0 = Math.min(u0, u); u1 = Math.max(u1, u);
      x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]);
    }
    // one broad chisel marker (a wider one on a big shape): a small part takes a pass or two
    const W = Math.max(1.35 * sw, Math.min(100, Math.max(55, 0.11 * Math.hypot(x1 - x0, y1 - y0))));
    const um = (u0 + u1) / 2, vl = vx0 * LX + vy0 * LY;
    const sgn = Math.abs(vl) > 0.15 ? (vl > 0 ? 1 : -1) : vx0 > 0 ? -1 : 1;
    const passes = [];
    let w = W * (0.7 + 0.6 * r()), t = sgn > 0 ? t0 + Math.min(0.3 * w, 0.5 * (t1 - t0)) : t1 - Math.min(0.3 * w, 0.5 * (t1 - t0));
    const tilt = ((6 * PI) / 180) * Math.min(1, (t1 - t0) / (4 * W));   // a narrow strip keeps its passes along it
    for (let k = 0; k < 120; k++) {
      const da = tilt * Math.max(-1, Math.min(1, 1.1 * drift(k) + 0.6 * (r() - 0.5)));
      const c = Math.cos(da), s = Math.sin(da);
      const dx = ux0 * c - uy0 * s, dy = ux0 * s + uy0 * c, nx = -dy, ny = dx;
      const tl = (ux0 * um + vx0 * t) * nx + (uy0 * um + vy0 * t) * ny;   // each pass pivots about the shape's middle
      const off = [-0.4 * w, 0, 0.4 * w], lines = [];
      let a = Infinity, b = -Infinity;
      for (const o of off) {
        const hits = [];
        for (const q of polys) scanLine(q, tl + o, dx, dy, nx, ny, hits);
        hits.sort((h1, h2) => h1.u - h2.u);
        const iv = [];
        for (let i = 0; i + 1 < hits.length; i += 2) iv.push([hits[i].u, hits[i + 1].u]);
        if (iv.length) { a = Math.min(a, iv[0][0]); b = Math.max(b, iv[iv.length - 1][1]); }
        lines.push(iv);
      }
      if (a < b) passes.push({ dx, dy, nx, ny, tl, w, a, b, off, lines, lead: sgn, s: fixed || !(passes.length % 2) ? 1 : -1,
        os: 12 + 26 * r(), oe: 12 + 26 * r(), slant: (r() - 0.5) * 0.9 * w, cap: w * (0.16 + 0.14 * r()),
        wob: [noise1(r, 46), noise1(r, 46)], wa: 1.1 + 1.3 * r(),
        // the arm swings a long pass into a slight arc, and the nib drifts a little across it
        bow: (r() - 0.5) * 0.045 * (b - a), drift: noise1(r, 170), da: Math.min(0.1 * w, 2 + 2.5 * r()), um: (a + b) / 2, hl: Math.max(1, (b - a) / 2) });
      const wn = W * (0.7 + 0.6 * r());
      if (sgn > 0 ? t + 0.42 * w >= t1 : t - 0.42 * w <= t0) break;
      t += (sgn * 0.8 * (w + wn)) / 2;
      w = wn;
    }
    return { passes, W, key: null };
  }

  /**
   * Where each pass actually shows: inside the shape and (with a lit front) short of where the
   * colourist stopped. Sets P.vis (stretches along the pass) and P.L (their length, the pass's time).
   */
  function passTiming(PS, front, key) {
    if (PS.key === key) return PS;
    PS.key = key;
    for (const P of PS.passes) {
      const vis = [];
      let run = null;
      for (let u = P.a; u <= P.b + 5; u += 5) {
        let inside = false;
        for (let j = 0; j < 3 && !inside; j++) {
          if (!P.lines[j].some(([p, q]) => u >= p && u <= q)) continue;
          if (!front) { inside = true; break; }
          const v = P.tl + P.off[j];
          inside = inPath(front, P.dx * u + P.nx * v, P.dy * u + P.ny * v);
        }
        if (inside) { if (run && u - run[1] < 25) run[1] = u; else { run = [u, u]; vis.push(run); } }
      }
      P.vis = vis;
      P.L = vis.reduce((acc, [p, q]) => acc + q - p, 0);
    }
    return PS;
  }

  /** the along-pass position of the marker tip at progress f (past the far end when the pass is down) */
  function tipAt(P, f) {
    if (f >= 1 || !P.vis.length) return f >= 1 ? (P.s > 0 ? P.b + P.oe : P.a - P.oe) : P.s > 0 ? P.a - P.os : P.b + P.os;
    let d = f * P.L;
    const n = P.vis.length;
    for (let i = 0; i < n; i++) {
      const [p, q] = P.vis[P.s > 0 ? i : n - 1 - i];
      if (d <= q - p || i === n - 1) return P.s > 0 ? p + Math.min(d, q - p) : q - Math.min(d, q - p);
      d -= q - p;
    }
    return P.a;
  }

  /** one pass from its start to the tip at U: wobbly sides, a rounded-chisel end. ext: [trail, lead] extra width (reveal only) */
  function passPoly(P, U) {
    const s = P.s, Us = s > 0 ? P.a - P.os : P.b + P.os, len = (U - Us) * s;
    if (len <= 1) return null;
    const h = P.w / 2, ld = P.lead, n = Math.max(2, Math.ceil(len / 16));
    const pt = (u, v) => { v += passBend(P, u); return [P.dx * u + P.nx * v, P.dy * u + P.ny * v]; };
    const sl = 0.5 * P.slant * Math.min(1, len / P.w), cap = Math.min(P.cap, 0.5 * len);
    const pts = [];
    for (let i = 0; i <= n; i++) { const u = Us + (U - s * sl - Us) * (i / n); pts.push(pt(u, P.tl + ld * (h + P.wa * P.wob[0](u)))); }
    for (let k = 1; k < 8; k++) {
      const th = -PI / 2 + (PI * k) / 8;
      pts.push(pt(U + s * (cap * Math.cos(th) + sl * Math.sin(th)), P.tl - ld * h * Math.sin(th)));
    }
    for (let i = n; i >= 0; i--) { const u = Us + (U + s * sl - Us) * (i / n); pts.push(pt(u, P.tl - ld * (h + P.wa * P.wob[1](u)))); }
    return pts;
  }
  /** how far a pass's centre strays from its straight axis at u (its arc, and the nib's drift) */
  function passBend(P, u) {
    const x = Math.max(-1, Math.min(1, (u - P.um) / P.hl));
    return P.bow * (1 - x * x) + P.da * P.drift(u);
  }
  function passPath(P, f, path) {
    const pts = passPoly(P, tipAt(P, f));
    return pts ? cwPoly(pts, path || new Path2D()) : path || new Path2D();
  }

  /**
   * The part of a shape the passes have covered so far (prog[k]: each pass's progress), as a Path2D
   * clip: behind the last finished pass, that pass, and the pass in progress up to its tip (widened on
   * the covered side, and on both sides for the last pass, so no sliver is left to pop in later).
   * null once every pass is down.
   */
  function passReveal(PS, prog) {
    const ps = PS.passes;
    let last = -1;
    while (last + 1 < ps.length && prog[last + 1] >= 1) last++;
    if (last === ps.length - 1) return null;
    const path = new Path2D();
    // the band from a pass's (bent) axis out to `off` on one side, between U0 and U1, plus `far` beyond them
    const band = (P, U0, U1, off, far) => {
      const pt = (u, v) => [P.dx * u + P.nx * v, P.dy * u + P.ny * v], n = Math.max(2, Math.ceil(Math.abs(U1 - U0) / 24)), pts = [];
      if (far) pts.push(pt(U0 - far, P.tl + passBend(P, U0)));
      for (let i = 0; i <= n; i++) { const u = U0 + ((U1 - U0) * i) / n; pts.push(pt(u, P.tl + passBend(P, u))); }
      if (far) pts.push(pt(U1 + far, P.tl + passBend(P, U1)), pt(U1 + far, P.tl + off), pt(U0 - far, P.tl + off));
      else pts.push(pt(U1, P.tl + passBend(P, U1) + off), pt(U0, P.tl + passBend(P, U0) + off));
      cwPoly(pts, path);
    };
    if (last >= 0) {   // everything behind the last pass down
      const P = ps[last];
      band(P, P.a - P.os, P.b + P.oe, -P.lead * 8000, 8000);
      passPath(P, 1, path);
      if (last > 0) passPath(ps[last - 1], 1, path);
    }
    const k = last + 1, f = prog[k];
    if (f > 0) {
      const P = ps[k], U = tipAt(P, f), Us = P.s > 0 ? P.a - P.os : P.b + P.os;
      passPath(P, f, path);
      if ((U - Us) * P.s > 1) {
        band(P, Math.min(Us, U), Math.max(Us, U), -P.lead * 1.15 * P.w, 0);
        if (k === ps.length - 1) band(P, Math.min(Us, U), Math.max(Us, U), P.lead * 1.15 * P.w, 0);
      }
    }
    return path;
  }

  /** the passes for a colour region: head-on toward the light where the colourist leaves a lit edge, else at its marker angle */
  function regionPasses(R, ds) {
    if (R._passes) return R._passes;
    const g = regionGeom(R);
    let ux, uy, fixed = false;
    if (R.litFade && !R.crescent) {
      fixed = true; ux = LX; uy = LY;
      if (Math.min(g.x1 - g.x0, g.y1 - g.y0) / Math.max(g.x1 - g.x0, g.y1 - g.y0) < 0.35) {   // a strip: along it, toward its lit end
        const wide = g.x1 - g.x0 >= g.y1 - g.y0;
        ux = wide ? (LX < 0 ? -1 : 1) : 0; uy = wide ? 0 : LY < 0 ? -1 : 1;
      }
    } else {
      const a = ((R.strokeAngle !== undefined ? R.strokeAngle : 64) * PI) / 180;
      ux = Math.cos(a); uy = -Math.sin(a);
    }
    R._passes = markerPasses(R.polysAll, ux, uy, R.strokeWidth || 16, R.name, ds, fixed);
    return R._passes;
  }
  function shadowPasses(sh, ds) {
    if (!sh._passes) {
      const a = sh.tone ? 0 : (64 * PI) / 180;
      sh._passes = passTiming(markerPasses(sh.polys, Math.cos(a), -Math.sin(a), sh.tone ? 18 : 22, 'sh' + sh.id, ds, false), null, 'plain');
    }
    return sh._passes;
  }

  /**
   * Build the colour layer (marker, coloured pencil, kage, ground tone) in device px inside devBox.
   * Build-up: pc < 1 lays the marker in pass by pass (regions in order, each in broad chisel passes
   * from the shadow side, every pass sweeping along its length; where a fresh pass overlaps the last
   * one the ink goes down twice and stays darker for a few passes while it dries; then the swirl
   * strokes along their length). pt < 1 lays the shadow tone the same way (each kage shape, then the
   * ground passes). At pc = pt = 1 nothing of this remains: the layer is the finished one. Returns the
   * layer canvas or null.
   */
  function buildColour(ctx, fig, prep, D, opt) {
    const { st, G, base, seed, c, cols, layers, devBox, S, cseed, pc, pt } = opt;
    const [bx, by, bw, bh] = devBox;
    if (bw <= 0 || bh <= 0) return null;
    const L = getLayer(ctx.canvas.width, ctx.canvas.height), o = L.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalCompositeOperation = 'source-over';
    o.globalAlpha = 1;
    o.clearRect(bx, by, bw, bh);
    const rgb = (k) => `rgb(${cols[k].join(',')})`;
    const aBase = 0.94 * smoothstep(0.06, 0.72, c) * (layers.colour ? 1 : 0);
    const aShade = 0.95 * smoothstep(0.32, 0.92, c) * (layers.shadow ? 1 : 0);
    const cov = smoothstep(0.0, 0.95, c);
    const ds = st.designSeed || 1;
    const rr = rng(seed, 'register');
    const reg = [config.register[0] + (rr() - 0.5) * 1.0, config.register[1] + (rr() - 0.5) * 1.0];
    const xf = (g, k) => base.multiply(G(g).m).translate(reg[0] * (k || 1), reg[1] * (k || 1));
    const shadowsOn = {};
    for (const sh of st.shadows || []) if (!sh.noFill) for (const h of sh.on || []) (shadowsOn[h] = shadowsOn[h] || []).push(sh);
    const rings = {}, fronts = {}, reveal = {};
    let drew = false;

    // how far the colourist has got: each region's passes in turn, then the swirl strokes
    const names = Object.keys(prep.regions), building = pc < 1, plan = [], order = [];
    if (building) {
      const amt = Math.round((1 - cov) * 40);
      for (const name of names) {
        const R = prep.regions[name], FR = R.frontOf ? prep.regions[R.frontOf] || R : R;
        const tf = litFront(FR, ds, 0, cov, 0);   // where the passes stop (the boil-free front: timing only)
        const PS = passTiming(regionPasses(R, ds), tf ? tf.clip : null, amt);
        plan.push({ PS, at: order.length });
        for (const P of PS.passes) order.push(P.L);
      }
    }
    const nPass = order.length;
    for (const cs of D.colorStrokes) order.push(cs.tr.L);
    const cprog = building ? seqProgress(order, pc, 40) : null;
    let laid = 0;   // passes down so far: a fresh overlap dries over the next few
    if (building) for (let i = 0; i < order.length; i++) laid += cprog[i];
    const wetAll = 1 - smoothstep(0.86, 1, pc);
    const progOf = (i) => (building ? cprog.subarray(plan[i].at, plan[i].at + plan[i].PS.passes.length) : null);

    // 1. base marker, one flat pass per region inside the colourist's edge, stopped by the lit front
    if (aBase > 0.003) names.forEach((name, i) => {
      const R = prep.regions[name], gg = G(R.group), prog = progOf(i);
      if (!gg.visible || (prog && prog.length && prog[0] <= 0)) return;
      o.setTransform(xf(R.group));
      const ring = (rings[name] = colourRing(R, seed, cov, ds, cseed));
      const front = (fronts[name] = litFront(R.frontOf ? prep.regions[R.frontOf] || R : R, ds, seed, cov, cseed));
      if (prog && prog.length) reveal[name] = passReveal(plan[i].PS, prog);
      o.save();
      if (front) o.clip(front.clip);
      if (reveal[name]) o.clip(reveal[name]);
      const op = aBase * gg.alpha * (R.opacity !== undefined ? R.opacity : 1);
      o.globalAlpha = op;
      o.fillStyle = rgb(R.color);
      o.fill(ring, 'evenodd');
      o.clip(ring, 'evenodd');
      o.globalCompositeOperation = 'multiply';
      if (front) {   // where the passes' ends overlap, the ink went down twice
        o.globalAlpha = 0.09 * op;
        for (const tp of front.tips) o.fill(tp);
      }
      // a faint darker rim where the ink pooled at the stroke edge
      o.globalAlpha = 0.18 * op;
      o.strokeStyle = rgb(R.color);
      o.lineWidth = 1.8;
      o.stroke(ring);
      // build-up: where a fresh pass laps over the one before, darker until it dries
      if (prog && wetAll > 0) {
        const ps = plan[i].PS.passes;
        for (let k = 1; k < ps.length && prog[k] > 0; k++) {
          const age = laid - (plan[i].at + k + 1), wet = (age < 0 ? 1 : clamp01(1 - age / 3)) * wetAll;
          if (wet < 0.02) continue;
          o.save();
          o.clip(passPath(ps[k], prog[k]));
          o.globalAlpha = 0.34 * wet * op;
          o.fill(passPath(ps[k - 1], 1));
          o.restore();
        }
      }
      o.restore();
      drew = true;
    });

    // 2. coloured-pencil strokes laid over the base (the ball's swirls), along their length
    if (aBase > 0.003) D.colorStrokes.forEach((cs, j) => {
      const gg = G(cs.group), f = building ? cprog[nPass + j] : 1;
      if (!gg.visible || f <= 0) return;
      o.setTransform(xf(cs.group));
      const fr = cs.frontOf && prep.regions[cs.frontOf] ? fronts[cs.frontOf] : null;
      o.save();
      if (fr) o.clip(fr.clip);
      o.globalAlpha = aBase * gg.alpha * (cs.opacity || 1);
      const n = nudgeFor(prep, seed, cs.key, cs.cx, cs.cy, 0.8, 0.002);
      o.transform(n.a, n.b, n.c, n.d, n.e, n.f);
      if (f < 1) {   // only as far as the pencil has gone
        const T = cs.tr.T, cut = f * cs.tr.L;
        let i = 0;
        while (i < T.s.length - 1 && T.s[i] < cut) i++;
        const lim = new Path2D();
        addTrack(lim, T, cs.tr.H.map((h) => h + 3), i);
        o.clip(lim);
      }
      for (const [lvl, path, ang] of cs.runs) {
        o.fillStyle = placeLocal(pattern(cols[cs.color], lvl, 'pencil'), S.tex / S.k, ang, 3);
        o.fill(path);
      }
      o.restore();
      drew = true;
    });

    // 3. kage: the designed shadow shapes, multiplied over the base (so swirls darken too), kept to
    //    where colour has actually landed; laid in shape by shape at build-up
    // tone build-up order: per shadow, its swept shape (kage, or a ground tone without passes), then its passes
    const tItems = [];
    for (const sh of st.shadows || []) {
      const swept = pt < 1 && ((!sh.noFill && (sh.on || []).length) || (sh.tone && !D.passes[sh.id]));
      tItems.push(swept ? shadowPasses(sh, ds).passes.reduce((acc, P) => acc + P.L + 30, 0) : 0);
      if (sh.tone) for (const ps of D.passes[sh.id] || []) tItems.push(ps.L);
    }
    const shReveal = (sh, f) => { const PS = shadowPasses(sh, ds); return passReveal(PS, seqProgress(PS.passes.map((P) => P.L), f, 30)); };
    const tprog = seqProgress(tItems, pt, 30);
    const shIndex = new Map();
    let ti = 0;
    for (const sh of st.shadows || []) { shIndex.set(sh, ti); ti += 1 + (sh.tone ? (D.passes[sh.id] || []).length : 0); }
    if (aShade > 0.003) for (const name of names) {
      const R = prep.regions[name];
      if (!shadowsOn[name] || !rings[name]) continue;
      const gg = G(R.group);
      if (!gg.visible) continue;
      for (const sh of shadowsOn[name]) {
        const sg = G(sh.group), f = tprog[shIndex.get(sh)];
        if (!sg.visible || f <= 0) continue;
        o.save();
        o.setTransform(xf(R.group));
        if (fronts[name]) o.clip(fronts[name].clip);
        if (reveal[name]) o.clip(reveal[name]);
        o.clip(rings[name], 'evenodd');
        o.setTransform(xf(sh.group, 0.6));
        const rv = f < 1 ? shReveal(sh, f) : null;
        if (rv) o.clip(rv);
        o.globalCompositeOperation = 'multiply';
        o.fillStyle = ratioColour(cols, R.color, R.shade);
        o.globalAlpha = aShade * sg.alpha * gg.alpha;
        for (const p of sh._paths || (sh._paths = sh.polys.map((q) => polyPath(q)))) o.fill(p);
        o.restore();
        drew = true;
      }
    }

    // 4. ground contact on the paper: a few uneven marker passes, darkest where they overlap
    for (const sh of st.shadows || []) {
      if (!sh.tone || aShade <= 0.003) continue;
      const sg = G(sh.group);
      if (!sg.visible) continue;
      o.setTransform(xf(sh.group));
      o.save();
      o.globalCompositeOperation = 'multiply';
      o.fillStyle = rgb(sh.tone);
      if (D.passes[sh.id]) {
        o.globalAlpha = aShade * 0.7 * sg.alpha;
        D.passes[sh.id].forEach((ps, j) => {
          const f = tprog[shIndex.get(sh) + 1 + j];
          if (f > 0) o.fill(partialPath(ps, f));
        });
      } else if (tprog[shIndex.get(sh)] > 0) {
        const f = tprog[shIndex.get(sh)];
        const rv = f < 1 ? shReveal(sh, f) : null;
        if (rv) o.clip(rv);
        o.globalAlpha = aShade * 0.85 * sg.alpha;
        for (const p of sh._paths || (sh._paths = sh.polys.map((q) => polyPath(q)))) o.fill(p);
      }
      o.restore();
      drew = true;
    }
    if (!drew) return null;

    // 5. paper left on purpose: the highlights
    o.globalCompositeOperation = 'destination-out';
    o.globalAlpha = 1;
    o.fillStyle = '#000';   // an opaque cutter (the context may still hold last frame's grain pattern)
    for (const hl of st.highlights || []) {
      const gg = G(hl.group);
      if (!gg.visible) continue;
      o.setTransform(xf(hl.group));
      o.fill(hl._path || (hl._path = polyPath(hl.poly)));
    }
    // 6. paper tooth shows through the colour
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.fillStyle = placePattern(pattern([0, 0, 0], 0.075, 'valley'), S, o);
    o.fillRect(bx, by, bw, bh);
    o.globalCompositeOperation = 'source-over';
    return L;
  }

  /** Construction marks (blue col-erase), drawn on in order; onto ctx, or tucked under the colour. */
  function drawConstruction(c2, prep, D, seed, G, base, S, cols, alpha, under, p) {
    const prog = seqProgress(D.cons.map((c) => c.L), p, 24);
    c2.save();
    c2.globalCompositeOperation = under ? 'destination-over' : c2.globalCompositeOperation;
    D.cons.forEach((cm, i) => {
      const gg = G(cm.group);
      if (!gg.visible || prog[i] <= 0) return;
      c2.setTransform(base.multiply(gg.m).multiply(nudgeFor(prep, seed, cm.key, cm.cx, cm.cy, GENGA_NUDGE[0], GENGA_NUDGE[1])));
      c2.globalAlpha = alpha * gg.alpha;
      c2.fillStyle = placePattern(pattern(cols.blue, cm.level, 'pencil'), S, c2);
      c2.fill(partialPath(cm, prog[i]));
    });
    c2.restore();
  }

  /* ---------------------------------------------------------------- render */
  const DEFAULT_LAYERS = { paper: false, knockout: false, construction: true, colour: true, shadow: true, line: true };
  const DEFAULT_COLOR = 0.64;   // Jasper's resting look

  function render(ctx, fig, opts) {
    opts = opts || {};
    const st = fig.style;
    if (opts.crack && st.crack) return renderCrack(ctx, fig, opts);
    if (opts.half && st.crack) return renderHalf(ctx, fig, opts);
    const prep = prepare(fig), D = designBuild(fig, prep);
    const seed = opts.seed !== undefined ? opts.seed : 1;
    const c = clamp01(opts.color !== undefined ? opts.color : DEFAULT_COLOR);
    const layers = Object.assign({}, DEFAULT_LAYERS, opts.layers || {});
    if (opts.layers && opts.layers.color !== undefined) layers.colour = opts.layers.color;
    const blend = opts.blend === 'normal' ? 'source-over' : 'multiply';
    const cols = prep.colors[opts.blend === 'normal' ? 'normal' : 'multiply'];
    // build-up: each layer added by hand in turn (all complete when omitted)
    const bu = opts.build || {};
    const bLine = opts.draw !== undefined ? opts.draw : bu.line !== undefined ? clamp01(bu.line) : undefined;
    const bCons = bu.construct !== undefined ? clamp01(bu.construct) : 1;
    const bCol = bu.color !== undefined ? clamp01(bu.color) : 1;
    const bSh = bu.shadow !== undefined ? clamp01(bu.shadow) : 1;
    const pEdge = clamp01(bSh / 0.4), pHatch = clamp01((bSh - 0.15) / 0.55), pTone = clamp01((bSh - 0.45) / 0.55);

    ctx.save();
    if (opts.x || opts.y) ctx.translate(opts.x || 0, opts.y || 0);
    if (opts.scale) ctx.scale(opts.scale, opts.scale);
    if (opts.reg) {   // a drawing's registration: the sheet sat a hair differently on the pegs
      const r = opts.reg, bb = st.bounds, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      ctx.translate((r.dx || 0) + cx, (r.dy || 0) + cy);
      if (r.rot) ctx.rotate(r.rot);
      ctx.translate(-cx, -cy);
    }
    const G0 = resolveGroups(st, opts.groups, prep, opts.only);
    const rootG = opts.groups && opts.groups.root ? resolveRoot(st, opts.groups.root) : null;
    if (rootG) ctx.transform(rootG.a, rootG.b, rootG.c, rootG.d, rootG.e, rootG.f);
    if (opts.clip) {
      const cp = opts.clip instanceof Path2D ? opts.clip : polyPath(opts.clip);
      ctx.clip(cp, opts.clipRule || 'nonzero');
    }
    const base = ctx.getTransform();
    const S = toothFor(base, 1);
    const rootAlpha = (opts.groups && opts.groups.root && opts.groups.root.alpha !== undefined ? opts.groups.root.alpha : 1) *
      (opts.alpha !== undefined ? opts.alpha : 1);
    const G = (name) => {
      const g = G0(name);
      return rootAlpha === 1 ? g : { m: g.m, alpha: g.alpha * rootAlpha, visible: g.visible && rootAlpha > 0.001 };
    };
    const setG = (g, nudge) => {
      const gg = G(g);
      ctx.setTransform(nudge ? base.multiply(gg.m).multiply(nudge) : base.multiply(gg.m));
      return gg;
    };
    const pat = (col, level) => placePattern(pattern(cols[col], level, 'pencil'), S, ctx);
    const nud = (it) => nudgeFor(prep, seed, it.key, it.cx, it.cy, GENGA_NUDGE[0], GENGA_NUDGE[1]);

    // device-space box of everything we might touch (bounds under every group's transform)
    const devBox = deviceBox(ctx, st, base, G, prep);

    if (layers.paper) {
      ctx.setTransform(base);
      const bb = st.bounds;
      paperFill(ctx, bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], S, st.palette.paper);
    }
    if (layers.knockout) {
      // Fresh paper over whatever is behind: exactly what Pencil.paper lays down (same colour, same tooth,
      // device-anchored), so over bare paper it is invisible. It is rubbed out only as the outline is
      // finished: invisible until build.line 0.75, full at 1 (a ghost of what's behind shows in between).
      const kAmt = typeof bLine === 'number' ? smoothstep(0.75, 1, bLine) : 1;
      if (kAmt > 0.001) for (const oc of st.occluders || []) {
        const gg = setG(oc.group);
        if (!gg.visible) continue;
        ctx.globalAlpha = gg.alpha * kAmt;
        ctx.globalCompositeOperation = 'source-over';
        const p = oc._path || (oc._path = polyPath(oc.poly));
        ctx.fillStyle = st.palette.paper || '#f3eee3';
        ctx.fill(p);
        ctx.fillStyle = placePattern(pattern(PAPER_TOOTH[0], PAPER_TOOTH[1], 'paper'), S, ctx);
        ctx.fill(p);
      }
    }
    ctx.globalCompositeOperation = blend;

    // colour layer first (offscreen), so construction can be tucked under it and fade where it lands
    const consAlpha = 1 - 0.35 * smoothstep(0.3, 1, c);
    let layer = null;
    const colourWanted = (layers.colour && bCol > 0) || (layers.shadow && pTone > 0);
    if (colourWanted && c > 0.003 && (st.regionOrder || []).length + (st.shadows || []).length) {
      layer = buildColour(ctx, fig, prep, D, { st, G, base, seed, c, cols, layers, devBox, S, cseed: opts.colorSeed || 0,
        pc: layers.colour ? bCol : 0, pt: pTone });
    }
    if (layers.construction && bCons > 0) {
      if (layer) drawConstruction(layer.getContext('2d'), prep, D, seed, G, base, S, cols, consAlpha, true, bCons);
      else drawConstruction(ctx, prep, D, seed, G, base, S, cols, consAlpha, false, bCons);
    }
    if (layer) {
      const [bx, by, bw, bh] = devBox;
      ctx.save();
      if (opts.colourClip) {   // e.g. a ball half: the colour stops off-register short of the crack
        ctx.setTransform(base);
        ctx.clip(opts.colourClip instanceof Path2D ? opts.colourClip : polyPath(opts.colourClip));
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = blend;
      ctx.globalAlpha = 1;
      ctx.drawImage(layer, bx, by, bw, bh, bx, by, bw, bh);
      ctx.restore();
    }
    ctx.globalCompositeOperation = blend;

    if (layers.shadow && bSh > 0) {
      // hatching: strokes appear in the order the hand laid them
      const fadeH = smoothstep(0.3, 1, c);
      const nHatch = D.hatch.reduce((a, h) => a + h.items.length, 0);
      let left = pHatch >= 1 ? Infinity : Math.floor(pHatch * nHatch);
      for (const h of D.hatch) {
        if (left <= 0) break;
        const gg = setG(h.group, nud(h));
        const k = Math.min(left, h.items.length);
        left -= h.items.length;
        if (!gg.visible) continue;
        let paths = h.paths;
        if (k < h.items.length) {
          paths = [new Path2D(), new Path2D()];
          for (let i = 0; i < k; i++) addTrack(paths[h.items[i].bucket], h.items[i].tr.T, h.items[i].tr.H);
        }
        ctx.globalAlpha = (1 - (1 - h.keep) * fadeH) * gg.alpha;
        ctx.fillStyle = pat(h.color, h.level);
        ctx.fill(paths[0]);
        ctx.fillStyle = pat(h.color, h.level * 0.78);
        ctx.fill(paths[1]);
      }
      // red shadow boundaries, then blue highlight contours, drawn on one after another
      const bounds = D.edges.concat(D.hl);
      const prog = seqProgress(bounds.map((e) => e.L), pEdge, 24);
      const aE = 1 - 0.35 * smoothstep(0.4, 1, c), aB = 1 - 0.7 * smoothstep(0.2, 0.9, c);
      bounds.forEach((e, i) => {
        if (prog[i] <= 0) return;
        const gg = setG(e.group, nud(e));
        if (!gg.visible) return;
        const blue = i >= D.edges.length;
        ctx.globalAlpha = (blue ? aB : aE) * gg.alpha;   // genga marks yield to the colour
        ctx.fillStyle = blue ? pat('blue', 0.66) : pat(e.color, e.color === 'graphite' ? 0.45 : 0.62);
        ctx.fill(partialPath(e, prog[i]));
      });
      // contact lines and other small shadow-layer pencil marks, with the tone
      const mprog = seqProgress(D.marks.map((m) => m.L), pTone, 10);
      D.marks.forEach((m, i) => {
        if (mprog[i] <= 0) return;
        const gg = setG(m.group, nud(m));
        if (!gg.visible) return;
        ctx.globalAlpha = gg.alpha;
        ctx.fillStyle = pat(m.color, m.level);
        ctx.fill(partialPath(m, mprog[i]));
      });
    }

    if (layers.line) drawLines(ctx, fig, prep, D, opts, { setG, pat, c, G, base, devBox, blend, cols, S, seed, draw: bLine, weight: opts.weight || 1, nud });

    ctx.restore();
  }

  /**
   * The ball's crack (style.crack): opts.crack = {draw, split, spread, lift, tilt, pts, width}.
   *   draw  0..1  writes the crack on across the intact ball;
   *   split 0..1  separates the halves: the ground stays put, each half (see opts.half) swings out about
   *               the contact point, its hollow inner wall opening up along the break as it goes.
   * `pts` swaps in a different crack polyline. Any other render options apply to both halves.
   */
  function renderCrack(ctx, fig, opts) {
    const st = fig.style, ck = opts.crack, base = Object.assign({}, opts);
    delete base.crack;
    const crack = ck.pts || st.crack;
    const split = clamp01(ck.split || 0), draw = ck.draw !== undefined ? clamp01(ck.draw) : 1;
    const fit = (fig.strokes && fig.strokes.fit) || { cx: (st.bounds[0] + st.bounds[2]) / 2, cy: (st.bounds[1] + st.bounds[3]) / 2, r: (st.bounds[3] - st.bounds[1]) / 2 };
    if (split <= 0) {
      render(ctx, fig, base);
      if (draw > 0 && (!base.layers || base.layers.line !== false)) halfLines(ctx, fig, base, crack, 0, draw, null, ck.width);
      return;
    }
    // the ground contact stays put: render it once, unclipped, with the ball hidden
    render(ctx, fig, Object.assign({}, base, { layers: Object.assign({}, base.layers || {}, { construction: false }),
      groups: Object.assign({}, base.groups || {}, { ball: { visible: false }, ground: { alpha: Math.max(0, 1 - split * 1.6) } }) }));
    const spread = ck.spread !== undefined ? ck.spread : 70, lift = ck.lift !== undefined ? ck.lift : 30, tilt = ck.tilt !== undefined ? ck.tilt : 0.22;
    for (const sgn of [-1, 1]) {
      const root = { x: sgn * split * spread, y: -split * lift + split * split * (lift + 10), rot: sgn * split * tilt, pivot: [fit.cx, fit.cy + fit.r] };
      render(ctx, fig, Object.assign({}, base, { half: { side: sgn, wall: smoothstep(0, 0.35, split), pts: crack, width: ck.width },
        groups: Object.assign({}, base.groups || {}, { root, ground: { visible: false } }) }));
    }
  }

  /**
   * One half of the cracked ball, in place (opts.half = -1 left, 1 right, or {side, wall, pts}): clipped
   * to its side of the crack, the colour stopping off-register a little short of it, the hollow inner
   * wall along the break (wall 0..1, default 1: hatched dark violet), and the broken edge on top.
   */
  function renderHalf(ctx, fig, opts) {
    const st = fig.style, h = typeof opts.half === 'object' ? opts.half : { side: opts.half };
    const sgn = h.side < 0 ? -1 : 1, crack = h.pts || st.crack, n = crack.length;
    const wall = h.wall !== undefined ? clamp01(h.wall) : 1;
    const far = sgn < 0 ? st.bounds[0] - 300 : st.bounds[2] + 300, top = crack[0][1], bot = crack[n - 1][1];
    const inset = crack.map(([x, y], i) => [x - sgn * (3 + 2.5 * Math.abs(Math.sin(i * 1.7))), y]);
    const base = Object.assign({}, opts, { half: undefined, clip: crack.concat([[far, bot], [far, top]]), colourClip: inset.concat([[far, bot], [far, top]]) });
    render(ctx, fig, base);
    const gr = opts.groups || {}, ballG = gr.ball;
    if ((ballG && ballG.visible === false) || (opts.only && [].concat(opts.only).indexOf('ball') < 0)) return;
    const rootM = gr.root ? resolveRoot(st, gr.root) : null;
    if (wall > 0) innerWall(ctx, fig, opts, crack, sgn, wall, rootM);
    if (!opts.layers || opts.layers.line !== false) halfLines(ctx, fig, opts, crack, sgn, 1, rootM, h.width);
  }

  /** the half's frame: placement, registration and swing, clipped to the ball */
  function halfFrame(c2, fig, base, rootM) {
    const st = fig.style;
    if (base.x || base.y) c2.translate(base.x || 0, base.y || 0);
    if (base.scale) c2.scale(base.scale, base.scale);
    if (base.reg) {
      const r = base.reg, bb = st.bounds, cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2;
      c2.translate((r.dx || 0) + cx, (r.dy || 0) + cy);
      if (r.rot) c2.rotate(r.rot);
      c2.translate(-cx, -cy);
    }
    if (rootM) c2.transform(rootM.a, rootM.b, rootM.c, rootM.d, rootM.e, rootM.f);
    c2.clip(regionPathOf(fig, 'disc'));
  }
  /** the broken edge (or the crack written across the whole ball, sgn 0), drawn on to f */
  function halfLines(c2, fig, base, crack, sgn, f, rootM, width) {
    c2.save();
    halfFrame(c2, fig, base, rootM);
    const w = (width || 7.5) * Math.sqrt(base.weight || 1);
    line(c2, crack.map(([x, y]) => [x + sgn * 2.5, y]), { width: w, pressure: Math.min(0.97, 0.92 * (base.weight || 1)), seed: base.seed, taper: [6, 6], draw: f, alpha: base.alpha });
    c2.restore();
  }

  /**
   * The inside of the shell, seen along the break: a band following the jagged edge into the half,
   * widest mid-ball and closing at the outline, in dark violet (darker toward the break) with a
   * genga hatch and a light pencil line where it meets the outer surface.
   */
  function innerWall(ctx, fig, opts, crack, sgn, amt, rootM) {
    const st = fig.style, prep = prepare(fig), ds = st.designSeed || 1;
    const fit = (fig.strokes && fig.strokes.fit) || { cy: (st.bounds[1] + st.bounds[3]) / 2, r: (st.bounds[3] - st.bounds[1]) / 2 };
    const layers = Object.assign({}, DEFAULT_LAYERS, opts.layers || {});
    if (opts.layers && opts.layers.color !== undefined) layers.colour = opts.layers.color;
    const c = clamp01(opts.color !== undefined ? opts.color : DEFAULT_COLOR);
    const alpha = (opts.alpha !== undefined ? opts.alpha : 1) * (opts.groups && opts.groups.root && opts.groups.root.alpha !== undefined ? opts.groups.root.alpha : 1);
    const cache = (prep.walls = prep.walls || new Map()), ck = crack.length + '|' + crack[0][0] + '|' + crack[crack.length - 1][0];
    // the band at width `a` (0..1): the crack densified, offset into the half by a width that swells mid-ball
    const bandAt = (a) => {
      const key = sgn + '|' + Math.round(a * 20) + '|' + ck;
      let B = cache.get(key);
      if (B) return B;
      const nz = noise1(rng(ds, 'wall', sgn), 70), Wm = 42 * Math.round(a * 20) / 20, outer = [], inner = [], deep = [];
      for (let i = 0; i < crack.length - 1; i++) {
        const [x0, y0] = crack[i], [x1, y1] = crack[i + 1], m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 8));
        for (let j = 0; j < m; j++) outer.push([lerp(x0, x1, j / m), lerp(y0, y1, j / m)]);
      }
      outer.push(crack[crack.length - 1]);
      for (const [x, y] of outer) {
        const u = clamp01((y - (fit.cy - fit.r)) / (2 * fit.r));
        const w = Wm * Math.pow(Math.sin(PI * u), 0.7) * (0.85 + 0.3 * nz(y));
        inner.push([x + sgn * w, y]);
        deep.push([x + sgn * w * (0.42 + 0.12 * nz(y + 500)), y]);
      }
      const pts = outer.concat(inner.slice().reverse());
      B = { pts, band: polyPath(pts), dark: polyPath(outer.concat(deep.slice().reverse())), inner };
      cache.set(key, B);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return B;
    };
    const Wl = bandAt(amt);
    // hatching, laid once across the full-width band (a narrower band just clips it): a right-handed slant, varied spacing
    const hk = sgn + '|hatch|' + ck;
    let hatch = cache.get(hk);
    if (!hatch) {
      const full = bandAt(1).pts, r = rng(ds, 'wallhatch', sgn), ang = (config.hatchAngle * PI) / 180;
      const ux = Math.cos(ang), uy = -Math.sin(ang), vx = -uy, vy = ux;
      let t0 = Infinity, t1 = -Infinity;
      for (const p of full) { const t = p[0] * vx + p[1] * vy; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      hatch = new Path2D();
      for (let t = t0 + 2; t < t1; t += 5.5 + 3 * r()) {
        const hits = scanLine(full, t, ux, uy, vx, vy, []).sort((p, q) => p.u - q.u);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          const ua = hits[i].u - 2, ub = hits[i + 1].u + 2;
          if (ub - ua < 5) continue;
          const pts = [];
          for (let k = 0; k <= 3; k++) { const uu = lerp(ua, ub, k / 3); pts.push([ux * uu + vx * t, uy * uu + vy * t]); }
          const tr = simpleTrack(pts, 2.3, [3, 3], r, 0.5, 1.8);
          addTrack(hatch, tr.T, tr.H);
        }
      }
      cache.set(hk, hatch);
    }
    ctx.save();
    halfFrame(ctx, fig, opts, rootM);
    const tr = ctx.getTransform(), S = toothFor(tr, 1), cols = prep.colors.multiply;
    // colour: two flat tones of violet, with the paper's tooth showing through like the rest of the marker
    const aCol = 0.94 * smoothstep(0.06, 0.72, c) * (layers.colour ? 1 : 0) * alpha;
    if (aCol > 0.003) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of Wl.pts) { const q = tr.transformPoint(new DOMPoint(p[0], p[1])); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const bx = Math.max(0, Math.floor(x0 - 4)), by = Math.max(0, Math.floor(y0 - 4)), bw = Math.min(W, Math.ceil(x1 + 4)) - bx, bh = Math.min(H, Math.ceil(y1 + 4)) - by;
      if (bw > 0 && bh > 0) {
        const L = getLayer(W, H), o = L.getContext('2d');
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.globalCompositeOperation = 'source-over';
        o.globalAlpha = 1;
        o.clearRect(bx, by, bw, bh);
        o.setTransform(tr.translate(config.register[0] * 0.5, config.register[1] * 0.5));
        o.fillStyle = `rgb(${cols.violetShade.join(',')})`;
        o.fill(Wl.band);
        o.globalCompositeOperation = 'multiply';
        o.globalAlpha = 0.75;
        o.fillStyle = `rgb(${cols.hole.join(',')})`;
        o.fill(Wl.dark);
        o.globalCompositeOperation = 'destination-out';
        o.globalAlpha = 1;
        o.setTransform(1, 0, 0, 1, 0, 0);
        o.fillStyle = placePattern(pattern([0, 0, 0], 0.075, 'valley'), S, o);
        o.fillRect(bx, by, bw, bh);
        o.globalCompositeOperation = 'source-over';
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = opts.blend === 'normal' ? 'source-over' : 'multiply';
        ctx.globalAlpha = aCol;
        ctx.drawImage(L, bx, by, bw, bh, bx, by, bw, bh);
        ctx.restore();
      }
    }
    // the genga hatch, inside the band; then a light line where the wall meets the outer surface
    if (layers.shadow) {
      ctx.save();
      ctx.clip(Wl.band);
      ctx.globalCompositeOperation = opts.blend === 'normal' ? 'source-over' : 'multiply';
      ctx.globalAlpha = 0.85 * alpha;
      ctx.fillStyle = placePattern(pattern(cols.graphite, 0.6, 'pencil'), S, ctx);
      ctx.fill(hatch);
      ctx.restore();
    }
    if (layers.line) line(ctx, Wl.inner, { width: 3.2 * Math.sqrt(opts.weight || 1), pressure: 0.5, seed: opts.seed, taper: [24, 24], alpha: 0.9 * alpha });
    ctx.restore();
  }

  function resolveRoot(st, o) {
    const pv = o.pivot || (st.groups && st.groups.root && st.groups.root.pivot) || [
      (st.bounds[0] + st.bounds[2]) / 2, (st.bounds[1] + st.bounds[3]) / 2];
    let m = new DOMMatrix();
    if (o.x || o.y) m = m.translate(o.x || 0, o.y || 0);
    m = m.translate(pv[0], pv[1]);
    if (o.rot) m = m.rotate((o.rot * 180) / PI);
    if (o.scale !== undefined) m = m.scale(o.scale, o.scale);
    m = m.translate(-pv[0], -pv[1]);
    if ((o.sx !== undefined && o.sx !== 1) || (o.sy !== undefined && o.sy !== 1)) {   // squash/stretch about the base
      const bb = st.bounds, ox = o.ox !== undefined ? o.ox : (bb[0] + bb[2]) / 2, oy = o.oy !== undefined ? o.oy : bb[3];
      m = m.translate(ox, oy).scale(o.sx !== undefined ? o.sx : 1, o.sy !== undefined ? o.sy : 1).translate(-ox, -oy);
    }
    return m;
  }

  function deviceBox(ctx, st, base, G, prep) {
    const bb = st.bounds, pad = 40;
    const corners = [[bb[0] - pad, bb[1] - pad], [bb[2] + pad, bb[1] - pad], [bb[2] + pad, bb[3] + pad], [bb[0] - pad, bb[3] + pad]];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const names = new Set(Object.keys(st.groups || {}));
    names.add('all');
    for (const g of names) {
      const m = base.multiply(G(g).m);
      for (const [x, y] of corners) {
        const p = m.transformPoint(new DOMPoint(x, y));
        x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
      }
    }
    const W = ctx.canvas.width, H = ctx.canvas.height;
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(W, Math.ceil(x1)); y1 = Math.min(H, Math.ceil(y1));
    return [x0, y0, x1 - x0, y1 - y0];
  }

  /** per-stroke write-on progress from opts.draw */
  function progressOf(prep, draw) {
    const n = prep.strokes.length, out = new Float32Array(n).fill(1);
    if (draw === undefined || draw === null) return out;
    if (typeof draw === 'number') {
      for (let i = 0; i < n; i++) {
        if (!prep.timeline[i]) continue;
        const [a, b] = prep.timeline[i], S = prep.strokes[i];
        const e = draw >= 1 ? 1 : clamp01((draw - a) / ((b - a) || 1e-6));
        if (e <= 0 || e >= 1) { out[i] = e; continue; }
        // elapsed time -> distance along the stroke (the pen's speed varies)
        const target = e * S.ms, ct = S.ct;
        let j = 1;
        while (j < ct.length - 1 && ct[j] < target) j++;
        const f = clamp01((target - ct[j - 1]) / ((ct[j] - ct[j - 1]) || 1));
        out[i] = lerp(S.base.s[j - 1], S.base.s[j], f) / (S.L || 1);
      }
    } else if (typeof draw === 'function') {
      prep.strokes.forEach((s, i) => (out[i] = clamp01(draw(s.id, i))));
    } else if (Array.isArray(draw)) {
      for (let i = 0; i < n; i++) out[i] = clamp01(draw[i] !== undefined ? draw[i] : 1);
    } else {
      prep.strokes.forEach((s, i) => (out[i] = clamp01(draw[s.id] !== undefined ? draw[s.id] : 1)));
    }
    return out;
  }

  function drawLines(ctx, fig, prep, D, opts, h) {
    const prog = progressOf(prep, h.draw);
    const { setG, pat, seed, nud } = h;
    const show = opts.show || [];
    const items = [];
    const lineNudge = (S, Lr) => nudgeFor(prep, seed, 'L' + S.id, Lr.cx, Lr.cy, S.dot ? config.boil.amp * 0.4 : config.boil.amp,
      config.boil.rot * (S.L > 300 ? 300 / S.L : 1));
    for (const S of prep.strokes) {
      const p = prog[S.idx];
      if (p <= 0 || (S.hidden && show.indexOf(S.id) < 0)) continue;
      const Lr = D.lines[S.id];
      let buckets = Lr.buckets;
      if (p < 1) {   // mid write-on: a blunt pencil tip, the end taper only arrives when the stroke ends
        const t = truncTrack(Lr.T, Lr.H, p * S.L, Lr.P);
        buckets = addPressure(new Map(), t.T, t.H, t.P, t.last);
      }
      items.push([S.group, buckets, lineNudge(S, Lr)]);
    }
    for (const sp of D.second) {
      const S = prep.byId[sp.stroke];
      if (prog[S.idx] >= sp.to) items.push([sp.group, sp.buckets, lineNudge(S, D.lines[sp.stroke])]);
    }
    drawGraphite(ctx, items, h);

    const acc = opts.accent || null;
    if (acc && D.accents[acc]) {
      // by default the accent waits for the write-on to finish; pass accentAmount to animate it
      const done = h.draw === undefined || h.draw === null || h.draw >= 1;
      const a = typeof opts.accentAmount === 'number' ? clamp01(opts.accentAmount) : done ? 1 : 0;
      if (a <= 0) return;
      for (const ac of D.accents[acc]) {
        const gg = setG(ac.group, nud(ac));
        if (!gg.visible) continue;
        const pa = clamp01((a - ac.span[0]) / ((ac.span[1] - ac.span[0]) || 1));   // passes go down in turn
        if (pa <= 0) continue;
        let path = ac.path;
        if (pa < 1) {
          const t1 = truncTrack(ac.tr.T, ac.tr.H, pa * ac.tr.L);
          path = new Path2D();
          addTrack(path, t1.T, t1.H, t1.last);
        }
        ctx.globalAlpha = gg.alpha;
        ctx.fillStyle = pat(ac.color, ac.level);
        ctx.fill(path);
      }
    }
  }

  /**
   * Turn pressure buckets into graphite on paper. In a scratch buffer (device px):
   *   black, then each stroke's coverage of the tooth as grey, 'lighten' (max: overlaps and runs join
   *   without seams). The tooth is laid in the stroke's own frame, so it travels with the boil nudge;
   *   invert, 'screen' with graphite  ->  1 - coverage * (1 - graphite);
   * then multiply onto the canvas. Heavy lines are denser, not blacker; the lighter edge ring lets the
   * tooth eat the outside of every line.
   * items: [[group, Map(key -> Path2D), rigid DOMMatrix?], ...]
   */
  let lineCanvas = null;
  function drawGraphite(ctx, items, env) {
    const { G, base, devBox, blend, cols, S, setG } = env;
    if (!items.length) return;
    if (blend !== 'multiply') {   // transparent canvas: plain tooth patterns, one per pressure level
      for (const [g, buckets, rigid] of items) {
        const gg = setG(g, rigid);
        if (!gg.visible) continue;
        ctx.globalAlpha = gg.alpha;
        for (const [key, path] of buckets) { ctx.fillStyle = env.pat('graphite', keyPressure(key, S)); ctx.fill(path); }
      }
      return;
    }
    const [bx, by, bw, bh] = devBox;
    if (bw <= 0 || bh <= 0) return;
    const W = ctx.canvas.width, Hh = ctx.canvas.height;
    if (!lineCanvas || lineCanvas.width < W || lineCanvas.height < Hh) {
      lineCanvas = makeCanvas(Math.max(W, lineCanvas ? lineCanvas.width : 0), Math.max(Hh, lineCanvas ? lineCanvas.height : 0));
    }
    const o = lineCanvas.getContext('2d');
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'source-over';
    o.fillStyle = '#000';
    o.fillRect(bx, by, bw, bh);
    o.globalCompositeOperation = 'lighten';
    const tUnits = S.tex / (S.k || 1), wt = env.weight || 1;
    // weight > 1 (an impact frame): every line pressed harder and a little wider
    const pw = Math.pow(wt, 0.6), grow = wt > 1 ? (wt - 1) * 5 : 0;
    o.lineJoin = 'round';
    o.lineCap = 'round';
    for (const [g, buckets, rigid] of items) {
      const gg = G(g);
      if (!gg.visible) continue;
      let m = base.multiply(gg.m);
      if (rigid) m = m.multiply(rigid);
      o.setTransform(m);
      o.globalAlpha = gg.alpha;
      for (const [key, path] of buckets) {
        const pt = placeLocal(pattern([0, 0, 0], Math.min(0.97, keyPressure(key, S) * pw), 'cov', S.soft), tUnits);
        o.fillStyle = pt;
        o.fill(path);
        if (grow && Math.floor(key / 1000) === 0) { o.strokeStyle = pt; o.lineWidth = grow; o.stroke(path); }
      }
    }
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.globalAlpha = 1;
    o.globalCompositeOperation = 'difference';
    o.fillStyle = '#fff';
    o.fillRect(bx, by, bw, bh);
    o.globalCompositeOperation = 'screen';
    o.fillStyle = `rgb(${cols.graphite.join(',')})`;
    o.fillRect(bx, by, bw, bh);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 1;
    ctx.drawImage(lineCanvas, bx, by, bw, bh, bx, by, bw, bh);
    ctx.restore();
  }

  /* ------------------------------------------------------------- paper */
  const PAPER_TOOTH = [[120, 104, 86], 0.025];   // the paper's own faint tooth (shared by Pencil.paper and knockout)
  function paperFill(ctx, x, y, w, h, S, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = color || '#f3eee3';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = placePattern(pattern(PAPER_TOOTH[0], PAPER_TOOTH[1], 'paper'), S, ctx);
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  /**
   * Fill a rectangle with paper. Coordinates are in the ctx's current space; `scale` (ctx px per
   * figure unit) keeps the grain the same size as on figures rendered at that scale.
   */
  function paper(ctx, x, y, w, h, opts) {
    opts = opts || {};
    paperFill(ctx, x, y, w, h, toothFor(ctx.getTransform(), opts.scale), opts.color);
  }

  /**
   * Draw an ad-hoc line in figure units with the same hand: a crack edge, a rim, a drawn crack stroke.
   * Graphite (the default) goes through the same pressure/tooth pipeline as the key line; any other
   * `color` is drawn as coloured pencil. opts: {width, pressure, color, level, seed, taper, tip, draw,
   * x, y, scale, alpha, blend, paper}
   */
  function line(ctx, pts, opts) {
    opts = opts || {};
    const seed = opts.seed !== undefined ? opts.seed : 1;
    const tr = simpleTrack(pts, opts.width || 6, opts.taper || [8, 12], rng(seed, 'adhoc', pts.length, pts[0][0]), config.boil.amp * 0.8, 1.8);
    const cut = opts.draw !== undefined && opts.draw < 1 ? truncTrack(tr.T, tr.H, opts.draw * tr.L) : { T: tr.T, H: tr.H, last: tr.H.length - 1 };
    ctx.save();
    if (opts.x || opts.y) ctx.translate(opts.x || 0, opts.y || 0);
    if (opts.scale) ctx.scale(opts.scale, opts.scale);
    const base = ctx.getTransform(), S = toothFor(base, 1);
    const paperHex = opts.paper || '#f3eee3', normal = opts.blend === 'normal';
    const hex = opts.color || '#3a3532';
    const rgb = normal ? hexRgb(hex) : onPaper(hex, paperHex);
    const alpha = opts.alpha !== undefined ? opts.alpha : 1;
    if (!opts.color && !normal) {
      const P = new Float32Array(cut.H.length).fill(opts.pressure || opts.level || config.baseLevel);
      const buckets = addPressure(new Map(), cut.T, cut.H, P, cut.last);
      // device box of the line
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i < cut.T.x.length; i++) {
        const q = base.transformPoint(new DOMPoint(cut.T.x[i], cut.T.y[i]));
        x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y);
      }
      const pad = 40 * Math.sqrt(Math.abs(base.a * base.d - base.b * base.c)) + 4;
      const W = ctx.canvas.width, H = ctx.canvas.height;
      const bx = Math.max(0, Math.floor(x0 - pad)), by = Math.max(0, Math.floor(y0 - pad));
      const box = [bx, by, Math.min(W, Math.ceil(x1 + pad)) - bx, Math.min(H, Math.ceil(y1 + pad)) - by];
      const G = () => ({ m: new DOMMatrix(), alpha, visible: true });
      drawGraphite(ctx, [['all', buckets, null]], { G, base, devBox: box, blend: 'multiply', cols: { graphite: rgb }, S });
    } else {
      const path = new Path2D();
      addTrack(path, cut.T, cut.H, cut.last);
      ctx.globalCompositeOperation = normal ? 'source-over' : 'multiply';
      ctx.globalAlpha = alpha;
      ctx.fillStyle = placePattern(pattern(rgb, opts.level || config.baseLevel, 'pencil'), S, ctx);
      ctx.fill(path);
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- helpers */
  /** {scale, x, y} that fits the figure's bounds into a w x h box with padding. */
  function fit(fig, w, h, pad) {
    pad = pad === undefined ? 0.04 : pad;
    const b = fig.style.bounds, bw = b[2] - b[0], bh = b[3] - b[1];
    const scale = Math.min(w / (bw * (1 + 2 * pad)), h / (bh * (1 + 2 * pad)));
    return { scale, x: (w - bw * scale) / 2 - b[0] * scale, y: (h - bh * scale) / 2 - b[1] * scale };
  }

  /** Path2D of a fill region (figure units). For the ball, 'disc' is the whole outline (for halves). */
  function regionPathOf(fig, name) {
    const st = fig.style;
    if (name === 'disc' && st.disc) {
      const s = fig.strokes.strokes.find((q) => q.id === st.disc.region);
      return polyPath(s.pts);
    }
    const r = st.regions[name];
    if (!r) return null;
    const p = new Path2D();
    for (const q of r.polys || [r.poly]) polyPath(q, p);
    for (const h of r.holes || []) polyPath(h, p);
    return p;
  }

  /**
   * The write-on timeline: [{id, start, end, startMs, endMs, length}]. start/end are in `draw` units
   * (0..1); startMs/endMs at natural pen speed. Play `draw: t / Pencil.writeDuration(fig)` for real time.
   */
  function timeline(fig) {
    const prep = prepare(fig);
    return prep.strokes.filter((s) => prep.timeline[s.idx]).map((s) => {
      const t = prep.timeline[s.idx];
      return { id: s.id, start: t[0], end: t[1], startMs: t[2], endMs: t[3], length: s.L };
    });
  }
  /** Total write-on time at natural pen speed (ms). */
  function writeDuration(fig) { return prepare(fig).totalMs; }

  /**
   * Warm a figure's caches for drawing at `scale` (device px per figure unit) so the first frames are
   * cheap: the design build, the tooth coverage patterns at that size, and one render per seed into a
   * small offscreen canvas. Call it per figure during the sketch-in (e.g. in idle callbacks).
   * opts: {scale = 1.5, color, seeds = [1]}
   */
  function warm(fig, opts) {
    opts = opts || {};
    const prep = prepare(fig);
    designBuild(fig, prep);
    const k = opts.scale || 1.5;
    const S = toothFor(new DOMMatrix([k, 0, 0, k, 0, 0]), 1);
    for (let i = 0; i <= 40; i++) pattern([0, 0, 0], i / 40, 'cov', S.soft);
    const b = fig.style.bounds, sc = Math.min(k, 1024 / Math.max(b[2] - b[0], b[3] - b[1]));
    const cv = makeCanvas(Math.ceil((b[2] - b[0]) * sc) + 2, Math.ceil((b[3] - b[1]) * sc) + 2), c2 = cv.getContext('2d');
    for (const seed of opts.seeds || [1]) render(c2, fig, { scale: sc, x: -b[0] * sc, y: -b[1] * sc, seed, color: opts.color });
  }

  /** Seed for a boil at `fps` cycling through `seeds`, from a time in ms. */
  function boilSeed(ms, seeds, fps) {
    seeds = seeds || [1, 2, 3];
    return seeds[Math.floor((ms / 1000) * (fps || 8)) % seeds.length];
  }

  root.Pencil = { render, paper, line, fit, regionPath: regionPathOf, timeline, writeDuration, boilSeed, warm, config, DEFAULT_COLOR, _prepare: prepare };
})(typeof window !== 'undefined' ? window : globalThis);
