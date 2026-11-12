/*
 * The exposure-sheet core of the first piece's page, excerpted for reading. It is not a module and will
 * not run as it stands: it is the part of that page worth copying into a new one. The page around it held
 * the cast, the storyboard (one sheet per shot), the camera, the renderer calls, the state machine and the
 * seek hook (see tools/capture.mjs for what the hook exposes).
 *
 * The idea: every shot is an exposure sheet, a list of drawings, each a complete pose of the scene held for
 * a whole number of frames at 24 fps (on 1s, 2s or 3s). Nothing is evaluated between drawings. Slow-in and
 * slow-out come from where the inbetweens sit on a spacing chart; anticipation, squash and stretch, overshoot,
 * multiples and impact frames are separate drawings. A held drawing boils through three drawings at 8 fps.
 * Each drawing has its own seed, a hair of registration error and a slightly different amount of colour.
 *
 * Names from the page that appear below: FPS = 24; COLOR = the resting colour (0.64); RM = reduced motion;
 * WO = write-on step in frames (1, or 2 behind a flag); shot(name) returns {sheet, loop, ...} for a shot.
 */

/* ═══ small maths ═══════════════════════════════════════════════════════ */
function hs(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return h >>> 0;
}
const rnd = (...k) => hs(k.join('|')) / 4294967296;   // deterministic 0..1 from a key
const sym = (...k) => rnd(...k) * 2 - 1;
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const lerp = (a, b, t) => a + (b - a) * t;
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/* ═══ exposure sheets ═══════════════════════════════════════════════════
 * A row is one drawing: [frames held, pose]. Poses are written as deltas, merged per actor onto the drawing
 * before. `to()` places inbetweens on a spacing chart. Row options:
 *   still        no boil even if long          held   boil even if short (a hold split into rows)
 *   wo           {path: [from, to, step?, max?]} write-ons inside the row (the end value stays written)
 *   tremble      [a0, a1] the ball shakes on 1s, the amplitude ramping   act / land  hop bookkeeping
 *   pre          pre-render this drawing during the ball idle (the climax) */
function merge(a, b) {
  if (!isObj(b)) return b === undefined ? a : b;
  const o = isObj(a) ? Object.assign({}, a) : {};
  for (const k in b) o[k] = isObj(b[k]) && isObj(o[k]) ? merge(o[k], b[k]) : b[k];
  return o;
}
function mix(a, b, u) {
  if (typeof a === 'number' && typeof b === 'number') return a + (b - a) * u;
  if (isObj(a) && isObj(b)) { const o = Object.assign({}, a); for (const k in b) o[k] = mix(a[k], b[k], u); return o; }
  return b;
}
function setPath(o, path, v) {   // copy-on-write set of a dotted path
  const ks = path.split('.'), root = Object.assign({}, o);
  let cur = root;
  for (let i = 0; i < ks.length - 1; i++) { cur[ks[i]] = Object.assign({}, cur[ks[i]]); cur = cur[ks[i]]; }
  cur[ks[ks.length - 1]] = v;
  return root;
}
class Sheet {
  constructor(base) { this.rows = []; this.cur = base; this.len = 0; }
  d(n, delta, opt) {            // one drawing, held n frames
    this.cur = merge(this.cur, delta || {});
    this.rows.push({ f0: this.len, n, pose: this.cur, opt: opt || {}, i: this.rows.length });
    this.len += n;
    if (opt && opt.wo) for (const k in opt.wo) { const w = opt.wo[k]; this.cur = setPath(this.cur, k, w[3] !== undefined ? Math.min(w[3], w[1]) : w[1]); }
    return this;
  }
  to(delta, chart, n) {         // inbetweens toward a key, one per chart entry, each held n frames
    const A = this.cur, B = merge(A, delta);
    chart.forEach((u, k) => this.d(Array.isArray(n) ? n[k] : n, mix(A, B, u)));
    return this;
  }
  pad3() { const r = this.rows[this.rows.length - 1], x = (3 - this.len % 3) % 3; r.n += x; this.len += x; return this; }   // next row starts on a boil beat
  at(f) {
    const R = this.rows; let lo = 0, hi = R.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (R[m].f0 <= f) lo = m; else hi = m - 1; }
    return R[lo];
  }
}

/* ═══ a shot is written as drawings: this is the present's hop (a box with a bow, ground at y = 0) ═══ */
function hop(s) {   // ballistic: quick off the ground, slow over the top (on 3s), quick down; the bow follows through
  s.d(2, { box: { sx: 1.04, sy: 0.94, bow: { rot: 0.03 } } }, { act: 1 });
  s.d(2, { box: { sx: 1.09, sy: 0.88, bow: { rot: 0.07 } } }, { act: 1 });
  s.d(2, { box: { y: -60, sx: 0.93, sy: 1.1, rot: -0.02, bow: { rot: 0.13 }, ground: { s: 0.88, a: 0.82 } } }, { act: 1 });
  s.d(2, { box: { y: -101, sx: 0.97, sy: 1.05, rot: -0.033, bow: { rot: 0.1 }, ground: { s: 0.77, a: 0.7 } } }, { act: 1 });
  s.d(3, { box: { y: -116, sx: 1, sy: 1, rot: -0.03, bow: { rot: 0.02 }, ground: { s: 0.74, a: 0.66 } } }, { act: 1 });
  s.d(3, { box: { y: -106, rot: -0.012, bow: { rot: -0.07 } } }, { act: 1, still: 1 });
  s.d(2, { box: { y: -70, sx: 0.97, sy: 1.05, rot: 0.01, bow: { rot: -0.1 }, ground: { s: 0.8, a: 0.72 } } }, { act: 1 });
  s.d(2, { box: { y: 0, sx: 1.12, sy: 0.85, rot: 0, bow: { rot: -0.17 }, ground: { s: 1.06, a: 1 } } }, { land: 1 });
  s.d(2, { box: { sx: 0.96, sy: 1.05, lid: { y: -7 }, bow: { rot: 0.13 } } });                 // rebound, the lid lifts a hair
  s.d(3, { box: { sx: 1.025, sy: 0.975, lid: { y: 0 }, bow: { rot: -0.07 } } });
  s.d(3, { box: { sx: 1, sy: 1, bow: { rot: 0.03 } } });
  s.d(3, { box: { bow: { rot: 0 } } });
}

/* ═══ a drawing: the pose on a frame, with its seed, registration and colour ═══════════════════════ */
function drawingAt(name, t, rt) {
  const S = shot(name), len = S.sheet.len;
  let f = Math.floor(t * FPS + 1e-6);
  f = S.loop ? ((f % len) + len) % len : Math.max(0, Math.min(len - 1, f));
  const row = S.sheet.at(f), lf = f - row.f0;
  const boil = !RM && (row.n >= 4 || row.opt.held) && !row.opt.still;
  const ph = boil && !(rt && rt.freeze) ? Math.floor(f / 3) % 3 : 0;   // the boil: three drawings cycled at 8 fps
  let pose = row.pose, key = '', ukey = '';
  if (row.opt.wo) for (const k in row.opt.wo) {
    const [a, b, step0, max] = row.opt.wo[k], step = step0 || WO;
    const u = RM ? 1 : Math.min(1, (Math.floor(lf / step) + 1) * step / row.n);
    const v = max !== undefined ? Math.min(max, a + (b - a) * u) : a + (b - a) * u;
    pose = setPath(pose, k, v); key += '|' + k + v.toFixed(4);
    if (k.slice(0, 5) !== 'text.') ukey += '|' + k + v.toFixed(4);
  }
  if (row.opt.tremble && !RM) {   // the ball shakes on 1s, harder as the crack runs
    const [a0, a1] = row.opt.tremble, amp = lerp(a0, a1, lf / Math.max(1, row.n - 1));
    pose = setPath(pose, 'ball.x', (lf % 2 ? -1 : 1) * amp * (0.85 + 0.15 * rnd(name, row.i, lf)));
    pose = setPath(pose, 'ball.rot', (lf % 2 ? 1 : -1) * amp * 0.0012);
    key += '|t' + lf; ukey += '|t' + lf;
  }
  const id = `${name}:${row.i}` + (boil ? '.' + ph : '');
  const seed = RM ? 1 : boil ? 1 + ph : 1 + (row.i % 6);
  const cseed = RM ? 0 : boil ? 1 + (hs(name) % 3) : 1 + (row.i % 4);   // the marker re-rolled per new drawing, not per boil
  const D = { shot: name, t, f, row, id, seed, cseed, boil, pose, key: id + key, ukey: (pose.rest ? 'rest' : id) + ukey + '|s' + seed };
  return D;
}
// registration: each drawing sits a hair off where the last one sat (units, radians); at rest, per boil drawing
function regOf(D, fig) {
  if (RM) return null;
  const k = D.pose.rest ? 'rest' + D.seed : D.id;
  return [sym(k, fig, 'x') * 0.8, sym(k, fig, 'y') * 0.8, sym(k, fig, 'r') * 0.0012];
}
function colourOf(seed, fig, boil) {
  if (RM) return COLOR;
  return COLOR + sym(seed, fig, 'c') * (boil ? 0.012 : 0.03);
}
