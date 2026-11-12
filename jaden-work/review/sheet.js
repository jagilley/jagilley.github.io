// The "together" sheet: all three figures on one piece of paper at their true relative sizes
// (all extracts share units: 100 = one ruled-line spacing). Used by index.html and export.html.
(function () {
  const SHEET = [2000, 1500];
  const LAYOUT = [
    { fig: 'box', x: 60, y: 70 },
    { fig: 'ball', x: 1010, y: 40 },
    { fig: 'text', x: 300, y: 960 },
  ];
  function drawTogether(ctx, W, H, opts) {
    const s = Math.min(W / SHEET[0], H / SHEET[1]);
    const ox = (W - SHEET[0] * s) / 2, oy = (H - SHEET[1] * s) / 2;
    Pencil.paper(ctx, 0, 0, W, H, { scale: s });
    for (const L of LAYOUT) {
      Pencil.render(ctx, JADEN[L.fig], Object.assign({}, opts, { x: ox + L.x * s, y: oy + L.y * s, scale: s }));
    }
  }

  // The ball cracked into two halves: now built into the renderer (opts.crack = {draw, split, ...}).
  function crackLine(crack) { return crack || JADEN.ball.style.crack; }
  function renderBall(ctx, opts, split, crack, crackDraw) {
    const ck = {};
    if (split) ck.split = split;
    if (crackDraw !== undefined) ck.draw = crackDraw;
    if (crack) ck.pts = crack;
    Pencil.render(ctx, JADEN.ball, split || crackDraw !== undefined ? Object.assign({}, opts, { crack: ck }) : opts);
  }

  window.Sheet = { drawTogether, renderBall, crackLine, SHEET, LAYOUT };
})();
