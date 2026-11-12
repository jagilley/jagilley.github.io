#!/usr/bin/env node
// Build the hand-drawn FX drawings -> resources/jaden/fx.style.js
//
//   node jaden-work/tools/fx/build.js
//
// Each sequence is an array of figures (one per drawing) in pencil.js figure format, authored around
// an anchor at (0, 0). See jaden-work/style/fx-NOTES.md for anchors, sizes and exposures.
'use strict';
const fs = require('fs');
const path = require('path');
const H = require('./hand.js');
const { R, U, lerp, clamp01, D2R, quad, spline, scan, Fig } = H;

const OUT = path.resolve(__dirname, '../../../resources/jaden/fx.style.js');

/* ------------------------------------------------------------------ shared bits */

/** irregular knots in 0..1: n segments of uneven length (never evenly spaced) */
function knots(r, n, spread) {
  const w = [];
  for (let i = 0; i < n; i++) w.push(1 + (spread || 0.45) * (r() * 2 - 1));
  const s = w.reduce((a, b) => a + b, 0), out = [0];
  let acc = 0;
  for (let i = 0; i < n; i++) { acc += w[i] / s; out.push(acc); }
  out[n] = 1;
  return out;
}

/**
 * A chain of cloud bumps through knot points K (in drawing order). Each chord bulges to the side
 * given by `side(i, mid, nrm)` (returns +1/-1) with height chord*hk; bumps are rounded with a cusp
 * where they meet. Returns a dense polyline.
 */
function bumpChain(r, K, o) {
  const out = [];
  for (let i = 0; i + 1 < K.length; i++) {
    const a = K[i], b = K[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    let nx = dy / L, ny = -dx / L;
    const sg = o.side(i, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [nx, ny]);
    nx *= sg; ny *= sg;
    const hb = L * (typeof o.hk === 'function' ? o.hk(i, [nx, ny]) : o.hk) * U(r, 0.82, 1.18);
    const skew = U(r, 0.8, 1.25), m = Math.max(6, Math.ceil(L / 5));
    for (let k = i ? 1 : 0; k <= m; k++) {
      const t = k / m, ts = Math.pow(t, skew), off = hb * Math.pow(Math.sin(Math.PI * ts), 0.72);
      out.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
    }
  }
  return out;
}

/** short tapered tick: from p, direction ang (deg), length len */
function tick(F, p, ang, len, o) {
  const a = ang * D2R, r = F.rng('tick', p[0], p[1]);
  const bow = (o && o.bow !== undefined ? o.bow : U(r, -0.12, 0.12)) * len;
  const q = [p[0] + Math.cos(a) * len, p[1] + Math.sin(a) * len];
  const m = [(p[0] + q[0]) / 2 - Math.sin(a) * bow, (p[1] + q[1]) / 2 + Math.cos(a) * bow];
  return [p, m, q];
}

/* ===================================================================== DUST */
// Anchor (0, 0): the ball's ground contact point (ball figure units (462, 832)). y up is negative.
// The ball is ~806 units wide; its lower edge rises away from the contact point (|dx| 150 -> y -29,
// 250 -> -87, 350 -> -203), so the inner billows tuck in front of it (render with knockout).

const LN = [-0.6, -0.8];   // toward the key light (upper left), as in the figures

/**
 * A cluster of overlapping billows, drawn the way an effects animator draws dust: each lobe is its
 * own pencil stroke along the part of it that is on the silhouette, often carried on a little way
 * into its neighbour (the overlap "tuck" that gives the cloud its volume). No lobe is a true circle.
 *   o.lobes [{x, y, r, sq}]  o.ground (y) | null  o.w  o.level  o.wt  o.tuck (prob)
 *   o.drop: fraction of the lit side to leave undrawn (break-up)  o.gaps: [[a0, a1] deg] undrawn
 *   o.region {...} -> marker fill + occluder   o.kage [lobe idx] -> red-bounded crescent shadows
 */
function lobeCluster(F, o) {
  const r = F.rng('lobes', o.key);
  const lobes = o.lobes.map((l, i) => {
    const q = R(F.key, o.key, 'lobe', i);
    const ph = [U(q, 0, 6.28), U(q, 0, 6.28), U(q, 0, 6.28)], am = [U(q, 0.02, 0.045), U(q, 0.015, 0.035), U(q, 0.006, 0.014)];
    return Object.assign({ ry: l.r * (l.sq || 0.92), k: (th) => 1 + am[0] * Math.sin(2 * th + ph[0]) + am[1] * Math.sin(3 * th + ph[1]) + am[2] * Math.sin(5 * th + ph[2]) }, l);
  });
  const P = (l, th) => { const k = l.k(th); return [l.x + Math.cos(th) * l.r * k, l.y + Math.sin(th) * l.ry * k]; };
  const inside = (l, p, f) => Math.hypot((p[0] - l.x) / l.r, (p[1] - l.y) / l.ry) < (f || 0.985);
  const g = o.ground;
  const runs = [];
  lobes.forEach((l, i) => {
    const N = Math.max(24, Math.ceil((2 * Math.PI * l.r) / 3)), vis = [];
    for (let k = 0; k < N; k++) {
      const th = (2 * Math.PI * k) / N, p = P(l, th);
      let v = !lobes.some((m, j) => j !== i && inside(m, p)) && (g === undefined || g === null || p[1] < g - 1.5);
      const lit = Math.cos(th) * LN[0] + Math.sin(th) * LN[1];
      if (v && o.drop && lit > 1 - 2 * o.drop * (0.75 + 0.5 * r())) v = false;
      if (v && o.gaps) { const deg = ((th * 180) / Math.PI + 360) % 360; if (o.gaps.some(([a, b]) => deg > a && deg < b)) v = false; }
      vis.push(v);
    }
    if (vis.every((v) => v)) {   // an isolated lobe: one loop, imperfectly closed
      const a0 = U(r, 0, 6.28), over = U(r, -14, 12) / l.r, pts = [];
      for (let t = 0; t <= 2 * Math.PI + over; t += 3 / l.r) pts.push(P(l, a0 + t));
      runs.push({ l, pts, a: a0 });
      return;
    }
    let s0 = vis.findIndex((v, k) => !v && vis[(k + 1) % N]);   // a run starts after a hidden sample
    if (s0 < 0) return;
    for (let c = 0, k = (s0 + 1) % N; c < N; ) {
      if (!vis[k]) { k = (k + 1) % N; c++; continue; }
      const st = k;
      let n = 0;
      while (vis[k] && n < N) { k = (k + 1) % N; n++; c++; }
      if (n * 3 < 10) continue;   // slivers
      if (g !== undefined && g !== null) {   // notches between billows at the ground: not on the silhouette
        let my = 0;
        for (let q = 0; q < n; q++) my += P(l, (2 * Math.PI * ((st + q) % N)) / N)[1];
        if (my / n > g - Math.max(14, l.r * 0.3)) continue;
      }
      const a = (2 * Math.PI * st) / N, b = a + (2 * Math.PI * n) / N;
      // tuck into a neighbour (never below the ground)
      const ext = (th) => { const p = P(l, th); return (g === undefined || g === null || p[1] < g - 2) && lobes.some((m) => m !== l && inside(m, p, 1.0)); };
      let a1 = a, b1 = b;
      if (o.tuck && r() < o.tuck && ext(a - 0.05)) a1 = a - U(r, 0.16, 0.5) * (60 / Math.max(40, l.r));
      if (o.tuck && r() < o.tuck * 0.8 && ext(b + 0.05)) b1 = b + U(r, 0.16, 0.5) * (60 / Math.max(40, l.r));
      const pts = [];
      for (let t = a1; t <= b1 + 1e-6; t += 3 / l.r) pts.push(P(l, t));
      runs.push({ l, pts, a });
    }
  });
  // drawn in a sweep over the top of the cluster
  const cx = lobes.reduce((s, l) => s + l.x * l.r * l.r, 0) / lobes.reduce((s, l) => s + l.r * l.r, 0);
  runs.sort((p, q) => p.pts[0][0] - q.pts[0][0]);
  for (const run of runs) {
    const l = run.l, pts = run.pts;
    if (pts.length < 3) continue;
    const wt = pts.map((p) => {
      const nx = (p[0] - l.x) / l.r, ny = (p[1] - l.y) / l.ry, nl = Math.hypot(nx, ny) || 1;
      const lit = (nx * LN[0] + ny * LN[1]) / nl;
      return Math.max(0.6, Math.min(1.42, (1 - 0.3 * lit) * (o.wt || 1)));
    });
    const Lr = pts.length * 3;
    F.g(pts, { raw: true, w: (o.w || 5.8) * U(r, 0.9, 1.08), wt: wt, taper: [U(r, 4, 11), Math.min(Lr * 0.45, U(r, 10, 26))], tip: [0.3, 0.08],
      level: (o.level || 1) * U(r, 0.92, 1.05), wob: 0.7, per: 22 });
  }
  // fill: the cluster's silhouette
  let poly = null;
  if (o.region) {
    if (g !== undefined && g !== null) {
      const x0 = Math.min(...lobes.map((l) => l.x - l.r)), x1 = Math.max(...lobes.map((l) => l.x + l.r));
      poly = [];
      for (let x = x0; x <= x1; x += 3) {
        let y = g;
        for (const l of lobes) { const u = (x - l.x) / l.r; if (Math.abs(u) < 1) y = Math.min(y, l.y - l.ry * l.k(-Math.acos(u)) * Math.sqrt(1 - u * u)); }
        poly.push([x, y]);
      }
      poly.push([x1, g + 2], [x0, g + 2]);
    } else {
      const pts = [];
      lobes.forEach((l, i) => {
        for (let th = 0; th < 2 * Math.PI; th += 4 / l.r) { const p = P(l, th); if (!lobes.some((m, j) => j !== i && inside(m, p))) pts.push(p); }
      });
      const cy = lobes.reduce((s, l) => s + l.y * l.r * l.r, 0) / lobes.reduce((s, l) => s + l.r * l.r, 0);
      pts.sort((p, q) => Math.atan2(p[1] - cy, p[0] - cx) - Math.atan2(q[1] - cy, q[0] - cx));
      poly = pts;
    }
    F.region(o.key, poly, o.region);
    if (o.occlude !== false) F.occluder(poly);
  }
  // kage: a crescent on the lower right of a front billow, bounded in red and loosely hatched
  for (const i of o.kage || []) {
    const l = lobes[i], d = l.r * (o.kd || 0.38), s = { x: l.x + LN[0] * d, y: l.y + LN[1] * d, r: l.r * 1.02, ry: l.ry * 1.02 };
    const outer = [], inner = [];
    for (let th = -Math.PI; th < Math.PI; th += 3 / l.r) {
      const p = P(l, th);
      if (!inside(s, p, 1.0)) outer.push([th, p]);
      const q = [s.x + Math.cos(th) * s.r * l.k(th), s.y + Math.sin(th) * s.ry * l.k(th)];
      if (inside(l, q, 0.995)) inner.push([th, q]);
    }
    // order both arcs as one loop: outer arc (lower right) forward, inner arc back
    const ang = (v) => ((v[0] - Math.atan2(-LN[1], -LN[0]) + 3 * Math.PI) % (2 * Math.PI));
    outer.sort((p, q) => ang(p) - ang(q)); inner.sort((p, q) => ang(q) - ang(p));
    const clampG = (p) => (g !== undefined && g !== null ? [p[0], Math.min(p[1], g)] : p);
    const shape = outer.map((v) => clampG(v[1])).concat(inner.map((v) => clampG(v[1])));
    const edge = inner.map((v) => v[1]).filter((p) => !lobes.some((m) => m !== l && inside(m, p, 0.97)) && (g === undefined || g === null || p[1] < g - 4));
    if (shape.length > 6) F.shadow({ id: `${o.key}-k${i}`, on: [o.key], polys: [shape], edge: edge.length > 4 ? [edge.slice(1, -1)] : [], hatch: { color: 'red', spacing: 6.5, level: 0.42, keep: 0.3, maxLen: 26, fade: 0.7 } });
  }
  return { lobes, poly };
}

function specks(F, list) {
  for (const s of list) {
    if (s.dot) F.dot(s.p[0], s.p[1], { w: s.w || 6.5, level: s.level || 0.95 });
    else F.g(tick(F, s.p, s.ang, s.len), { w: s.w || 5, wt: [1.15, 0.8], taper: [2, s.len * 0.6], tip: [0.6, 0.05], level: s.level || 0.95, wob: 0.3 });
  }
}
const lob = (arr, sq) => arr.map(([x, y, r, q]) => ({ x, y, r, sq: q || sq || 0.92 }));
const DUSTFILL = (o) => Object.assign({ color: 'dust', shade: 'dustShade', litFade: 0.22, strokeAngle: 16, strokeWidth: 12 }, o || {});

function dust() {
  const seq = [];
  // D1: contact. Low billows squeezed out sideways along the ground; a rush of ground ticks.
  {
    const F = new Fig('dust-1');
    lobeCluster(F, { key: 'L', ground: 0, w: 5.6, tuck: 0.5, region: DUSTFILL(), lobes: lob([
      [-124, -10, 21], [-160, -17, 31], [-209, -22, 42], [-266, -27, 52], [-318, -17, 33], [-366, -24, 45], [-421, -16, 31], [-452, -8, 17]], 0.74) });
    lobeCluster(F, { key: 'R', ground: 0, w: 5.6, tuck: 0.5, region: DUSTFILL(), lobes: lob([
      [131, -11, 22], [168, -21, 34], [224, -26, 47], [271, -15, 29], [318, -24, 43], [371, -18, 32], [400, -10, 19]], 0.74) });
    for (const [s, x, y, len] of [[-1, 486, -7, 70], [-1, 520, -28, 42], [1, 436, -6, 60], [1, 470, -22, 36], [1, 506, -3, 28]]) {
      F.g(tick(F, [s * x, y], s > 0 ? -3 : 183, len, { bow: 0.03 }), { w: 4.8, wt: [1.1, 0.75], taper: [3, len * 0.7], tip: [0.5, 0.05], level: 0.9, wob: 0.4 });
    }
    specks(F, [{ p: [-300, -92], dot: true }, { p: [262, -80], ang: -60, len: 13 }]);
    F.cons([[-600, 3], [-200, 1.5], [200, 3.5], [610, 1]], { level: 0.32 });
    seq.push(F.build({ hold: 2 }));
  }
  // D2: bloom. The masses billow out and up; the fronts roll over; specks thrown on arcs.
  {
    const F = new Fig('dust-2');
    lobeCluster(F, { key: 'L', ground: 0, w: 6, tuck: 0.6, region: DUSTFILL(), kage: [4], lobes: lob([
      [-140, -16, 30], [-196, -33, 48], [-262, -52, 63], [-342, -74, 84], [-432, -82, 92], [-523, -62, 77], [-598, -34, 54], [-642, -12, 29],
      [-298, -142, 50], [-402, -178, 64], [-498, -156, 50]]) });
    lobeCluster(F, { key: 'R', ground: 0, w: 6, tuck: 0.6, region: DUSTFILL(), kage: [4], lobes: lob([
      [150, -18, 33], [206, -38, 51], [272, -55, 64], [351, -70, 80], [440, -64, 85], [514, -42, 62], [562, -16, 32],
      [302, -126, 48], [398, -152, 60], [476, -128, 40]]) });
    specks(F, [
      { p: [-470, -282], dot: true }, { p: [-660, -170], ang: 200, len: 16 }, { p: [-352, -236], ang: -118, len: 11 },
      { p: [420, -262], dot: true, w: 5.5 }, { p: [598, -150], ang: -24, len: 18 }, { p: [636, -50], ang: 8, len: 22 },
    ]);
    seq.push(F.build({ hold: 2 }));
  }
  // D3: break-up. The masses tear into separate clusters that lift off the ground; lit sides open.
  {
    const F = new Fig('dust-3');
    const fill = DUSTFILL({ crescent: 0.24, litFade: 0, opacity: 0.85, retreat: 1.3 });
    lobeCluster(F, { key: 'A', w: 5.8, tuck: 0.55, drop: 0.18, region: fill, kage: [1], lobes: lob([[-604, -150, 54], [-540, -172, 64], [-498, -122, 44], [-572, -104, 40]]) });
    lobeCluster(F, { key: 'B', w: 5.4, tuck: 0.4, drop: 0.25, region: fill, level: 0.9, lobes: lob([[-362, -72, 38], [-322, -58, 27], [-396, -50, 25]]) });
    lobeCluster(F, { key: 'C', w: 5, tuck: 0.3, drop: 0.35, level: 0.8, lobes: lob([[-722, -62, 29], [-697, -40, 21]]) });
    lobeCluster(F, { key: 'D', w: 5.8, tuck: 0.55, drop: 0.18, region: fill, kage: [1], lobes: lob([[502, -162, 58], [560, -140, 47], [456, -120, 40], [520, -106, 37]]) });
    lobeCluster(F, { key: 'E', w: 5.4, tuck: 0.4, drop: 0.25, region: fill, level: 0.9, lobes: lob([[322, -76, 34], [352, -56, 25]]) });
    lobeCluster(F, { key: 'Fz', w: 5, tuck: 0.3, drop: 0.35, level: 0.8, lobes: lob([[662, -52, 27], [641, -33, 17]]) });
    specks(F, [
      { p: [-470, -300], dot: true, w: 5.5, level: 0.8 }, { p: [-780, -128], ang: 150, len: 12, level: 0.8 },
      { p: [430, -286], ang: 110, len: 10, level: 0.8 }, { p: [742, -96], dot: true, w: 5, level: 0.75 },
    ]);
    seq.push(F.build({ hold: 3 }));
  }
  // D4: thinning out. Light, open arcs of the billows drift up and apart (their lit sides gone);
  // two specks settle.
  {
    const F = new Fig('dust-4');
    const o = { w: 4.8, tuck: 0.35, level: 0.6, wt: 0.85 };
    lobeCluster(F, Object.assign({}, o, { key: 'A', gaps: [[192, 292]], lobes: lob([[-630, -238, 50], [-574, -260, 40], [-546, -214, 30]]) }));
    lobeCluster(F, Object.assign({}, o, { key: 'B', gaps: [[168, 300]], level: 0.55, lobes: lob([[-430, -168, 34], [-399, -178, 25]]) }));
    lobeCluster(F, Object.assign({}, o, { key: 'C', gaps: [[140, 330]], level: 0.48, lobes: lob([[-776, -122, 26]]) }));
    lobeCluster(F, Object.assign({}, o, { key: 'D', gaps: [[205, 290]], lobes: lob([[586, -258, 48], [632, -238, 34], [548, -226, 28]]) }));
    lobeCluster(F, Object.assign({}, o, { key: 'E', gaps: [[160, 305]], level: 0.55, lobes: lob([[404, -160, 30]]) }));
    lobeCluster(F, Object.assign({}, o, { key: 'G', gaps: [[175, 320]], level: 0.48, lobes: lob([[726, -130, 22], [709, -139, 15]]) }));
    specks(F, [{ p: [-520, -40], dot: true, w: 5, level: 0.7 }, { p: [470, -22], dot: true, w: 4.6, level: 0.65 }, { p: [690, -176], ang: 70, len: 9, level: 0.6 }]);
    seq.push(F.build({ hold: 3 }));
  }
  return seq;
}

/* ============================================================ radial helpers */

/** irregular angles around a full turn (deg): uneven steps, the odd close pair and the odd gap */
function radialAngles(r, n, o) {
  o = o || {};
  const steps = [];
  for (let i = 0; i < n; i++) {
    let s = U(r, 0.35, 1.65);
    if (r() < (o.pair !== undefined ? o.pair : 0.18)) s *= 0.3;
    if (r() < (o.gap !== undefined ? o.gap : 0.08)) s *= 2.4;
    steps.push(s);
  }
  const tot = steps.reduce((a, b) => a + b, 0), out = [];
  let a = o.a0 !== undefined ? o.a0 : U(r, 0, 360);
  for (const s of steps) { out.push(a); a += (360 * s) / tot; }
  return out;
}

/** a radial stroke from radius r0 to r1 (drawn in that order) at angle a (deg), gently bowed */
function radial(r, a, r0, r1, bow, n) {
  const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R), len = r1 - r0, pts = [];
  n = n || Math.max(4, Math.ceil(Math.abs(len) / 60));
  for (let k = 0; k <= n; k++) {
    const t = k / n, rr = lerp(r0, r1, t), b = bow * Math.abs(len) * Math.sin(Math.PI * t);
    pts.push([ux * rr - uy * b, uy * rr + ux * b]);
  }
  return pts;
}

/** jagged star polygon: k irregular tips, valleys between them. Returns {pts, tips, valleys} (polar too) */
function star(r, o) {
  const angs = radialAngles(r, o.k, { pair: 0.08, gap: 0.12, a0: o.a0 });
  const pts = [], tips = [], valleys = [];
  for (let i = 0; i < angs.length; i++) {
    const a = angs[i], b = i + 1 < angs.length ? angs[i + 1] : angs[0] + 360;
    const rt = typeof o.rt === 'function' ? o.rt(a, i) : U(r, o.rt[0], o.rt[1]);
    const tip = [Math.cos(a * D2R) * rt, Math.sin(a * D2R) * rt];
    const va = lerp(a, b, U(r, 0.35, 0.65)), rv = typeof o.rv === 'function' ? o.rv(va, i) : U(r, o.rv[0], o.rv[1]);
    const val = [Math.cos(va * D2R) * rv, Math.sin(va * D2R) * rv];
    pts.push(tip, val);
    tips.push({ a, r: rt, p: tip });
    valleys.push({ a: va, r: rv, p: val });
  }
  return { pts, tips, valleys };
}

/** the star's outline with hand-curved sides: each side bows into its spike (thinner, sharper spikes) */
function starPath(S, r, cv) {
  const out = [], n = S.pts.length;
  for (let i = 0; i < n; i++) {
    const a = S.pts[i], b = S.pts[(i + 1) % n], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], ml = Math.hypot(m[0], m[1]) || 1;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), k = U(r, cv[0], cv[1]);
    const q = [m[0] - (m[0] / ml) * k * L, m[1] - (m[1] / ml) * k * L];
    const seg = quad(a, q, b, Math.max(4, Math.ceil(L / 16)));
    seg.pop();
    out.push(...seg);
  }
  return out;
}
/** an irregular blob (for paper left bare in the middle of a burst) */
function blob(r, cx, cy, rx, ry, n) {
  const out = [], ph = [U(r, 0, 6), U(r, 0, 6)], am = [U(r, 0.08, 0.16), U(r, 0.05, 0.1)];
  for (let i = 0; i < (n || 28); i++) {
    const a = (i / (n || 28)) * 2 * Math.PI, k = 1 + am[0] * Math.sin(2 * a + ph[0]) + am[1] * Math.sin(3 * a + ph[1]);
    out.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  return out;
}

/** distance from the origin to a polygon along angle a (deg); the nearest crossing */
function rayHit(poly, a) {
  const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R);
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1];
    const den = ux * ey - uy * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = (p[0] * ey - p[1] * ex) / den, s = (p[0] * uy - p[1] * ux) / den;
    if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
  }
  return best;
}

/** a polygon drawn as a few long pencil strokes that overlap where they meet (imperfect closure) */
function outlineStrokes(F, poly, o) {
  const r = F.rng('outline', o.key), n = poly.length, parts = o.parts || 2;
  let start = Math.floor(r() * n);
  const cuts = [0];
  for (let i = 1; i < parts; i++) cuts.push(Math.round((n * i) / parts + U(r, -1.5, 1.5)));
  cuts.push(n);
  for (let i = 0; i < parts; i++) {
    const pts = [];
    for (let k = cuts[i]; k <= cuts[i + 1]; k++) pts.push(poly[(start + k) % n]);
    // run on past the joint a little, or stop just short
    const last = pts[pts.length - 1], prev = pts[pts.length - 2], ov = U(r, -0.08, 0.16);
    pts.push([last[0] + (last[0] - prev[0]) * ov, last[1] + (last[1] - prev[1]) * ov]);
    let dense = H.resample(pts.filter((p, j) => j === 0 || Math.hypot(p[0] - pts[j - 1][0], p[1] - pts[j - 1][1]) > 0.5), 6);
    F.g(dense, Object.assign({ raw: true, taper: [U(r, 6, 14), U(r, 14, 30)], tip: [0.35, 0.1], wob: 1.0, per: 34 }, o.stroke,
      { wt: o.stroke && o.stroke.wt !== undefined ? o.stroke.wt : (u) => 1 + 0.25 * Math.sin(u * 7 + i * 2) }));
  }
}

/* ===================================================================== EMPHASIS */
// Anchor (0, 0): the ball's centre (ball figure units (462, 429)). Lines stop short of an elliptical
// clearing a little wider than the split ball (rx 560, ry 520) and point at the centre: drawn from
// the outside in, landing heavy and flicking off to a needle near the ball.
const EMPH_COLOURS = ['rose', 'sunset', 'gold', 'lilac', 'rose', 'sunset'];
function emphDrawing(name, o) {
  const F = new Fig(name, null, { eps: 0.7 }), r = F.rng('emph');
  const angs = radialAngles(r, o.n);
  angs.forEach((a, i) => {
    const ce = Math.cos(a * D2R), se = Math.sin(a * D2R), re = 1 / Math.sqrt((ce * ce) / (560 * 560) + (se * se) / (520 * 520));
    let r0 = re * U(r, o.reach[0], o.reach[1]);
    if (r() < 0.15) r0 *= U(r, 1.15, 1.45);
    const len = (o.len[0] + (o.len[1] - o.len[0]) * Math.pow(r(), 1.7)) * (r() < 0.1 ? 0.45 : 1);
    const pts = radial(r, a, r0 + len, r0, U(r, -0.022, 0.022));
    if (r() < o.colour) {
      F.c(pts, { color: EMPH_COLOURS[Math.floor(r() * EMPH_COLOURS.length)], width: U(r, 4.5, 7.5) * o.wMul, level: U(r, 0.62, 0.86) * o.lMul,
        taper: [U(r, 6, 14), len * U(r, 0.4, 0.55)], raw: true, wob: 0.7 });
      return;
    }
    const w0 = U(r, 6.5, 14) * o.wMul;
    const breaks = r() < o.breaks ? [[U(r, 0.25, 0.6), 0, 6]].map(([f]) => [f, f + U(r, 0.03, 0.08), 6]) : undefined;
    F.g(H.resample(pts, 16), { raw: true, w: [w0, w0 * 0.72, w0 * 0.38, 1.6], wt: [1.25, 1.1, 0.85, 0.65], taper: [U(r, 4, 12), len * U(r, 0.35, 0.6)],
      tip: [0.55, 0.04], level: U(r, 0.85, 1.08) * o.lMul, wob: 0.9, per: 70, breaks });
  });
  return F.build({ hold: 2 });
}
function emph() {
  return [
    emphDrawing('emph-1', { n: 54, reach: [1.0, 1.14], len: [150, 720], colour: 0.15, breaks: 0.1, wMul: 1, lMul: 1 }),
    emphDrawing('emph-2', { n: 50, reach: [1.0, 1.16], len: [150, 700], colour: 0.16, breaks: 0.12, wMul: 1, lMul: 1 }),
    emphDrawing('emph-3', { n: 34, reach: [1.14, 1.42], len: [110, 560], colour: 0.18, breaks: 0.3, wMul: 0.72, lMul: 0.78 }),
  ];
}

/* ===================================================================== IMPACT */
// Anchor (0, 0): the ball's centre. The two drawings are polarity flips of each other:
//   impact-1  "dark field": heavy graphite wedges crowd in from beyond the frame and stop on a jagged
//             burst-shaped clearing around the ball; the clearing is bare paper.
//   impact-2  "silhouette": the burst itself blacked in with broad heavy hatching around a ball-sized
//             hole, a heavy jagged outline, and a few heavy rays off the spike tips; outside is paper.
function impact() {
  const out = [];
  {
    const F = new Fig('impact-1', null, { eps: 1.0 }), r = F.rng('imp');
    const S = star(r, { k: 12, rt: [700, 1060], rv: [440, 490] });
    const SP = starPath(S, r, [0.04, 0.12]);
    const angs = radialAngles(r, 190, { pair: 0.22, gap: 0.04 });
    for (const a of angs) {
      let r0 = rayHit(SP, a) + U(r, -4, 26);
      if (r() < 0.07) r0 += U(r, 80, 240);
      const r1 = U(r, 2250, 2600), len = r1 - r0, w0 = U(r, 34, 84), mid = 0.55 + 0.35 * r();
      F.g(radial(r, a, r1, r0, U(r, -0.008, 0.008), 9), { raw: true, w: [w0, w0 * mid, w0 * 0.7 * mid, w0 * 0.42 * mid], wt: [1.45, 1.2],
        taper: [U(r, 10, 30), U(r, 45, 120)], tip: [0.6, 0.04], level: U(r, 1.15, 1.3), wob: 1.0, per: 90, wn: 0.03 });
    }
    out.push(F.build({ hold: 2 }));
  }
  {
    // F1 (QA round 1): the silhouette built from dense radial strokes, not a flat fill. Each stroke
    // starts under the knocked-out ball and flicks out to the burst's edge, so the silhouette is found
    // by stroke ends (ragged, some running past, some stopping short), with paper slivers between and
    // a pressure that varies stroke to stroke.
    const F = new Fig('impact-2', null, { eps: 1.0 }), r = F.rng('imp2');
    const S0 = star(r, { k: 12, rt: [920, 1360], rv: [560, 660] }), SP = starPath(S0, r, [0.03, 0.1]);
    const angs = radialAngles(r, 230, { pair: 0.25, gap: 0.03 });
    for (const a of angs) {
      const R1 = rayHit(SP, a);
      if (!isFinite(R1)) continue;
      const r0 = U(r, 360, 395), kind = r();
      const r1 = R1 + (kind < 0.18 ? U(r, 6, 34) : -U(r, 0, 42));         // the odd stroke runs past the edge
      if (r1 - r0 < 40) continue;
      const kw = U(r, 0.7, 1.3) * 0.046, w0 = kw * r0 * 0.8, w1 = kw * Math.min(r1, 950);
      const flick = kind < 0.4 ? U(r, 50, 120) : U(r, 12, 34);            // flicked out, or landed blunt
      F.g(radial(r, a + U(r, -0.3, 0.3), r0, r1, U(r, -0.012, 0.012), 6), { raw: true, w: [w0, w1], wt: 1.25,
        taper: [6, Math.min(flick, (r1 - r0) * 0.6)], tip: [0.8, 0.05], level: [0.78, 0.9, 1.02, 1.2][Math.floor(r() * 4)], wob: 0.9, per: 80, wn: 0.03 });
    }
    // a second, crossing layer only near the ball, so the field is darkest where the light breaks out
    for (let k = 0; k < 28; k++) {
      const a = U(r, 0, 360), r0 = U(r, 380, 420), r1 = r0 + U(r, 90, 230), w = U(r, 9, 16);
      F.g(radial(r, a, r0, r1, U(r, -0.05, 0.05), 3), { raw: true, w: [w, w * 0.7], wt: 1.15, taper: [6, (r1 - r0) * 0.5], tip: [0.7, 0.05], level: U(r, 0.8, 1.15), wob: 0.8, wn: 0.03 });
    }
    for (const tp of S0.tips) {
      const nn = r() < 0.55 ? 1 : r() < 0.6 ? 2 : 0;
      for (let k = 0; k < nn; k++) {
        const a = tp.a + U(r, -4, 4) + k * U(r, -9, 9), r0 = tp.r + U(r, 30, 110), r1 = U(r, 1900, 2500), w0 = U(r, 20, 46);
        F.g(radial(r, a, r1, r0, U(r, -0.01, 0.01), 7), { raw: true, w: [w0, w0 * 0.55, 1.8], wt: [1.4, 1.2, 0.9], taper: [U(r, 10, 24), (r1 - r0) * 0.45],
          tip: [0.6, 0.04], level: 1.2, wob: 1.2, per: 90 });
      }
    }
    out.push(F.build({ hold: 2 }));
  }
  return out;
}

/* ===================================================================== SPLIT BURST */
// Anchor (0, 0): the ball's centre (the crack's middle). A jagged "pop" shape bursting out of the
// crack as the halves part: a pale marker fill (flash) in a graphite outline, with coloured-pencil
// rays inside. Knockout on: it sits in front of the ball's broken edges.
function crackX(y) {   // the crack's centreline relative to the anchor
  const c = [[474, -14.1], [493, 59.8], [454, 133.7], [495, 207.5], [456, 281.4], [485, 355.3], [432, 429.2], [461, 503.1], [432, 577], [467, 650.9], [434, 724.7], [455, 798.6], [434, 872.5]]
    .map(([x, yy]) => [x - 462, yy - 429.2]);
  if (y <= c[0][1]) return c[0][0];
  for (let i = 0; i + 1 < c.length; i++) if (y <= c[i + 1][1]) return lerp(c[i][0], c[i + 1][0], (y - c[i][1]) / (c[i + 1][1] - c[i][1]));
  return c[c.length - 1][0];
}
const FLASH = (o) => Object.assign({ color: 'flash', shade: 'flashShade', litFade: 0.18, strokeAngle: 70, strokeWidth: 14 }, o || {});
function burstRays(F, r, S, o) {
  for (const tp of S.tips) {
    if (r() > o.p) continue;
    const a = tp.a + U(r, -5, 5), r0 = U(r, o.r0[0], o.r0[1]), r1 = tp.r * U(r, 0.55, 0.85);
    if (r1 - r0 < 30) continue;
    F.c(radial(r, a, r0, r1, U(r, -0.03, 0.03), 5), { color: ['sunset', 'gold', 'rose', 'gold'][Math.floor(r() * 4)], width: U(r, 5, 8), level: U(r, 0.6, 0.82),
      taper: [U(r, 10, 20), (r1 - r0) * 0.5], raw: true });
  }
}
function burst() {
  const out = [];
  // B1: the seam bursts. A tall narrow jag along the crack, spikes thrown left and right; the seam
  // itself is left as bare paper (the light), colour only toward the spikes.
  {
    const F = new Fig('burst-1'), r = F.rng('b1');
    const hwAt = (y) => 30 + 34 * Math.cos((y / 520) * Math.PI * 0.5);
    const side = (s) => {
      const pts = [];
      let y = s < 0 ? 470 : -500;
      const yEnd = s < 0 ? -500 : 470;
      while (s < 0 ? y > yEnd : y < yEnd) {
        const step = U(r, 46, 150), hw = hwAt(y), big = r() < 0.3 ? U(r, 120, 210) : U(r, 22, 110);
        const yt = y + (s < 0 ? -1 : 1) * step * U(r, 0.3, 0.7);
        const base = [crackX(y) + s * hw * U(r, 0.5, 0.95), y];
        const tip = [crackX(yt) + s * (hw + big * (0.55 + 0.45 * Math.cos((yt / 520) * Math.PI * 0.5))), yt + U(r, -38, 38)];
        if (pts.length) {   // the side into this spike bows inward a little
          const p = pts[pts.length - 1];
          pts.push(...quad(p, [lerp(p[0], base[0], 0.5) - s * U(r, 2, 10), lerp(p[1], base[1], 0.5)], base, 3).slice(1));
        } else pts.push(base);
        const mq = [lerp(base[0], tip[0], 0.5) - s * U(r, 4, 14) * (big / 100), lerp(base[1], tip[1], 0.5)];
        pts.push(...quad(base, mq, tip, 5).slice(1));
        y += s < 0 ? -step : step;
      }
      return pts;
    };
    // F2: the bolt's ends fork into thin uneven prongs (one big point read as a tooth)
    const xt = crackX(-500), xb = crackX(470);
    const top = [[xt - U(r, 46, 64), -592], [xt - U(r, 4, 12), -548], [xt + U(r, 6, 14), -628], [xt + U(r, 14, 22), -566], [xt + U(r, 50, 70), -606]];
    const bot = [[xb + U(r, 40, 58), 540], [xb + U(r, 6, 12), 512], [xb - U(r, 2, 8), 586], [xb - U(r, 14, 22), 522], [xb - U(r, 44, 60), 552]];
    const poly = [...top, ...side(1), ...bot, ...side(-1)];
    const seam = [];
    for (let y = -470; y <= 440; y += 30) seam.push([crackX(y) + U(r, 6, 16), y]);
    for (let y = 440; y >= -470; y -= 30) seam.push([crackX(y) - U(r, 6, 16), y]);
    F.region('flash', poly, FLASH({ litFade: 0, holes: [seam.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])] }));
    F.occluder(poly);
    outlineStrokes(F, poly, { key: 'b1', parts: 2, stroke: { w: 6.2, level: 0.95 } });
    for (let k = 0; k < 7; k++) {
      const y0 = U(r, -420, 400), s = r() < 0.5 ? -1 : 1, x0 = crackX(y0) + s * U(r, 18, 30);
      F.c([[x0, y0], [x0 + s * U(r, 40, 100), y0 + U(r, -30, 30)]], { color: ['sunset', 'gold', 'rose'][k % 3], width: U(r, 5, 7.5), level: 0.72, taper: [10, 30] });
    }
    out.push(F.build({ hold: 2 }));
  }
  // B2: open. A broad jagged burst, long uneven spikes, rays laid in coloured pencil, a few ticks outside.
  {
    const F = new Fig('burst-2'), r = F.rng('b2');
    const S = star(r, { k: 11, rt: (a) => U(r, 470, 760) * (0.82 + 0.18 * Math.abs(Math.sin(a * D2R))), rv: [235, 330] });
    const SP = starPath(S, r, [0.05, 0.14]);
    const C = star(r, { k: 7, rt: [175, 250], rv: [95, 135] });
    const core = starPath(C, r, [0.04, 0.1]).map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
    F.region('flash', SP, FLASH({ holes: [core] }));
    F.occluder(SP);
    outlineStrokes(F, SP, { key: 'b2', parts: 3, stroke: { w: 6.8, level: 1.0 } });
    burstRays(F, r, S, { p: 0.85, r0: [150, 210] });
    for (const tp of S.tips) {
      if (r() > 0.4) continue;
      const a = tp.a + U(r, -6, 6), r0 = tp.r + U(r, 25, 60), len = U(r, 40, 110);
      F.g(radial(r, a, r0, r0 + len, 0), { raw: true, w: [6, 4], wt: [1.15, 0.8], taper: [3, len * 0.6], tip: [0.6, 0.05], level: 0.9, wob: 0.4 });
    }
    out.push(F.build({ hold: 2 }));
  }
  // B3: break-up (F2: no single leftover wedge). The burst tears into 4 small coloured remnants flung
  // outward, clear of the halves, each a different jagged shard; open chevrons and dashes further out.
  {
    const F = new Fig('burst-3'), r = F.rng('b3');
    const shards = [[-150, 720, 104], [-40, 680, 86], [26, 760, 74], [146, 710, 96], [216, 790, 66]];   // [angle, radius, size]
    shards.forEach(([a0, rr, s], k) => {
      const a = a0 + U(r, -6, 6), ux = Math.cos(a * D2R), uy = Math.sin(a * D2R), px = -uy, py = ux;
      const c = [ux * rr, uy * rr], spin = U(r, -0.6, 0.6);
      // a jagged 4-5 point shard, pointing outward (the way it flies), thin at the trailing end
      const n = 6 + (k % 2), pts = [];
      for (let i = 0; i < n; i++) {
        const t = ((i + U(r, -0.25, 0.25)) / n) * 2 * Math.PI + spin;
        const rad = s * (i === 0 ? U(r, 1.0, 1.25) : i % 2 ? U(r, 0.22, 0.4) : U(r, 0.5, 0.85));
        const lx = Math.cos(t) * rad, ly = Math.sin(t) * rad * U(r, 0.45, 0.7);
        pts.push([c[0] + ux * lx + px * ly, c[1] + uy * lx + py * ly]);
      }
      const loop = [];
      for (let i = 0; i < n; i++) {
        const p = pts[i], q = pts[(i + 1) % n], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const qq = [m[0] + (c[0] - m[0]) * U(r, 0.05, 0.22), m[1] + (c[1] - m[1]) * U(r, 0.05, 0.22)];
        quad(p, qq, q, 4).slice(0, -1).forEach((v) => loop.push(v));
      }
      F.region('shard' + k, loop, FLASH({ litFade: 0, crescent: 0, opacity: 0.9, inset: -1 }));
      F.occluder(loop);
      const closed = loop.concat([loop[0], loop[1]]);
      F.g(H.resample(closed, 4), { raw: true, w: 5.2, wt: (u) => 0.85 + 0.3 * Math.sin(u * 6.28 + k), taper: [6, 8], tip: [0.35, 0.2], level: 0.9, wob: 0.5, per: 18 });
      // a speed tick trailing behind it
      if (k % 2 === 0) F.g(radial(r, a + U(r, -3, 3), rr - s * 1.1, rr - s * 1.1 - U(r, 50, 90), 0, 2), { raw: true, w: [4.6, 2], wt: [1, 0.7], taper: [4, 30], tip: [0.5, 0.05], level: 0.8, wob: 0.3 });
    });
    // open chevrons further out (spike ends that lost their fill)
    for (const a0 of [-100, -8, 70, 118, 182, 252]) {
      const a = a0 + U(r, -8, 8), rr = U(r, 820, 980), ux = Math.cos(a * D2R), uy = Math.sin(a * D2R), px = -uy, py = ux;
      const half = U(r, 18, 34), tip = [ux * (rr + U(r, 60, 110)), uy * (rr + U(r, 60, 110))];
      const b1 = [ux * rr + px * half, uy * rr + py * half], b2 = [ux * rr - px * half, uy * rr - py * half];
      const ch = quad(b1, [lerp(b1[0], tip[0], 0.5) - px * half * 0.3, lerp(b1[1], tip[1], 0.5) - py * half * 0.3], tip, 5)
        .concat(quad(tip, [lerp(b2[0], tip[0], 0.5) + px * half * 0.3, lerp(b2[1], tip[1], 0.5) + py * half * 0.3], b2, 5).slice(1));
      F.g(r() < 0.35 ? ch.slice(0, 6) : ch, { raw: true, w: 4.6, wt: (u) => 0.75 + 0.3 * Math.sin(Math.PI * u), taper: [8, 14], tip: [0.3, 0.08], level: 0.72, wob: 0.5 });
    }
    for (let k = 0; k < 8; k++) {
      const a = U(r, 0, 360), r0 = U(r, 600, 900), len = U(r, 22, 50);
      F.c(radial(r, a, r0, r0 + len, 0, 3), { color: ['sunset', 'gold', 'rose'][k % 3], width: U(r, 4.5, 6.5), level: 0.7, taper: [6, len * 0.5], raw: true });
    }
    out.push(F.build({ hold: 3 }));
  }
  return out;
}

/* ===================================================================== SPARKLES */
// F3 (QA round 1): sparkles live at fixed sites. Each site has a 3-drawing life the director staggers:
//   1 tick   a small flicked tick with a nick across it: the glint arriving
//   2 glint  four separate arms flicked out from the centre (long vertical, short sides, a tilt), a
//            coloured-pencil pass beside the long arm and two tiny diagonal glints: never a closed outline
//   3 cross  stretched thin and broken at the middle, coloured pencil only: the glint going out
// Anchor (0, 0): the sparkle's own centre. Sites are suggested around a ~720 x 460 logo.
function flick(F, from, ang, len, o) {   // one arm, flicked out from near the centre
  const a = ang * D2R, ux = Math.cos(a), uy = Math.sin(a), r = F.rng('fl', from[0], from[1], ang);
  const b = U(r, -0.06, 0.06) * len, pts = [];
  for (let k = 0; k <= 4; k++) { const t = k / 4, bb = b * Math.sin(Math.PI * t); pts.push([from[0] + ux * len * t - uy * bb, from[1] + uy * len * t + ux * bb]); }
  if (o.colour) return F.c(pts, { color: o.colour, width: o.w, level: o.level || 0.8, taper: [len * 0.12, len * 0.7], raw: true, wob: 0.25 });
  return F.g(pts, { raw: true, w: [o.w, o.w * 0.8, o.w * 0.45], wt: [1.2, 1.0, 0.75], taper: [len * 0.08, len * 0.72], tip: [0.55, 0.03], level: o.level || 1, wob: 0.25 });
}
const SITES = [
  // name, suggested site (logo-centre units), long arm, tilt, colours [arms (null = graphite), pass, cross]
  { name: 'sparkleA', at: [-482, -252], s: 128, tilt: -8, arms: null, pass: 'gold', cross: 'gold' },
  { name: 'sparkleB', at: [446, -304], s: 104, tilt: 9, arms: 'rose', pass: 'rose', cross: 'rose' },
  { name: 'sparkleC', at: [594, 74], s: 86, tilt: -4, arms: null, pass: 'lilac', cross: 'lilac' },
  { name: 'sparkleD', at: [-604, 82], s: 70, tilt: 13, arms: 'gold', pass: 'sunset', cross: 'sunset' },
];
function sparkleLife(site) {
  const out = [], s = site.s, t = site.tilt;
  // 1. tick
  {
    const F = new Fig(site.name + '-1', null, { q: 0.1 }), r = F.rng('t');
    const L = s * 0.52, a = t - 90 + U(r, -5, 5);
    flick(F, [U(r, -2, 2), L * 0.42], a, L, { w: 5.2, level: 0.95, colour: site.arms });
    const n = s * 0.2;
    F.c([[-n, U(r, -3, 3)], [n * 0.9, U(r, -3, 3)]], { color: site.pass, width: 4.6, level: 0.8, taper: [n * 0.5, n * 0.7], wob: 0.2 });
    out.push(F.build({ hold: 3 }));
  }
  // 2. glint
  {
    const F = new Fig(site.name + '-2', null, { q: 0.1 }), r = F.rng('g');
    const arms = [[t - 90, s * U(r, 1.0, 1.12)], [t + 90, s * U(r, 0.68, 0.84)], [t + 180, s * U(r, 0.42, 0.56)], [t, s * U(r, 0.48, 0.62)]];
    for (const [a, L] of arms) {
      const g = U(r, 0.04, 0.09) * s, aa = a + U(r, -4, 4);
      flick(F, [Math.cos(aa * D2R) * g, Math.sin(aa * D2R) * g], aa, L, { w: site.arms ? 6.4 : 6.6, level: 1.0, colour: site.arms });
    }
    // a coloured-pencil pass laid beside the long arms, not reaching the tips
    for (const [a, L, off] of [[t - 90, s * 0.78, 5], [t + 90, s * 0.55, -5]]) {
      const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R);
      F.c([[-uy * off + ux * s * 0.1, ux * off + uy * s * 0.1], [-uy * off * 1.3 + ux * L, ux * off * 1.3 + uy * L]], { color: site.pass, width: U(r, 6, 8), level: 0.72, taper: [10, L * 0.5] });
    }
    for (const a of [t - 45 + U(r, -8, 8), t + 135 + U(r, -8, 8)]) {   // two tiny secondary glints
      const r0 = s * U(r, 0.2, 0.28), L = s * U(r, 0.12, 0.18);
      flick(F, [Math.cos(a * D2R) * r0, Math.sin(a * D2R) * r0], a, L, { w: 3.6, level: 0.75, colour: site.cross });
    }
    out.push(F.build({ hold: 3 }));
  }
  // 3. cross: stretched thin, broken at the middle, colour only
  {
    const F = new Fig(site.name + '-3', null, { q: 0.1 }), r = F.rng('c');
    for (const [a, L, gap] of [[t - 90, s * 1.28, 0.1], [t + 90, s * 0.96, 0.08], [t + 180, s * 0.5, 0.1], [t, s * 0.58, 0.12]]) {
      const ux = Math.cos(a * D2R), uy = Math.sin(a * D2R), g = gap * s;
      F.c([[ux * g, uy * g], [ux * (g + L) * 0.5 + U(r, -1.5, 1.5), uy * (g + L) * 0.5], [ux * L, uy * L]], { color: site.cross, width: 3.8, level: 0.72, taper: [L * 0.15, L * 0.6], wob: 0.2 });
    }
    if (!site.arms) flick(F, [0, -s * 0.12], t - 90, s * 0.5, { w: 3.4, level: 0.55 });
    out.push(F.build({ hold: 3 }));
  }
  return out;
}

/* ===================================================================== TAP */
// Anchor (0, 0): the tap point. F4: five drawings (land, burst, fly, break, fade) so it can be held on
// 3s, and ~1.5x the presence of v1. `tapColour` is the same burst in coloured pencil over paper-coloured
// eraser strokes (knockout), so it reads on dark fills (the ball, the logo).
function strokePoly(pts, hw, halo) {   // outline of a tapered stroke, for an eraser knockout
  const P = H.resample(pts, 3), nn = H.normals(P), n = P.length, L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), h = (hw + halo) * Math.pow(Math.min(1, u / 0.22, (1 - u) / 0.5), 0.8) + halo * 0.25;
    L.push([P[i][0] + nn[i][0] * h, P[i][1] + nn[i][1] * h]);
    Rr.push([P[i][0] - nn[i][0] * h, P[i][1] - nn[i][1] * h]);
  }
  return L.concat(Rr.reverse());
}
function tapSeq(colour) {
  const r = R('tap', 'layout'), n = 9;
  const angs = radialAngles(r, n, { pair: 0.15, gap: 0.12 });
  const pal = ['gold', 'rose', 'flashShade', 'sunset', 'gold', 'rose', 'lilac', 'gold', 'sunset'];
  const cols = angs.map((_, i) => (colour ? pal[i] : r() < 0.25 ? ['rose', 'gold', 'sunset'][Math.floor(r() * 3)] : null));
  const lens = angs.map(() => U(r, 0.75, 1.3));
  const out = [];
  const stages = [
    { r0: [18, 26], len: [34, 52], w: 5.4, level: 1.0, ring: [[16, 200, 230, 0.8]] },
    { r0: [40, 54], len: [56, 86], w: 5.6, level: 1.0, ring: [[34, 280, 120, 0.7]] },
    { r0: [78, 96], len: [50, 76], w: 4.8, level: 0.88, broken: 0.3, ring: [[66, 300, 70, 0.55], [70, 120, 56, 0.5]] },
    { r0: [118, 134], len: [24, 42], w: 4.2, level: 0.74, broken: 0.45, dots: 0.2 },
    { r0: [148, 164], len: [8, 18], w: 3.6, level: 0.58, dots: 0.45, skip: 0.35 },
  ];
  stages.forEach((sg, k) => {
    const F = new Fig((colour ? 'tapc-' : 'tap-') + (k + 1), 'tap-' + (k + 1), { q: 0.1 }), q = F.rng('st');
    const tick = (pts, i, w, lvl) => {
      if (colour) {
        F.occluder(strokePoly(pts, w * 0.5, 2.2));
        F.c(pts, { color: cols[i], width: w * 1.05, level: Math.min(0.95, lvl * 0.95), taper: [w * 2, w * 5], raw: true, wob: 0.3 });
      } else if (cols[i]) F.c(pts, { color: cols[i], width: w * 0.95, level: 0.82 * (lvl + 0.1), taper: [w * 2, w * 5], raw: true, wob: 0.3 });
      else F.g(pts, { raw: true, w: [w * 0.75, w, w * 0.8, w * 0.45], wt: [0.95, 1.15, 0.95, 0.75], taper: [w * 1.6, w * 5], tip: [0.25, 0.04], level: lvl, wob: 0.3 });
    };
    angs.forEach((a0, i) => {
      if (sg.skip && q() < sg.skip) return;
      const a = a0 + U(q, -6, 6), r0 = U(q, sg.r0[0], sg.r0[1]) * (0.85 + 0.15 * lens[i]), len = U(q, sg.len[0], sg.len[1]) * lens[i];
      if (sg.dots && q() < sg.dots) {
        const p = radial(q, a, r0 + len * 0.5, r0 + len * 0.5, 0, 1)[0];
        if (colour) { F.occluder(blob(q, p[0], p[1], 5.5, 4.6, 12)); F.c([[p[0] - 1.5, p[1]], [p[0] + 1.5, p[1] + 1]], { color: cols[i], width: 5, level: 0.9, taper: [1, 1] }); }
        else F.dot(p[0], p[1], { w: 4.6, level: 0.75 });
        return;
      }
      if (sg.broken && q() < sg.broken) {
        const cut = U(q, 0.4, 0.6);
        tick(radial(q, a, r0, r0 + len * cut, 0, 2), i, sg.w, sg.level);
        tick(radial(q, a, r0 + len * (cut + 0.2), r0 + len * 1.1, 0, 2), i, sg.w * 0.85, sg.level * 0.9);
        return;
      }
      tick(radial(q, a, r0, r0 + len, U(q, -0.07, 0.07), 4), i, sg.w, sg.level);
    });
    for (const [rad, a0, sweep, lvl] of sg.ring || []) {   // a loose ring, never closed
      const arc = [], sq = U(q, 0.9, 1.1);
      for (let a = a0; a <= a0 + sweep; a += 5) { const rr = rad * (1 + 0.05 * Math.sin(a * D2R * 2 + sq)); arc.push([Math.cos(a * D2R) * rr * sq, Math.sin(a * D2R) * rr]); }
      if (colour) { F.occluder(strokePoly(arc, sg.w * 0.4, 2)); F.c(arc, { color: 'gold', width: sg.w * 0.85, level: lvl, taper: [10, 16], raw: true, wob: 0.15 }); }
      else F.g(arc, { raw: true, w: sg.w * 0.75, wt: [0.75, 1.0, 0.8], taper: [10, 16], tip: [0.3, 0.05], level: lvl, wob: 0.15, per: 40 });
    }
    out.push(F.build({ hold: k < 2 ? 2 : 3 }));
  });
  return out;
}

/* ===================================================================== TRAILS */
// Anchor (0, 0): the moving part's trailing edge, centred; +x is the direction of travel, so rotate
// the drawing to the motion. Speed lines stream back from the part; two drawings to alternate in flight.
function trail(name, o) {
  const out = [];
  for (let d = 0; d < 2; d++) {
    const F = new Fig(`${name}-${d + 1}`), r = F.rng('tr');
    const n = o.n + (d ? -1 : 0);
    const offs = [];
    for (let i = 0; i < n; i++) offs.push(lerp(-o.spread, o.spread, (i + U(r, -0.35, 0.35)) / (n - 1)));
    offs.forEach((y0, i) => {
      const x0 = -U(r, 6, 40) - Math.abs(y0) * o.lag, len = U(r, o.len[0], o.len[1]) * (1 - 0.35 * Math.abs(y0) / o.spread), y1 = y0 * U(r, 0.85, 1.0);
      const pts = [[x0, y0], [x0 - len * 0.5, lerp(y0, y1, 0.5) + U(r, -2, 2)], [x0 - len, y1]];
      if (r() < o.colour) F.c(pts, { color: o.col, width: U(r, 4.5, 6.5), level: 0.75, taper: [6, len * 0.6], wob: 0.5 });
      else { const w0 = U(r, 0.75, 1.05) * o.w; F.g(pts, { w: [w0, w0 * 0.6, 1.6], wt: [1.2, 0.95, 0.7], taper: [U(r, 4, 10), len * 0.6], tip: [0.55, 0.04], level: U(r, 0.82, 1.0), wob: 0.8, per: 80 }); }
    });
    out.push(F.build({ hold: 2 }));
  }
  return out;
}

/* ===================================================================== REPLAY */
// Anchor (0, 0): the icon's centre. A circular arrow drawn in two strokes (the loop clockwise from the
// top, then the arrowhead as one chevron), ~110 units across: render at scale = 44 / 110 * dpr for a
// 44 CSS px button. Heavier on the lower right, lighter where it starts.
function replay() {
  const F = new Fig('replay', null, { q: 0.1 }), r = F.rng('rp');
  const a0 = -52, a1 = 250, pts = [], nz = H.noise1(r, 40);
  for (let a = a0; a <= a1; a += 4) {
    const t = (a - a0) / (a1 - a0), rr = 41 * (1 + 0.035 * nz(a)) * (1 + 0.04 * Math.sin((a + 30) * D2R)) - 2 * t;
    pts.push([Math.cos(a * D2R) * rr * 1.03, Math.sin(a * D2R) * rr]);
  }
  F.g(pts, { raw: true, w: [6.5, 8.5, 9, 8], wt: (u) => 0.85 + 0.45 * Math.max(0, Math.sin((u * 302 + a0 - 330) * D2R)), taper: [10, 4], tip: [0.3, 0.6], level: 1.05, wob: 0.6, per: 30 });
  // arrowhead at the loop's end, pointing clockwise (to the right, a touch up)
  const e = pts[pts.length - 1], ta = (a1 + 90) * D2R, tx = Math.cos(ta), ty = Math.sin(ta);
  const tip = [e[0] + tx * 15, e[1] + ty * 15 - 1];
  const back = (side) => { const ang = Math.atan2(ty, tx) + Math.PI + side * 0.72; return [tip[0] + Math.cos(ang) * (side > 0 ? 22 : 19), tip[1] + Math.sin(ang) * (side > 0 ? 22 : 19)]; };
  const b1 = back(1), b2 = back(-1);
  F.g([b1, [lerp(b1[0], tip[0], 0.55), lerp(b1[1], tip[1], 0.55) + 0.8], tip, [lerp(b2[0], tip[0], 0.5), lerp(b2[1], tip[1], 0.5)], b2],
    { raw: true, w: 7.6, wt: [0.95, 1.2, 1.25, 1.15, 0.95], taper: [5, 7], tip: [0.45, 0.25], level: 1.05, wob: 0.3 });
  return F.build({ hold: 0, penSpeed: 420 });
}

/* ===================================================================== write */
function main() {
  const fx = {
    version: 1,
    dust: dust(),
    emph: emph(),
    impact: impact(),
    burst: burst(),
    sparkleA: sparkleLife(SITES[0]),
    sparkleB: sparkleLife(SITES[1]),
    sparkleC: sparkleLife(SITES[2]),
    sparkleD: sparkleLife(SITES[3]),
    tap: tapSeq(false),
    tapColour: tapSeq(true),
    trailLid: trail('trail-lid', { n: 8, spread: 350, lag: 0.15, len: [200, 460], colour: 0.2, col: 'teal', w: 7.5 }),
    trailBow: trail('trail-bow', { n: 6, spread: 95, lag: 0.3, len: [220, 520], colour: 0.25, col: 'pink', w: 6.5 }),
    replay: replay(),
  };
  // Placement and timing per sequence. `on`: the host figure and the point (in its units) the anchor
  // sits on; render the FX with the host's scale at x = hostX + on.at[0] * scale (same for y).
  // `holds`: 24 fps frames per drawing (also on each figure as .hold). Full guide: style/fx-NOTES.md.
  fx.meta = {
    dust: { on: { fig: 'ball', at: [462, 832] }, anchor: 'ground contact under the ball', holds: [2, 2, 3, 3], layers: { knockout: true }, play: 'once, starting on the landing squash drawing' },
    emph: { on: { fig: 'ball', at: [462, 429.2] }, anchor: 'ball centre', holds: [2, 2, 2], play: 'cycle 1-2 on 2s while the light pours out, end on 3' },
    impact: { on: { fig: 'ball', at: [462, 429.2] }, anchor: 'ball centre', holds: [2, 2], play: 'once, between the crack write-on and the split; see notes.impact' },
    sparkleA: { on: { fig: 'logo', at: [-482, -252], from: 'logo centre' }, anchor: 'sparkle centre', holds: [3, 3, 3] },
    sparkleB: { on: { fig: 'logo', at: [446, -304], from: 'logo centre' }, anchor: 'sparkle centre', holds: [3, 3, 3] },
    sparkleC: { on: { fig: 'logo', at: [594, 74], from: 'logo centre' }, anchor: 'sparkle centre', holds: [3, 3, 3] },
    sparkleD: { on: { fig: 'logo', at: [-604, 82], from: 'logo centre' }, anchor: 'sparkle centre', holds: [3, 3, 3] },
    burst: { on: { fig: 'ball', at: [462, 429.2] }, anchor: 'ball centre (middle of the crack)', holds: [2, 2, 3], layers: { knockout: true }, play: 'once, with the first split drawings (split ~0.25, 0.6, 0.9)' },
    sparkle: { alias: 'sparkleA', sites: ['sparkleA', 'sparkleB', 'sparkleC', 'sparkleD'], anchor: 'each sparkle\'s own centre', holds: [3, 3, 3],
      play: 'per site: tick, glint, cross, then 2-6 drawings off; start the sites 1-2 drawings apart and re-roll the gap each cycle so no two sites peak together' },
    tap: { on: { fig: 'page', at: 'tap point' }, anchor: 'tap point', holds: [2, 2, 3, 3, 3], play: 'once per tap (land, burst, fly, break, fade)' },
    tapColour: { on: { fig: 'page', at: 'tap point' }, anchor: 'tap point', holds: [2, 2, 3, 3, 3], layers: { knockout: true }, play: 'use instead of tap when the tap lands on a dark fill (ball, logo): coloured ticks on paper eraser strokes' },
    trailLid: { on: { fig: 'box', at: 'lid trailing edge' }, anchor: 'trailing edge centre; +x = direction of travel (rotate)', holds: [2, 2], play: 'alternate 1-2 on fast flight drawings' },
    trailBow: { on: { fig: 'box', at: 'bow trailing edge' }, anchor: 'trailing edge centre; +x = direction of travel (rotate)', holds: [2, 2], play: 'alternate 1-2 on fast flight drawings' },
    replay: { on: { fig: 'page', at: 'button centre' }, anchor: 'icon centre; ~110 units across: scale = 44 / 110 CSS px per unit', holds: [], play: 'write it on with draw 0..1 (penSpeed 420: ~0.9 s), then boil on 3 seeds' },
  };
  fx.notes = {
    units: '100 = one ruled-line spacing, pen ~7 units, as the figures. Every drawing is a pencil.js figure {strokes, style} authored around its anchor at (0, 0), plus anchor, size [w, h] and hold.',
    exposure: 'Each drawing gets a new boil seed and a +-0.5-1 unit registration (reg) like every other drawing. Hold FX drawings; never tween or scale them.',
    impact: 'Drawing 1 (dark field): paper + impact[0] + the ball at color 0, layers line only, weight ~1.25, crack fully drawn. Drawing 2 (silhouette): paper + impact[1] + the ball with layers {knockout: true, line: true, colour: false, shadow: false, construction: false}. Hide the background, ground and everything else on both. 2 frames each, then cut straight back to full colour on the first split drawing.',
    multiples: 'For flight drawings where the part moves more than ~half its size: render it 2 extra times at 1/3 and 2/3 of the way back to the previous drawing position, alpha 0.4 (nearer) and 0.2 (farther), color 0.35, weight 0.8, layers {construction: false, shadow: false}, using `only: part`. Optionally add trailLid/trailBow rotated to the travel direction.',
    colour: 'Coloured-pencil FX marks (style.marks) and graphite are colour-dial independent; dust and burst fills are marker regions that follow `color` (designed at 0.64).',
    sparkle: 'Four fixed sites, sparkleA-D, each a 3-drawing life: tick, glint, cross (3s each), then off for 2-6 drawings. Place each at logo centre + meta.sparkleX.on.at. Stagger the sites 1-2 drawings apart and re-roll the off gap each cycle; at most two sites lit at once. `sparkle` = sparkleA for older callers.',
    tap: 'tap: 5 drawings (land, burst, fly, break, fade), holds 2,2,3,3,3. tapColour: the same burst in coloured pencil over paper eraser strokes; render with layers {knockout: true} when the tap lands on a dark fill (ball, logo, ground shadow). Same anchor and timing, so the two can swap per tap.',
  };
  const body = JSON.stringify(fx);
  const js = '// Generated by jaden-work/tools/fx/build.js. Edit the generator, not this file.\n' +
    '// Hand-drawn FX drawings for pencil.js; see jaden-work/style/fx-NOTES.md.\n' +
    'window.JADEN = window.JADEN || {};\nwindow.JADEN.fx = ' + body + ';\n' +
    '// `sparkle` is site A (kept for older callers); each site is its own 3-drawing life.\nwindow.JADEN.fx.sparkle = window.JADEN.fx.sparkleA;\n';
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, js);
  const sizes = Object.entries(fx).filter(([k, v]) => Array.isArray(v)).map(([k, v]) => `${k}:${v.length}`).join(' ');
  console.log(`wrote ${OUT} (${(js.length / 1024).toFixed(0)} KB) ${sizes}`);
}
main();
