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
      if (S.extra) return null;
      const src = data.strokes[S.idx], b = S.base, n = b.x.length;
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
    fig._pencil = { strokes, byId, timeline, totalMs, regions, colors: { multiply, normal: raw }, seeds: new Map() };
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

  /* -------------------------------------------------- per-seed construction */
  function seedBuild(fig, prep, seed) {
    let B = prep.seeds.get(seed);
    if (B) return B;
    const st = fig.style, ds = st.designSeed || 1, cfg = config;
    B = { lines: {}, second: [], cons: [], hatch: [], edges: [], hl: [], accents: {}, colorStrokes: [], passes: {}, marks: [] };

    // key lines: one ribbon per stroke whose pressure (density in the tooth) follows the line weight.
    // Boil is a small rigid nudge of each whole stroke (plus breathing width) and the tooth travels
    // with it, so a stroke's grain is identical on every boil frame and only the geometry moves.
    for (const S of prep.strokes) {
      const r = rng(seed, S.id, 'line');
      const T = S.base, n = T.x.length;
      let cx = 0, cy = 0;
      for (let i = 0; i < n; i++) { cx += T.x[i]; cy += T.y[i]; }
      cx /= n; cy /= n;
      const amp = S.dot ? cfg.boil.amp * 0.4 : cfg.boil.amp;
      const rot = (r() - 0.5) * 2 * cfg.boil.rot * (S.L > 300 ? 300 / S.L : 1);
      const rigid = new DOMMatrix().translate((r() - 0.5) * 2 * amp, (r() - 0.5) * 2 * amp)
        .translate(cx, cy).rotate((rot * 180) / PI).translate(-cx, -cy);
      const H = new Float32Array(n), P = new Float32Array(n);
      const nw = noise1(r, 22), nd = noise1(rng(ds, S.id, 'press'), 16);
      const [ta, tb] = S.taper, [m0, m1] = S.tip;
      for (let i = 0; i < n; i++) {
        const s = T.s[i], u = s / (S.L || 1);
        const tp = S.dot ? 1 : taperProfile(s, S.L, ta, tb, m0, m1);
        let h = 0.5 * S.w[i] * cfg.widthScale * S.widthMul * Math.pow(S.wt[i], 0.7) * (1 + cfg.boil.width * nw(s)) * tp;
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
      B.lines[S.id] = { T, H, P, rigid, buckets: addPressure(new Map(), T, H, P) };
    }

    // searching second passes
    for (const sp of st.second || []) {
      const S = prep.byId[sp.stroke];
      if (!S) continue;
      const L0 = B.lines[sp.stroke];
      const r = rng(seed, 'second', sp.stroke, sp.from);
      const nz = noise1(rng(ds, 'second', sp.seed || 0), 60), nb = noise1(r, 40);
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
      B.second.push({ stroke: sp.stroke, from: sp.from, to: sp.to, group: S.group, rigid: L0.rigid, buckets: addPressure(new Map(), tr.T, tr.H, P) });
    }

    // construction marks (blue col-erase)
    for (const [i, c] of (st.construction || []).entries()) {
      const tr = simpleTrack(c.pts, c.width || 2.8, c.taper || [20, 30], rng(seed, 'cons', i), 0.6, 2.5);
      const path = new Path2D();
      addTrack(path, tr.T, tr.H);
      B.cons.push({ group: c.group, level: c.level || 0.5, path });
    }

    // shadow boundaries (red) + highlight boundaries (blue)
    for (const sh of st.shadows || []) {
      for (const [j, e] of (sh.edge || []).entries()) {
        if (e.length < 2) continue;
        const tr = simpleTrack(e, 2.5, [10, 14], rng(seed, 'edge', sh.id, j), 0.45, 2);
        const path = new Path2D();
        addTrack(path, tr.T, tr.H);
        B.edges.push({ group: sh.group, color: sh.hatch && sh.hatch.color === 'graphite' ? 'graphite' : 'red', path, tone: sh.tone });
      }
    }
    for (const hl of st.highlights || []) {
      for (const [j, e] of (hl.edge || []).entries()) {
        if (e.length < 2) continue;
        const tr = simpleTrack(e, 2.3, [8, 12], rng(seed, 'hl', hl.id, j), 0.4, 2);
        const path = new Path2D();
        addTrack(path, tr.T, tr.H);
        B.hl.push({ group: hl.group, path });
      }
    }

    // hatching: layout from the design seed, jitter from the boil seed
    for (const sh of st.shadows || []) {
      if (!sh.hatch) continue;
      const lay = hatchLayout(sh, ds);
      const r = rng(seed, 'hatch', sh.id);
      const paths = [new Path2D(), new Path2D()];
      for (const h of lay) {
        const ang = h.ang + (r() - 0.5) * 0.012, cx = h.cx + (r() - 0.5) * 0.8, cy = h.cy + (r() - 0.5) * 0.8;
        const len = h.len + (r() - 0.5) * 2.2, bow = h.bow + (r() - 0.5) * 0.6;
        const ux = Math.cos(ang), uy = -Math.sin(ang), px = -uy, py = ux;
        const pts = [];
        for (let k = 0; k <= 6; k++) {
          const t = k / 6 - 0.5, b = bow * (1 - 4 * t * t);
          pts.push([cx + ux * t * len + px * b, cy + uy * t * len + py * b]);
        }
        const wd = h.width;
        const tr = simpleTrack(pts, wd, [len * 0.25, len * 0.45], null, 0, 1.5);
        addTrack(paths[h.bucket], tr.T, tr.H);
      }
      B.hatch.push({ group: sh.group, color: sh.hatch.color || 'red', level: sh.hatch.level || 0.5, paths, tone: sh.tone,
        keep: sh.hatch.keep !== undefined ? sh.hatch.keep : sh.hatch.color === 'graphite' && !sh.tone ? 0.25 : 0.4 });
    }

    // optional accents (e.g. the greeting's pink underline)
    for (const name in st.accents || {}) {
      B.accents[name] = st.accents[name].map((a, i) => {
        const tr = simpleTrack(a.pts, a.width || 6, a.taper || [10, 30], rng(seed, 'accent', name, i), 0.6, 2);
        const path = new Path2D();
        addTrack(path, tr.T, tr.H);
        return { group: a.group, color: a.color, level: a.level || 0.7, path, tr, span: a.span || [0, 1] };
      });
    }

    // coloured-pencil strokes (ball swirls): pressure runs with grain along the stroke; the boil nudges
    // each stroke rigidly so its grain doesn't re-roll
    for (const cs of st.colorStrokes || []) {
      const pts = cs.pts, rr = rng(seed, 'cstroke', cs.id);
      const tr = simpleTrack(pts.map((q) => [q[0], q[1], q[2]]), 1, [0, 0], null, 0, 1.8);
      const rigid = new DOMMatrix().translate((rr() - 0.5) * 1.6, (rr() - 0.5) * 1.6);
      const R = resamplePts(pts.map((q) => [q[0], q[1], q[3]]), 1.8);
      const n = tr.T.x.length, H = new Float32Array(n), P = new Float32Array(n);
      const Rw = resamplePts(pts, 1.8);
      for (let i = 0; i < n; i++) { const j = Math.min(i, R.w.length - 1); H[i] = 0.5 * Rw.w[Math.min(i, Rw.w.length - 1)]; P[i] = R.w[j]; }
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
      B.colorStrokes.push({ id: cs.id, group: cs.group, color: cs.color, frontOf: cs.frontOf, opacity: cs.opacity, runs, rigid });
    }

    // ground passes (uneven marker strokes) and contact marks
    for (const sh of st.shadows || []) {
      if (!sh.passes) continue;
      B.passes[sh.id] = sh.passes.map((ps, j) => {
        const tr = simpleTrack(ps.pts, ps.width || 10, [ps.width * 2, ps.width * 3], rng(seed, 'pass', sh.id, j), 0.8, 2);
        const path = new Path2D();
        addTrack(path, tr.T, tr.H);
        return path;
      });
    }
    for (const [i, m] of (st.marks || []).entries()) {
      const tr = simpleTrack(m.pts, m.width || 4, m.taper || [12, 20], rng(seed, 'mark', i), 0.5, 2);
      const path = new Path2D();
      addTrack(path, tr.T, tr.H);
      B.marks.push({ group: m.group, color: m.color || 'graphite', level: m.level || 0.6, path });
    }

    prep.seeds.set(seed, B);
    if (prep.seeds.size > 8) prep.seeds.delete(prep.seeds.keys().next().value);
    return B;
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
  function resolveGroups(st, groupsOpt) {
    const defs = Object.assign({}, st.groups || {});
    const G = {};
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
      let alpha = o.alpha !== undefined ? o.alpha : 1;
      let visible = o.visible !== false;
      if (def.parent) {
        const p = get(def.parent);
        m = p.m.multiply(m);
        alpha *= p.alpha;
        visible = visible && p.visible;
      }
      G[name] = { m, alpha, visible: visible && alpha > 0.001 };
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
  function colourRing(reg, seed, cov, ds) {
    const path = new Path2D();
    for (const pc of reg.pieces) ringPath(pc, reg, seed, cov, ds, path);
    for (const h of reg.holePaths) polyPath(h, path);
    return path;
  }
  /** noise that wraps around a closed loop of length L (no step where the polygon closes) */
  function loopNoise(fn, L) {
    const B = Math.min(60, L * 0.25);
    return (s) => (s < L - B ? fn(s) : lerp(fn(s), fn(s - L), smoothstep(L - B, L, s)));
  }
  function ringPath(pc, reg, seed, cov, ds, path) {
    const R = pc.ring, n = R.pts.length, Lp = R.s[n - 1] + Math.hypot(R.pts[0][0] - R.pts[n - 1][0], R.pts[0][1] - R.pts[n - 1][1]);
    const r = rng(ds, 'ring', pc.name), rb = rng(seed, 'ring', pc.name);
    const nz = loopNoise(noise1(r, 38), Lp), nb = loopNoise(noise1(rb, 30), Lp), nf = loopNoise(noise1(r, 120), Lp);
    const ng = loopNoise(noise1(r, 55), Lp), ns = loopNoise(noise1(r, 34), Lp);
    const base = reg.inset !== undefined ? reg.inset : -1.4;
    const O = reg.outset !== undefined ? reg.outset : 3.2;
    const I1 = 30 * (reg.retreat !== undefined ? reg.retreat : 1);
    const sliverAt = reg.slivers ? 0.32 : 0.5;
    for (let i = 0; i < n; i++) {
      const s = R.s[i];
      const lit = R.nx[i] * LX + R.ny[i] * LY;
      let d = base + 1.0 * nz(s) + 0.5 * nb(s);
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
   * Where the colourist stopped on the lit side, built from marker-stroke ends. Two shapes of "front":
   *   litFade  f: a loose arc across the light; the most-lit fraction f of the region is left bare (box).
   *               Strokes run along the region's stroke angle.
   *   crescent t: a bare crescent hugging the lit pole, t of the region's radius thick (ball, loops).
   *               Strokes run radially toward the pole, so they meet the front head-on.
   * Stroke widths vary 0.5-1.6x. Most strokes stop unevenly near the front; about 1 in 10 runs right to
   * the outline and about 1 in 12 stops well short (a wider gap). Tips are rounded chisels. Lower colour
   * values pull the front back toward the shadow side. Returns a clip Path2D or null.
   */
  function litFront(R, ds, seed, cov) {
    const fade = R.litFade || 0, cres = R.crescent || 0;
    if (!fade && !cres) return null;
    const amt = Math.round((1 - cov) * 40);
    const key = seed + '|' + amt;
    R._fronts = R._fronts || new Map();
    if (R._fronts.has(key)) return R._fronts.get(key);
    const g = regionGeom(R);
    const r = rng(ds, 'front', R.name), rb = rng(seed, 'front', R.name);
    // marker passes sized to the form (a broad nib on a big shape)
    const W = Math.max(R.strokeWidth || 16, 0.065 * g.rad);
    const wave = noise1(rng(ds, 'frontwave', R.name), 3.2 * W);   // the envelope ripples, it doesn't spike
    // how far one stroke ends from the front: a slow wave plus a little per stroke, with the odd
    // stroke running right to the outline and the odd one stopping early (a wider gap)
    const endOffset = (vary, along) => {
      const k = r();
      if (k < 0.08) return 3 * vary + 3 * W;
      if (k < 0.14) return -Math.max(1.2 * W, (1.1 + 0.5 * r()) * vary);
      return 0.9 * vary * wave(along) + (r() - 0.5) * 1.1 * W + (rb() - 0.5) * 1.5;
    };
    // a rounded chisel tip across a stroke: f in 0..1 across the width -> how far the tip reaches
    const tip = (w) => {
      const slant = (r() < 0.5 ? -1 : 1) * (0.25 + 0.5 * r()) * w, cap = w * (0.06 + 0.14 * r());
      return (f) => slant * (f - 0.5) + cap * (Math.sqrt(Math.max(0, Math.sin(PI * f))) - 1);
    };
    const path = new Path2D();

    if (cres) {
      const d = 0.35 * g.rad, t = cres * g.rad * (1 + 3 * (1 - cov));
      const sx = g.cx - LX * d, sy = g.cy - LY * d, rs = g.rad + d - t;
      const vary = Math.max(8, Math.min(1.1 * W, 0.5 * t));
      const pole = Math.atan2(LY, LX);
      let a = pole - PI, first = true;
      while (a < pole + PI - 1e-6) {
        const w = W * (0.5 + 1.3 * r());
        const da = Math.min(w / rs, pole + PI - a);
        const mid = a + da / 2;
        const off = Math.abs(Math.atan2(Math.sin(mid - pole), Math.cos(mid - pole)));
        const near = 1 - smoothstep(PI * 0.42, PI * 0.75, off);       // only the lit side is left unfinished
        const rEnd = lerp(rs + 3 * vary + 60, rs + endOffset(vary, mid * rs), near);
        const tp = tip(w);
        for (let k = 0; k <= 6; k++) {
          const f = k / 6, an = a + da * f, rr = rEnd + tp(f) * near;
          const x = sx + rr * Math.cos(an), y = sy + rr * Math.sin(an);
          if (first) { path.moveTo(x, y); first = false; } else path.lineTo(x, y);
        }
        a += da;
      }
      path.closePath();
    } else {
      // a loose arc across the light: the bare patch rounds into the most-lit corner (deepest in the
      // middle of the arc, thinning out toward its ends)
      const depth = (fade + 0.3 * (1 - cov)) * (g.l1 - g.l0);
      const round = Math.min(g.x1 - g.x0, g.y1 - g.y0) / Math.max(g.x1 - g.x0, g.y1 - g.y0);   // thin strips: just an end
      const cut = g.l1 - depth * (1 - 0.3 * round);
      const mx = g.cx * -LY + g.cy * LX, span = Math.max(40, g.rad);
      const f = (x, y) => { const a = Math.max(-1.4, Math.min(1.4, (x * -LY + y * LX - mx) / span)); return x * LX + y * LY - cut + 0.6 * round * depth * (1 - a * a); };
      const vary = Math.max(8, Math.min(1.1 * W, 0.5 * depth));
      const ang = (((R.strokeAngle !== undefined ? R.strokeAngle : 64)) * PI) / 180;
      let ux = Math.cos(ang), uy = -Math.sin(ang);
      if (ux * LX + uy * LY < 0) { ux = -ux; uy = -uy; }     // +u runs toward the light
      const vx = -uy, vy = ux;
      const pad = 30, corners = [[g.x0 - pad, g.y0 - pad], [g.x1 + pad, g.y0 - pad], [g.x1 + pad, g.y1 + pad], [g.x0 - pad, g.y1 + pad]];
      let t0 = Infinity, t1 = -Infinity, u0 = Infinity, u1 = -Infinity;
      for (const [x, y] of corners) { const t = x * vx + y * vy, u = x * ux + y * uy; t0 = Math.min(t0, t); t1 = Math.max(t1, t); u0 = Math.min(u0, u); u1 = Math.max(u1, u); }
      const P = (u, tt) => [ux * u + vx * tt, uy * u + vy * tt];
      const s0 = P(u0 - 10, t0);
      path.moveTo(s0[0], s0[1]);
      let t = t0;
      while (t < t1) {
        const w = W * (0.5 + 1.3 * r());
        const tc = t + w / 2;
        // walk from the shadow side toward the light: the stroke ends where it leaves the coloured side
        let uEnd = null, inside = false;
        for (let u = u0; u <= u1; u += 2) {
          const x = ux * u + vx * tc, y = uy * u + vy * tc;
          if (f(x, y) < 0) inside = true;
          else if (inside) { uEnd = u; break; }
        }
        if (inside && uEnd === null) uEnd = u1;
        const tp = tip(w);
        if (uEnd === null) uEnd = u0;
        else uEnd += endOffset(vary, tc);
        for (let k = 0; k <= 6; k++) { const q = P(uEnd + tp(k / 6), t + (w * k) / 6); path.lineTo(q[0], q[1]); }
        t += w;
      }
      const s1 = P(u0 - 10, t);
      path.lineTo(s1[0], s1[1]);
      path.closePath();
    }
    R._fronts.set(key, path);
    if (R._fronts.size > 40) R._fronts.delete(R._fronts.keys().next().value);
    return path;
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

  /**
   * Build the colour layer (marker, coloured pencil, kage, ground tone) in device px inside devBox.
   * Construction lines are tucked *under* the colour inside this layer, so they fade where colour lands.
   * Returns true if anything was drawn; the caller composites it (multiply).
   */
  function buildColour(ctx, fig, prep, B, opt) {
    const { st, G, base, seed, c, cols, layers, devBox, S } = opt;
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
    const setG = (g, k) => { const gg = G(g); o.setTransform(base.multiply(gg.m).translate(reg[0] * (k || 1), reg[1] * (k || 1))); return gg; };
    let drew = false;
    const shadowsOn = {};
    for (const sh of st.shadows || []) if (!sh.noFill) for (const h of sh.on || []) (shadowsOn[h] = shadowsOn[h] || []).push(sh);
    const rings = {}, fronts = {};

    // 1. base marker, one flat pass per region inside the colourist's edge, stopped by the lit front
    for (const name in prep.regions) {
      const R = prep.regions[name], gg = setG(R.group);
      if (!gg.visible || aBase <= 0.003) continue;
      const ring = (rings[name] = colourRing(R, seed, cov, ds));
      const front = (fronts[name] = litFront(R.frontOf ? prep.regions[R.frontOf] || R : R, ds, seed, cov));
      o.save();
      if (front) o.clip(front);
      const op = aBase * gg.alpha * (R.opacity !== undefined ? R.opacity : 1);
      o.globalAlpha = op;
      o.fillStyle = rgb(R.color);
      o.fill(ring, 'evenodd');
      // flat marker, no fake streak texture: the hand shows in the edge. A faint darker rim where the
      // ink pooled at the stroke edge.
      o.clip(ring, 'evenodd');
      o.globalCompositeOperation = 'multiply';
      o.globalAlpha = 0.18 * op;
      o.strokeStyle = rgb(R.color);
      o.lineWidth = 1.8;
      o.stroke(ring);
      o.restore();
      drew = true;
    }

    // 2. coloured-pencil strokes laid over the base (the ball's swirls)
    if (aBase > 0.003) for (const cs of B.colorStrokes) {
      const gg = setG(cs.group);
      if (!gg.visible) continue;
      const fr = cs.frontOf && prep.regions[cs.frontOf] ? fronts[cs.frontOf] : null;
      o.save();
      if (fr) o.clip(fr);
      o.globalAlpha = aBase * gg.alpha * (cs.opacity || 1);
      o.transform(cs.rigid.a, cs.rigid.b, cs.rigid.c, cs.rigid.d, cs.rigid.e, cs.rigid.f);
      for (const [lvl, path, ang] of cs.runs) {
        o.fillStyle = placeLocal(pattern(cols[cs.color], lvl, 'pencil'), S.tex / S.k, ang, 3);
        o.fill(path);
      }
      o.restore();
      drew = true;
    }

    // 3. kage: the designed shadow shapes, multiplied over the base (so swirls darken too), kept to
    //    where colour actually landed
    if (aShade > 0.003) for (const name in prep.regions) {
      const R = prep.regions[name];
      if (!shadowsOn[name] || !rings[name]) continue;
      const gg = setG(R.group);
      if (!gg.visible) continue;
      o.save();
      if (fronts[name]) o.clip(fronts[name]);
      o.clip(rings[name], 'evenodd');
      o.globalCompositeOperation = 'multiply';
      o.fillStyle = ratioColour(cols, R.color, R.shade);
      for (const sh of shadowsOn[name]) {
        const sg = setG(sh.group, 0.6);
        if (!sg.visible) continue;
        o.globalAlpha = aShade * sg.alpha * gg.alpha;
        for (const p of sh._paths || (sh._paths = sh.polys.map((q) => polyPath(q)))) o.fill(p);
      }
      o.restore();
      drew = true;
    }

    // 4. ground contact on the paper: a few uneven marker passes, darkest where they overlap
    for (const sh of st.shadows || []) {
      if (!sh.tone || aShade <= 0.003) continue;
      const sg = setG(sh.group);
      if (!sg.visible) continue;
      o.save();
      o.globalCompositeOperation = 'multiply';
      o.fillStyle = rgb(sh.tone);
      if (B.passes[sh.id]) {
        o.globalAlpha = aShade * 0.7 * sg.alpha;
        for (const p of B.passes[sh.id]) o.fill(p);
      } else {
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
      const gg = setG(hl.group);
      if (!gg.visible) continue;
      o.fill(hl._path || (hl._path = polyPath(hl.poly)));
    }
    // 6. paper tooth shows through the colour
    o.setTransform(1, 0, 0, 1, 0, 0);
    o.fillStyle = placePattern(pattern([0, 0, 0], 0.075, 'valley'), S, o);
    o.fillRect(bx, by, bw, bh);
    return L;
  }

  /** Construction marks (blue col-erase), onto ctx or tucked under the colour in the colour layer. */
  function drawConstruction(c2, B, G, base, S, cols, alpha, under) {
    c2.save();
    c2.globalCompositeOperation = under ? 'destination-over' : c2.globalCompositeOperation;
    for (const cm of B.cons) {
      const gg = G(cm.group);
      if (!gg.visible) continue;
      c2.setTransform(base.multiply(gg.m));
      c2.globalAlpha = alpha * gg.alpha;
      c2.fillStyle = placePattern(pattern(cols.blue, cm.level, 'pencil'), S, c2);
      c2.fill(cm.path);
    }
    c2.restore();
  }

  /* ---------------------------------------------------------------- render */
  const DEFAULT_LAYERS = { paper: false, knockout: false, construction: true, colour: true, shadow: true, line: true };

  function render(ctx, fig, opts) {
    opts = opts || {};
    const st = fig.style, prep = prepare(fig);
    const seed = opts.seed !== undefined ? opts.seed : 1;
    const c = clamp01(opts.color !== undefined ? opts.color : 0);
    const layers = Object.assign({}, DEFAULT_LAYERS, opts.layers || {});
    if (opts.layers && opts.layers.color !== undefined) layers.colour = opts.layers.color;
    const blend = opts.blend === 'normal' ? 'source-over' : 'multiply';
    const cols = prep.colors[opts.blend === 'normal' ? 'normal' : 'multiply'];
    const B = seedBuild(fig, prep, seed);

    ctx.save();
    if (opts.x || opts.y) ctx.translate(opts.x || 0, opts.y || 0);
    if (opts.scale) ctx.scale(opts.scale, opts.scale);
    const G0 = resolveGroups(st, opts.groups);
    const rootG = opts.groups && opts.groups.root ? resolveRoot(st, opts.groups.root) : null;
    if (rootG) ctx.transform(rootG.a, rootG.b, rootG.c, rootG.d, rootG.e, rootG.f);
    if (opts.clip) {
      const cp = opts.clip instanceof Path2D ? opts.clip : polyPath(opts.clip);
      ctx.clip(cp, opts.clipRule || 'nonzero');
    }
    const base = ctx.getTransform();
    const S = toothFor(base, 1);
    const rootAlpha = opts.groups && opts.groups.root && opts.groups.root.alpha !== undefined ? opts.groups.root.alpha : 1;
    const G = (name) => {
      const g = G0(name);
      return rootAlpha === 1 ? g : { m: g.m, alpha: g.alpha * rootAlpha, visible: g.visible && rootAlpha > 0.001 };
    };
    const setG = (g) => { const gg = G(g); ctx.setTransform(base.multiply(gg.m)); return gg; };
    const pat = (col, level) => placePattern(pattern(cols[col], level, 'pencil'), S, ctx);

    // device-space box of everything we might touch (bounds under every group's transform)
    const devBox = deviceBox(ctx, st, base, G, prep);

    if (layers.paper) {
      ctx.setTransform(base);
      const bb = st.bounds;
      paperFill(ctx, bb[0], bb[1], bb[2] - bb[0], bb[3] - bb[1], S, st.palette.paper);
    }
    if (layers.knockout) {
      for (const oc of st.occluders || []) {
        const gg = setG(oc.group);
        if (!gg.visible) continue;
        ctx.globalAlpha = gg.alpha;
        ctx.globalCompositeOperation = 'source-over';
        const p = oc._path || (oc._path = polyPath(oc.poly));
        ctx.fillStyle = st.palette.paper;
        ctx.fill(p);
        ctx.globalCompositeOperation = blend;
        ctx.fillStyle = placePattern(pattern([150, 135, 115], 0.1, 'paper'), S, ctx);
        ctx.fill(p);
      }
    }
    ctx.globalCompositeOperation = blend;

    // colour layer first (offscreen), so construction can be tucked under it and fade where it lands
    const consAlpha = 1 - 0.35 * smoothstep(0.3, 1, c);
    let layer = null;
    if ((layers.colour || layers.shadow) && c > 0.003 && (st.regionOrder || []).length + (st.shadows || []).length) {
      layer = buildColour(ctx, fig, prep, B, { st, G, base, seed, c, cols, layers, devBox, S });
    }
    if (layers.construction) {
      if (layer) drawConstruction(layer.getContext('2d'), B, G, base, S, cols, consAlpha, true);
      else { ctx.save(); drawConstruction(ctx, B, G, base, S, cols, consAlpha, false); ctx.restore(); }
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

    if (layers.shadow) {
      const fadeH = smoothstep(0.3, 1, c);
      for (const h of B.hatch) {
        const gg = setG(h.group);
        if (!gg.visible) continue;
        const col = h.color;
        ctx.globalAlpha = (1 - (1 - h.keep) * fadeH) * gg.alpha;
        ctx.fillStyle = pat(col, h.level);
        ctx.fill(h.paths[0]);
        ctx.fillStyle = pat(col, h.level * 0.78);
        ctx.fill(h.paths[1]);
      }
      const aE = 1 - 0.35 * smoothstep(0.4, 1, c);
      for (const e of B.edges) {
        const gg = setG(e.group);
        if (!gg.visible) continue;
        ctx.globalAlpha = aE * gg.alpha;
        ctx.fillStyle = pat(e.color, e.color === 'graphite' ? 0.45 : 0.62);
        ctx.fill(e.path);
      }
      for (const e of B.hl) {
        const gg = setG(e.group);
        if (!gg.visible) continue;
        ctx.globalAlpha = (1 - 0.7 * smoothstep(0.2, 0.9, c)) * gg.alpha;   // genga mark: yields to the colour
        ctx.fillStyle = pat('blue', 0.66);
        ctx.fill(e.path);
      }
      for (const m of B.marks) {   // contact lines and other small shadow-layer pencil marks
        const gg = setG(m.group);
        if (!gg.visible) continue;
        ctx.globalAlpha = gg.alpha;
        ctx.fillStyle = pat(m.color, m.level);
        ctx.fill(m.path);
      }
    }

    if (layers.line) drawLines(ctx, fig, prep, B, opts, { setG, pat, c, G, base, devBox, blend, cols, S });

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
    return m.translate(-pv[0], -pv[1]);
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

  function drawLines(ctx, fig, prep, B, opts, h) {
    const prog = progressOf(prep, opts.draw);
    const { setG, pat } = h;
    const show = opts.show || [];
    const items = [];
    for (const S of prep.strokes) {
      const p = prog[S.idx];
      if (p <= 0 || (S.hidden && show.indexOf(S.id) < 0)) continue;
      const Lr = B.lines[S.id];
      let buckets = Lr.buckets;
      if (p < 1) {   // mid write-on: a blunt pencil tip, the end taper only arrives when the stroke ends
        const t = truncTrack(Lr.T, Lr.H, p * S.L, Lr.P);
        buckets = addPressure(new Map(), t.T, t.H, t.P, t.last);
      }
      items.push([S.group, buckets, Lr.rigid]);
    }
    for (const sp of B.second) if (prog[prep.byId[sp.stroke].idx] >= sp.to) items.push([sp.group, sp.buckets, sp.rigid]);
    drawGraphite(ctx, items, h);

    const acc = opts.accent || null;
    if (acc && B.accents[acc]) {
      // by default the accent waits for the write-on to finish; pass accentAmount to animate it
      const done = opts.draw === undefined || opts.draw === null || opts.draw >= 1;
      const a = typeof opts.accentAmount === 'number' ? clamp01(opts.accentAmount) : done ? 1 : 0;
      if (a <= 0) return;
      for (const ac of B.accents[acc]) {
        const gg = setG(ac.group);
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
        const gg = setG(g);
        if (!gg.visible) continue;
        if (rigid) ctx.transform(rigid.a, rigid.b, rigid.c, rigid.d, rigid.e, rigid.f);
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
    const tUnits = S.tex / (S.k || 1);
    for (const [g, buckets, rigid] of items) {
      const gg = G(g);
      if (!gg.visible) continue;
      let m = base.multiply(gg.m);
      if (rigid) m = m.multiply(rigid);
      o.setTransform(m);
      o.globalAlpha = gg.alpha;
      for (const [key, path] of buckets) {
        o.fillStyle = placeLocal(pattern([0, 0, 0], keyPressure(key, S), 'cov', S.soft), tUnits);
        o.fill(path);
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
  function paperFill(ctx, x, y, w, h, S, color) {
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = color || '#f3eee3';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = placePattern(pattern([120, 104, 86], 0.025, 'paper'), S, ctx);
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
    return prep.strokes.filter((s) => !s.extra).map((s) => {
      const t = prep.timeline[s.idx];
      return { id: s.id, start: t[0], end: t[1], startMs: t[2], endMs: t[3], length: s.L };
    });
  }
  /** Total write-on time at natural pen speed (ms). */
  function writeDuration(fig) { return prepare(fig).totalMs; }

  /** Seed for a boil at `fps` cycling through `seeds`, from a time in ms. */
  function boilSeed(ms, seeds, fps) {
    seeds = seeds || [1, 2, 3];
    return seeds[Math.floor((ms / 1000) * (fps || 8)) % seeds.length];
  }

  root.Pencil = { render, paper, line, fit, regionPath: regionPathOf, timeline, writeDuration, boilSeed, config, _prepare: prepare };
})(typeof window !== 'undefined' ? window : globalThis);
