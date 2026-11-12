// --- runtime helpers (appended verbatim by build_bg.py) ---------------------------------------------
(function (bg) {
  'use strict';
  const T = (pts, dx, dy) => pts.map((p) => [p[0] + dx, p[1] + dy].concat(p.slice(2)));
  /** Look up an element figure: bg.fig('sun') or bg.fig('wash', 'dusk'). */
  bg.fig = function (name, set) { return (set === 'dusk' ? bg.dusk : bg.elements)[name]; };
  /** World placement {x, y} of an element's anchor, with optional overrides, e.g. bg.layout.tall. */
  bg.place = function (name, over) {
    const p = (over && over[name]) || bg.layout.place[name] || [0, 0];
    return { x: p[0], y: p[1] };
  };
  /**
   * The dusk set at drawing `k` of the wash (0 = nothing yet, layout.duskBeats.length = all of it).
   * Each dusk figure is a set of marker passes (Pencil `accents`) laid one after another; a pass is drawn
   * on over 2-3 drawings. Returns, per dusk figure:
   *   S.opts[el]   the render options for that drawing: {accent, accentAmount, groups}. Use these.
   *   S[el]        groups only (passes not started are hidden), kept for the old call; it does not show
   *                a pass in progress, so prefer S.opts.
   *   S.progress[el]  [[group, 0..1], ...] per pass, for anything else that wants it.
   *   Pencil.render(ctx, bg.dusk[el], Object.assign({seed, color, ...placement of el}, S.opts[el]))
   */
  bg.duskState = function (k) {
    const B = bg.layout.duskBeats, prog = {};
    for (let i = 0; i < Math.min(Math.floor(k), B.length); i++) for (const [el, g, f] of B[i]) {
      const P = (prog[el] = prog[el] || {});
      P[g] = Math.max(P[g] || 0, f === undefined ? 1 : f);
    }
    const out = { opts: {}, progress: {} };
    for (const el in bg.dusk) {
      const st = bg.dusk[el].style, order = st.washOrder, P = prog[el] || {}, groups = {};
      const passes = (st.accents && st.accents[st.accentSet]) || [];
      let amount = 0;
      out.progress[el] = order.map((g) => [g, P[g] || 0]);
      order.forEach((g) => {
        const f = P[g] || 0;
        if (f <= 0) groups[g] = { visible: false };
        // a pass is one or more legs (accents) laid in turn: its span runs from its first leg to its last
        let a0 = 1, a1 = 0;
        for (const ac of passes) if (ac.group === g) { a0 = Math.min(a0, ac.span[0]); a1 = Math.max(a1, ac.span[1]); }
        if (f > 0 && a1 >= a0) amount = Math.max(amount, a0 + f * (a1 - a0));
      });
      out[el] = groups;
      out.opts[el] = { accent: st.accentSet, accentAmount: amount, groups };
    }
    return out;
  };
  /**
   * Where the sun is at wash drawing `k` as it sets: held key positions (layout.sunset), each move made
   * as one inbetween drawing (a little past halfway, a slow-in) and then the key. tall: the portrait keys.
   * Render the hills and the horizon with layers.knockout so the land hides the sun as it goes down.
   */
  bg.sunAt = function (k, tall) {
    const keys = bg.layout.sunset[tall ? 'tall' : 'wide'], n = bg.layout.duskBeats.length;
    const u = Math.max(0, Math.min(1, k / n));
    let p = keys[0];
    for (let i = 1; i < keys.length; i++) {
      const prev = keys[i - 1], key = keys[i], step = 1 / n;   // the inbetween is the drawing before the key
      if (u >= key[0]) p = key;
      else if (u >= key[0] - step) { p = [key[0], prev[1] + 0.62 * (key[1] - prev[1]), prev[2] + 0.62 * (key[2] - prev[2])]; break; }
      else break;
    }
    return [p[1], p[2]];
  };
  /**
   * The suggested sketch-in, as Pencil `build` options per element at `ms` into a phase:
   *   phase 'roughs'  (before the box writes on): horizon and hill lines, quick and light
   *   phase 'details' (after the box is finished): sun, clouds, trees, grass, then the colour
   * Returns {element: build | null}; null = not started (don't render it). Elements finished in an
   * earlier phase come back as {} (complete). Quantise `ms` to the drawing rate (on 2s/3s) before calling.
   */
  bg.sketchAt = function (phase, ms) {
    const plan = bg.layout.sketchIn, out = {};
    const phases = Object.keys(plan), pi = phases.indexOf(phase);
    for (const ph of phases) for (const st of plan[ph]) out[st.el] = null;   // everything in the plan starts unseen
    for (let i = 0; i <= pi; i++) for (const st of plan[phases[i]]) {
      const b = out[st.el] || (out[st.el] = { line: 0, construct: 0, color: 0, shadow: 0, _started: false });
      const u = i < pi ? 1 : Math.max(0, Math.min(1, (ms - st.at) / st.ms));
      if (u > 0) b._started = true;
      for (const k of st.what.split(',')) b[k] = Math.max(b[k], u);
    }
    for (const el in out) {
      const b = out[el];
      if (!b || !b._started) { out[el] = null; continue; }
      delete b._started;
      if (b.line >= 1 && b.construct >= 1 && b.color >= 1 && b.shadow >= 1) out[el] = {};
    }
    return out;
  };
  /**
   * Merge several elements into ONE figure, already placed in world units, so a static or boiling
   * background costs one Pencil.render (one colour pass, one graphite pass) instead of one per element.
   *   bg.merge([['sky'], ['sun', {x, y}], ['wash', null, 'dusk'], ...])   (null placement = default)
   * Ids and groups get an "<element>:" prefix: groups {'sun:sun': {alpha}} or draw {'cloudA:cloudA-top1': 0.5}.
   * Cached by its argument list.
   */
  const cache = new Map();
  bg.merge = function (items) {
    const key = JSON.stringify(items);
    if (cache.has(key)) return cache.get(key);
    const out = { strokes: { figure: 'bg-merged', strokes: [] }, style: {
      figure: 'bg-merged', bounds: [Infinity, Infinity, -Infinity, -Infinity], designSeed: 89, palette: bg.palette,
      groups: {}, lines: {}, extraStrokes: [], second: [], regions: {}, regionOrder: [], shadows: [], highlights: [],
      marks: [], construction: [], occluders: [], colorStrokes: [], penSpeed: 2000 } };
    const S = out.style;
    for (const it of items) {
      const name = it[0], set = it[2], f = bg.fig(name, set), st = f.style;
      const pl = it[1] || bg.place(name), dx = pl.x || 0, dy = pl.y || 0, P = name + ':';
      const g = (n) => P + (n || 'all');
      for (const k in st.groups) {
        const d = st.groups[k];
        S.groups[P + k] = { parent: d.parent ? P + d.parent : null, pivot: [d.pivot[0] + dx, d.pivot[1] + dy] };
      }
      for (const s of f.strokes.strokes) out.strokes.strokes.push({ id: P + s.id, group: g(s.group), closed: s.closed, pts: T(s.pts, dx, dy) });
      for (const id in st.lines) S.lines[P + id] = Object.assign({}, st.lines[id], { group: g(st.lines[id].group) });
      for (const e of st.extraStrokes || []) S.extraStrokes.push(Object.assign({}, e, { id: P + e.id, group: g(e.group), pts: T(e.pts, dx, dy) }));
      for (const s of st.second || []) S.second.push(Object.assign({}, s, { stroke: P + s.stroke }));
      for (const r of st.regionOrder) {
        const R = st.regions[r];
        S.regions[P + r] = Object.assign({}, R, { group: g(R.group), polys: R.polys.map((q) => T(q, dx, dy)),
          holes: R.holes ? R.holes.map((q) => T(q, dx, dy)) : undefined, frontOf: R.frontOf ? P + R.frontOf : undefined });
        S.regionOrder.push(P + r);
      }
      for (const sh of st.shadows || []) S.shadows.push(Object.assign({}, sh, { id: P + sh.id, group: g(sh.group),
        polys: (sh.polys || []).map((q) => T(q, dx, dy)), on: (sh.on || []).map((o) => P + o), edge: (sh.edge || []).map((q) => T(q, dx, dy)),
        passes: sh.passes ? sh.passes.map((ps) => ({ pts: T(ps.pts, dx, dy), width: ps.width })) : undefined }));
      for (const m of st.marks || []) S.marks.push(Object.assign({}, m, { group: g(m.group), pts: T(m.pts, dx, dy) }));
      for (const c of st.construction || []) S.construction.push(Object.assign({}, c, { group: g(c.group), pts: T(c.pts, dx, dy) }));
      for (const c of st.colorStrokes || []) S.colorStrokes.push(Object.assign({}, c, { id: P + c.id, group: g(c.group), pts: T(c.pts, dx, dy) }));
      const b = st.bounds;
      S.bounds = [Math.min(S.bounds[0], b[0] + dx), Math.min(S.bounds[1], b[1] + dy), Math.max(S.bounds[2], b[2] + dx), Math.max(S.bounds[3], b[3] + dy)];
    }
    cache.set(key, out);
    return out;
  };
})(window.JADEN.bg);
