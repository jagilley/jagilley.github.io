// hand.js: drawing primitives for authoring figures in code (effects, props, anything nobody drew).
//
// Everything here produces figure data for pencil.js in the shared units (100 = one ruled-line
// spacing, a pen ~7 units wide). A Fig collects:
//   g()       graphite strokes (the key line: per-point width + weight, tapers, breaks)
//   c()       coloured-pencil marks (style.marks; drawn with the shadow layer, colour-dial independent)
//   hm()      graphite hatch marks (style.marks, colour 'graphite'; the figures' hatching look)
//   dot()     a short dab (a key-line stroke flagged `dot`)
//   region()  a marker fill region (+ optional knockout occluder)
//   shadow()  a kage shape with a red boundary + hatching
//   cons()    blue col-erase construction marks
// and build() returns {strokes, style} plus anchor/size metadata.
//
// The hand: control points are placed by the caller with deliberate irregularity; this file adds
// tremor (low-amplitude normal wobble at two frequencies), pressure noise, uneven tapers and
// imperfect closure. Nothing is evenly spaced or symmetric unless the caller asks for it.
'use strict';

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
const R = (...k) => mulberry(hashStr(k.join('|')));
const U = (r, a, b) => a + (b - a) * r();
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const D2R = Math.PI / 180;

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

/** value along u in 0..1: number, [a, b] linear, [a, b, c, ...] piecewise, or fn(u) */
function val(v, u) {
  if (typeof v === 'function') return v(u);
  if (Array.isArray(v)) {
    if (v.length === 1) return v[0];
    const x = clamp01(u) * (v.length - 1), i = Math.min(v.length - 2, Math.floor(x));
    return lerp(v[i], v[i + 1], x - i);
  }
  return v;
}

function cumlen(pts) {
  const c = [0];
  for (let i = 1; i < pts.length; i++) c.push(c[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  return c;
}

/** Catmull-Rom through control points (open), sampled about every `step` units. */
function spline(ctrl, step) {
  if (ctrl.length < 3) return resample(ctrl, step);
  const P = [[2 * ctrl[0][0] - ctrl[1][0], 2 * ctrl[0][1] - ctrl[1][1]], ...ctrl,
    [2 * ctrl[ctrl.length - 1][0] - ctrl[ctrl.length - 2][0], 2 * ctrl[ctrl.length - 1][1] - ctrl[ctrl.length - 2][1]]];
  const out = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    const n = Math.max(1, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / step));
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(ctrl[ctrl.length - 1].slice(0, 2));
  return out;
}

function resample(pts, step) {
  const c = cumlen(pts), L = c[c.length - 1], n = Math.max(2, Math.round(L / step) + 1), out = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = (L * i) / (n - 1);
    while (j < pts.length - 2 && c[j + 1] < t) j++;
    const f = clamp01((t - c[j]) / ((c[j + 1] - c[j]) || 1));
    out.push([lerp(pts[j][0], pts[j + 1][0], f), lerp(pts[j][1], pts[j + 1][1], f)]);
  }
  return out;
}

function normals(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1;
    out.push([-ty / l, tx / l]);
  }
  return out;
}

/** hand tremor: offset along the normal by two octaves of smooth noise (amp in units) */
function wobble(pts, rand, amp, period) {
  if (!amp) return pts;
  const n1 = noise1(rand, period), n2 = noise1(rand, period * 0.33), c = cumlen(pts), nn = normals(pts);
  return pts.map((p, i) => {
    const d = amp * (0.75 * n1(c[i]) + 0.25 * n2(c[i]));
    return [p[0] + nn[i][0] * d, p[1] + nn[i][1] * d];
  });
}

/** quadratic bezier a -> b via control q, sampled */
function quad(a, q, b, n) {
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, s = 1 - t;
    out.push([s * s * a[0] + 2 * s * t * q[0] + t * t * b[0], s * s * a[1] + 2 * s * t * q[1] + t * t * b[1]]);
  }
  return out;
}

function polyArea(p) {
  let a = 0;
  for (let i = 0; i < p.length; i++) { const q = p[i], r = p[(i + 1) % p.length]; a += q[0] * r[1] - r[0] * q[1]; }
  return a / 2;
}
/** clockwise on screen (positive shoelace with y down), as the renderer expects */
const cw = (p) => (polyArea(p) < 0 ? p.slice().reverse() : p);

/** u-intervals where the line {p . v = t} is inside a polygon (even-odd) */
function scan(poly, t, ux, uy, vx, vy) {
  const hits = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const ta = a[0] * vx + a[1] * vy, tb = b[0] * vx + b[1] * vy;
    if ((ta - t) * (tb - t) < 0) {
      const f = (t - ta) / (tb - ta);
      hits.push(lerp(a[0], b[0], f) * ux + lerp(a[1], b[1], f) * uy);
    }
  }
  hits.sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i + 1 < hits.length; i += 2) out.push([hits[i], hits[i + 1]]);
  return out;
}

const r1 = (v) => Math.round(v * 10) / 10;

/**
 * Ramer-Douglas-Peucker over n-d points (each a plain array): returns the kept indices. Used to drop
 * points that a straight run between their neighbours reproduces within eps (in the scaled space the
 * caller builds, so width and weight profiles survive too).
 */
function rdpKeep(P, eps) {
  const n = P.length;
  if (n < 3) return P.map((_, i) => i);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const stack = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let best = -1, bi = -1;
    const A = P[a], B = P[b], d = A.length;
    let ab2 = 0; for (let k = 0; k < d; k++) ab2 += (B[k] - A[k]) ** 2;
    for (let i = a + 1; i < b; i++) {
      const X = P[i];
      let t = 0; for (let k = 0; k < d; k++) t += (X[k] - A[k]) * (B[k] - A[k]);
      t = ab2 ? Math.max(0, Math.min(1, t / ab2)) : 0;
      let e = 0; for (let k = 0; k < d; k++) e += (X[k] - (A[k] + t * (B[k] - A[k]))) ** 2;
      if (e > best) { best = e; bi = i; }
    }
    if (bi > 0 && best > eps * eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(i);
  return out;
}
const r2 = (v) => Math.round(v * 100) / 100;

class Fig {
  constructor(name, seedKey, opts) {
    this.name = name;
    this.key = seedKey || name;
    // storage: coordinates rounded to q units (1 for big FX, 0.1 for small ones), points simplified
    // within eps units (width and weight profiles included)
    this.q = (opts && opts.q) || (opts && opts.q === 0 ? 0 : 1);
    this.eps = (opts && opts.eps) || 0.35;
    this.strokes = [];
    this.lines = {};
    this.marks = [];
    this.regions = {};
    this.regionOrder = [];
    this.shadows = [];
    this.construction = [];
    this.occluders = [];
    this.n = 0;
    this.extent = [Infinity, Infinity, -Infinity, -Infinity];
  }
  grow(x, y, pad) {
    const e = this.extent;
    e[0] = Math.min(e[0], x - pad); e[1] = Math.min(e[1], y - pad);
    e[2] = Math.max(e[2], x + pad); e[3] = Math.max(e[3], y + pad);
  }
  rng(...k) { return R(this.key, ...k); }

  /**
   * Graphite stroke in the key-line pipeline.
   * o: w (width, val), wt (line weight ~0.55-1.45, val), taper [a,b] units, tip [m0,m1], level,
   *    land, wob (tremor amp), per (tremor period), step, raw (use ctrl as-is), breaks, fade, dot, id
   */
  g(ctrl, o) {
    o = o || {};
    const id = o.id || `g${this.n++}`;
    const r = this.rng(id);
    let pts = o.raw ? ctrl.map((p) => p.slice(0, 2)) : spline(ctrl, o.step || 3);
    pts = wobble(pts, r, o.wob !== undefined ? o.wob : 0.8, o.per || 30);
    const c = cumlen(pts), L = c[c.length - 1] || 1, nw = noise1(r, 16);
    const out = [], wt = [];
    for (let i = 0; i < pts.length; i++) {
      const u = c[i] / L, w = val(o.w !== undefined ? o.w : 7, u) * (1 + (o.wn !== undefined ? o.wn : 0.07) * nw(c[i]));
      out.push([r1(pts[i][0]), r1(pts[i][1]), r1(Math.max(0.6, w))]);
      wt.push(r2(val(o.wt !== undefined ? o.wt : 1, u)));
      this.grow(pts[i][0], pts[i][1], w);
    }
    this.strokes.push({ id, pts: out, _dot: !!o.dot });   // group lives in lines[id]
    const ln = { weight: wt, taper: (o.taper || [8, 14]).map(r1), tip: (o.tip || [0.35, 0.12]).map(r2) };
    if (o.level !== undefined) ln.level = r2(o.level);
    if (o.land) ln.land = r2(o.land);
    if (o.breaks) ln.breaks = o.breaks;
    if (o.fade) ln.fade = o.fade;
    if (o.dot) ln.dot = true;
    this.lines[id] = ln;
    return pts;
  }

  /** a short pencil dab, landing heavy and lifting light */
  dot(x, y, o) {
    o = o || {};
    const r = this.rng('dot', this.n);
    const a = (o.ang !== undefined ? o.ang : U(r, -40, 220)) * D2R, len = o.len || U(r, 2.5, 5.5);
    const pts = [[x, y], [x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5 + U(r, -0.5, 0.5)], [x + Math.cos(a) * len, y + Math.sin(a) * len]];
    return this.g(pts, { raw: true, w: o.w || U(r, 6, 8.5), dot: true, wob: 0, level: o.level !== undefined ? o.level : 1, taper: [0, 0], tip: [1, 1], id: o.id });
  }

  /** coloured-pencil mark (style.marks): constant width with tapers, uniform pressure */
  c(ctrl, o) {
    o = o || {};
    const r = this.rng('c', this.marks.length);
    let pts = o.raw ? ctrl.map((p) => p.slice(0, 2)) : spline(ctrl, o.step || 3);
    pts = wobble(pts, r, o.wob !== undefined ? o.wob : 0.6, o.per || 26);
    const width = o.width || 5;
    pts.forEach((p) => this.grow(p[0], p[1], width));
    const m = { group: 'fx', pts: pts.map((p) => [r1(p[0]), r1(p[1])]), width: r1(width), level: r2(o.level || 0.7), color: o.color || 'rose' };
    if (o.taper) m.taper = o.taper.map(r1);
    this.marks.push(m);
    return pts;
  }
  /** graphite hatch mark (the figures' hatching look) */
  hm(ctrl, o) { return this.c(ctrl, Object.assign({ color: 'graphite', width: 2.4, level: 0.5 }, o)); }

  region(name, poly, o) {
    const p = cw(poly).map((q) => [r1(q[0]), r1(q[1])]);
    p.forEach((q) => this.grow(q[0], q[1], 4));
    this.regions[name] = Object.assign({ group: 'fx', polys: [p] }, o || {});
    this.regionOrder.push(name);
    return p;
  }
  occluder(poly) { this.occluders.push({ group: 'fx', poly: cw(poly).map((q) => [r1(q[0]), r1(q[1])]) }); }
  shadow(o) {
    const sh = Object.assign({ group: 'fx' }, o);
    sh.polys = o.polys.map((p) => cw(p).map((q) => [r1(q[0]), r1(q[1])]));
    if (o.edge) sh.edge = o.edge.map((e) => e.map((q) => [r1(q[0]), r1(q[1])]));
    this.shadows.push(sh);
  }
  cons(ctrl, o) {
    o = o || {};
    const r = this.rng('cons', this.construction.length);
    let pts = o.raw ? ctrl : spline(ctrl, 4);
    pts = wobble(pts, r, o.wob !== undefined ? o.wob : 1.2, 60);
    pts.forEach((p) => this.grow(p[0], p[1], 3));
    this.construction.push({ group: 'fx', pts: pts.map((p) => [r1(p[0]), r1(p[1])]), level: o.level || 0.4, width: o.width || 2.5 });
  }

  /** simplify + quantise everything for storage (visually lossless: eps ~0.35 unit, q 1 unit) */
  pack() {
    const q = this.q, Q = (v) => (q >= 1 ? Math.round(v) : Math.round(v * 10) / 10);
    const simp = (pts, eps) => { const k = rdpKeep(pts, eps); return k.map((i) => pts[i]); };
    for (const s of this.strokes) {
      const ln = this.lines[s.id];
      if (s._dot) { delete s._dot; continue; }
      delete s._dot;
      const P = s.pts.map((p, i) => [p[0], p[1], p[2] * 2, ln.weight[i] * 25]);
      const keep = rdpKeep(P, this.eps);
      s.pts = keep.map((i) => [Q(s.pts[i][0]), Q(s.pts[i][1]), s.pts[i][2]]);
      ln.weight = keep.map((i) => ln.weight[i]);
      if (ln.weight.every((v) => v === ln.weight[0])) ln.weight = [ln.weight[0]];   // the renderer clamps to the last entry
    }
    for (const m of this.marks) m.pts = simp(m.pts, this.eps).map((p) => [Q(p[0]), Q(p[1])]);
    const poly = (p) => simp(p, 0.5).map((v) => [Q(v[0]), Q(v[1])]);
    for (const n in this.regions) {
      const R0 = this.regions[n];
      R0.polys = R0.polys.map(poly);
      if (R0.holes) R0.holes = R0.holes.map(poly);
    }
    for (const o of this.occluders) o.poly = poly(o.poly);
    for (const sh of this.shadows) { sh.polys = sh.polys.map(poly); if (sh.edge) sh.edge = sh.edge.map((e) => simp(e, 0.4).map((v) => [Q(v[0]), Q(v[1])])); }
    for (const c of this.construction) c.pts = simp(c.pts, 0.5).map((p) => [Q(p[0]), Q(p[1])]);
  }

  build(meta) {
    this.pack();
    const e = this.extent, pad = 14;
    const bounds = [Math.floor(e[0] - pad), Math.floor(e[1] - pad), Math.ceil(e[2] + pad), Math.ceil(e[3] + pad)];
    const style = {
      figure: this.name, bounds, designSeed: hashStr(this.name) % 997 + 1, palette: PALETTE,
      groups: {}, lines: this.lines,   // every stroke is in the default group 'all' (pivot = anchor) penSpeed: meta && meta.penSpeed || 1400,
    };
    if (this.marks.length) style.marks = this.marks;
    if (this.regionOrder.length) { style.regions = this.regions; style.regionOrder = this.regionOrder; }
    if (this.shadows.length) style.shadows = this.shadows;
    if (this.construction.length) style.construction = this.construction;
    if (this.occluders.length) style.occluders = this.occluders;
    return {
      strokes: { figure: this.name, unit: '100 = one ruled-line spacing', anchor: [0, 0], strokes: this.strokes },
      style,
      anchor: [0, 0],
      size: [bounds[2] - bounds[0], bounds[3] - bounds[1]],
      hold: meta && meta.hold || 2,
    };
  }
}

// Colours as they should read on paper (multiplied by the renderer): the constants (paper, graphite,
// construction blue, shadow red) plus the first piece's figure and effect colours. Replace the rest per piece.
const PALETTE = {
  paper: '#f3eee3', graphite: '#3a3532', blue: '#7aa6dc', red: '#d4574d',
  rose: '#ff86c4', lilac: '#b77be6', pink: '#ee7290', teal: '#3fa79a',
  sunset: '#ff8c68', gold: '#f7b955', flash: '#fbe3a6', flashShade: '#f6c27a',
  dust: '#dcd2c4', dustShade: '#b9adab',
};

module.exports = { rdpKeep, R, U, lerp, clamp01, smooth, D2R, noise1, val, cumlen, spline, resample, normals, wobble, quad, polyArea, cw, scan, Fig, PALETTE, hashStr };
