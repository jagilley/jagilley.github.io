#!/usr/bin/env node
/*
 * One still of any local page, at an exact viewport, with headless Chrome over the DevTools protocol
 * (Node >= 22, no dependencies). For review pages and static figures, which have no seek hook.
 *
 *   node still.mjs --page PATH --out FILE.png [--size 1200x800] [--dpr 2] [--query "color=0.64"]
 *                  [--ready "window.__ready"] [--wait 200]
 *
 * --ready EXPR   a JS expression that turns true when the page has drawn (default: the load event)
 * --wait MS      extra settle time after that (default 200)
 *
 * Run one of these at a time: each launches its own Chrome.
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const page = arg('--page'), out = arg('--out');
if (!page || !out) { console.error('usage: node still.mjs --page PATH --out FILE.png [--size WxH] [--dpr N] [--query Q] [--ready EXPR] [--wait MS]'); process.exit(2); }
const [W, H] = arg('--size', '1200x800').split('x').map(Number), query = arg('--query', '');

const B = await launch();
try {
  await B.open(pathToFileURL(path.resolve(page)).href + (query ? '?' + query : ''), W, H, +arg('--dpr', 2), arg('--ready', 'true'));
  await new Promise(r => setTimeout(r, +arg('--wait', 200)));
  await B.screenshot(path.resolve(out));
  console.log(`wrote ${out}`);
} finally {
  B.close();
}
process.exit(0);
