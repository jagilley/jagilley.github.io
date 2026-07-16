/* ═══════════════════════════════════════════════════════════════════════════
   ISOLATION HARNESS BUILDER for the scrolldeck Overlap-QA loop.

   It extracts every diagram SVG (those with role="img") from a scrolldeck HTML
   file and writes each one into a standalone, high-DPI-renderable harness that:
     • includes the shared arrowhead <defs> markers (referenced by url(#ah-*)),
     • sets the same --sans font + `.diagram text` rule,
     • forces all scroll animations to their FINAL, fully-visible state,
     • uses the correct background (dark for the hero, white for panels).

   Each SVG becomes its own file so QA subagents can edit them in parallel with
   zero edit contention. orig-N.txt holds the exact original block for splice-back.

   USAGE:
     node isolate_and_render.js /abs/path/to/deck.html /abs/path/to/outdir [darkIndices]
   e.g.
     node isolate_and_render.js .../forward-self-models-visual.html .../svg-check 0
   (darkIndices = comma-separated 0-based indices of SVGs that sit on the dark
    hero/outro background; default "0". Everything else renders on white.)
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs');
const path = require('path');

const MAIN = process.argv[2];
const DIR  = process.argv[3];
const dark = new Set((process.argv[4] || '0').split(',').filter(s => s !== '').map(Number));
if (!MAIN || !DIR) { console.error('usage: node isolate_and_render.js <deck.html> <outdir> [darkIndices]'); process.exit(1); }
fs.mkdirSync(DIR, { recursive: true });

const h = fs.readFileSync(MAIN, 'utf8');

// the shared marker <defs> block (width="0" height="0"); every diagram references it
const markersMatch = h.match(/<svg width="0" height="0"[\s\S]*?<\/svg>/);
const markers = markersMatch ? markersMatch[0] : '';
if (!markers) console.warn('WARNING: no shared <defs> marker block found — arrowheads may be missing.');

// every diagram carries role="img"; the marker block does not
const svgs = h.match(/<svg\b[^>]*role="img"[\s\S]*?<\/svg>/g) || [];
console.log('diagram SVGs found:', svgs.length);

svgs.forEach((s, i) => {
  const label = (s.match(/aria-label="([^"]*)"/) || [, '(no aria-label!)'])[1];
  console.log(`  [${i}] ${label.slice(0, 76)}`);
  fs.writeFileSync(path.join(DIR, `orig-${i}.txt`), s);
  const bg = dark.has(i) ? '#1E293B' : '#ffffff';
  const html =
`<!doctype html><html><head><meta charset="utf-8"><style>
  :root{ --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,Roboto,sans-serif; }
  body{ margin:0; background:${bg}; }
  .wrap{ width:820px; max-width:96vw; margin:0 auto; padding:40px; box-sizing:border-box; }
  .diagram text{ font-family:var(--sans); }
  .diagram svg{ width:100%; height:auto; display:block; }
  /* force every scroll animation to its final, fully-visible state (mirrors the
     page's own reduced-motion/noscript rules — note .anim-fade keeps its transform) */
  .reveal,.anim-fade,.anim-grow,.anim-growx{ opacity:1 !important; }
  .reveal,.anim-grow,.anim-growx{ transform:none !important; }
  .anim-draw{ stroke-dashoffset:0 !important; }
</style></head><body>
${markers}
<div class="wrap diagram in-view">
${s}
</div>
</body></html>`;
  fs.writeFileSync(path.join(DIR, `svg-${i}.html`), html);
});
console.log(`\nwrote ${svgs.length} harness file(s) to ${DIR}`);
console.log('render each with (2x DPI):');
console.log(`  CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"`);
console.log(`  for f in ${DIR}/svg-*.html; do "$CHROME" --headless=new --disable-gpu --hide-scrollbars \\`);
console.log(`    --force-device-scale-factor=2 --window-size=900,1400 \\`);
console.log(`    --screenshot="\${f%.html}.png" --virtual-time-budget=3000 "file://$f"; done`);

/* ── SPLICE-BACK (run after QA agents finish; each agent left its fixes in svg-N.html) ──
   const main0 = fs.readFileSync(MAIN,'utf8'); let main = main0;
   for (const i of CHANGED_INDICES) {
     const orig = fs.readFileSync(path.join(DIR,`orig-${i}.txt`),'utf8');
     const fixed = fs.readFileSync(path.join(DIR,`svg-${i}.html`),'utf8').match(/<svg\b[^>]*role="img"[\s\S]*?<\/svg>/)[0];
     if (!main.includes(orig)) throw new Error(`orig block ${i} not found in main`);
     main = main.replace(orig, fixed);
   }
   fs.writeFileSync(MAIN, main);
*/
