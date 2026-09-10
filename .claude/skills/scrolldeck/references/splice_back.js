/* ═══════════════════════════════════════════════════════════════════════════
   SPLICE-BACK for the scrolldeck Overlap-QA loop.

   After the QA subagents finish, each svg-N.html in the harness dir holds a
   (possibly) corrected <svg>. This puts every changed one back into the deck,
   matching on the exact original block saved in orig-N.txt.

   USAGE:  node splice_back.js /abs/path/to/deck.html /abs/path/to/harness-dir
   Prints which indices actually changed. Throws if an original block can no
   longer be found in the deck (i.e. you edited that SVG in the deck meanwhile —
   re-run isolate_and_render.js instead of splicing stale fixes).
   ═══════════════════════════════════════════════════════════════════════════ */
const fs = require('fs'), path = require('path');
const MAIN = process.argv[2], DIR = process.argv[3];
if (!MAIN || !DIR) { console.error('usage: node splice_back.js <deck.html> <harness-dir>'); process.exit(1); }
let main = fs.readFileSync(MAIN, 'utf8');
const n = fs.readdirSync(DIR).filter(f => /^orig-\d+\.txt$/.test(f)).length;
const changed = [];
for (let i = 0; i < n; i++) {
  const orig = fs.readFileSync(path.join(DIR, `orig-${i}.txt`), 'utf8');
  const fixed = fs.readFileSync(path.join(DIR, `svg-${i}.html`), 'utf8').match(/<svg\b[^>]*role="img"[\s\S]*?<\/svg>/)[0];
  if (orig === fixed) continue;
  if (!main.includes(orig)) throw new Error(`orig block ${i} not found in deck — it was edited after isolation`);
  main = main.replace(orig, fixed); changed.push(i);
}
fs.writeFileSync(MAIN, main);
console.log('spliced changed SVGs:', changed.length ? changed.join(',') : '(none)');
