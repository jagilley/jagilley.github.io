#!/usr/bin/env node
/*
 * Live run of jaden.html in headless Chrome: plays the page in real time, taps on a script, and logs
 * the state machine and render cost. Checks the parts seek() can't: autoplay, tap fast-forward, keyboard,
 * narration, re-render-only-on-change, final-state tap bursts and the replay button.
 *
 *   node jaden-work/tools/anim/live.mjs [--size 390x844] [--dpr 2] [--throttle 4] [--query rm=1] [--shots DIR]
 *
 * --throttle N  CPU slowdown (Chrome's DevTools throttling; 4 approximates a mid-range phone)
 * --watch       let the sketch-in play out (no fast-forward tap)
 * --quick       tap through each idle as soon as it allows (default: linger 2.5 s on the present and the ball)
 * --shots DIR   also screenshot after each step.
 * At the end it prints, per shot, how many distinct drawings were shown out of how many the sheet holds.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');
const argv = process.argv.slice(2), arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const [W, H] = arg('--size', '1440x900').split('x').map(Number), dpr = +arg('--dpr', 1), query = arg('--query', ''), shotDir = arg('--shots', null), throttle = +arg('--throttle', 1);
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

const B = await launch();
const quick = argv.includes('--quick'), linger = quick ? 1 : 2.5;
const t0 = Date.now();
if (throttle > 1) await B.cmd('Emulation.setCPUThrottlingRate', { rate: throttle });
await B.open(pathToFileURL(path.join(REPO, 'jaden.html')).href + (query ? '?' + query : ''), W, H, dpr);
const wait = ms => new Promise(r => setTimeout(r, ms));
const snap = async (label) => {
  const s = await B.evaluate(`({ state: __jaden.state, id: __jaden.drawing && __jaden.drawing.id, stats: __jaden.stats,
    live: document.getElementById('live').textContent, label: document.getElementById('scene').getAttribute('aria-label'),
    replay: document.getElementById('replay').classList.contains('on') })`);
  const st = s.stats;
  console.log(`${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${label.padEnd(26)} state=${s.state.padEnd(9)} drawing=${(s.id || '').padEnd(14)} renders=${String(st.renders).padStart(4)} avg=${st.avg.toFixed(1)}ms max=${st.max.toFixed(1)}ms >41ms=${st.slow} replay=${s.replay}`);
  if (s.live) console.log(`        live: "${s.live}"`);
  if (shotDir) await B.screenshot(path.join(shotDir, `${label.replace(/\W+/g, '_')}.png`));
  return s;
};
const cx = W / 2, cy = H / 2;
const until = async (st, minClock = 0, ms = 30000) => {   // wait for a state (and some time in it)
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await B.evaluate(`__jaden.state === ${JSON.stringify(st)} && __jaden.clock >= ${minClock}`)) return true;
    await wait(100);
  }
  console.log(`        TIMEOUT waiting for ${st}`); return false;
};

await snap('loaded');
await wait(1500); await snap('sketch 1.5s');
if (!argv.includes('--watch') && await B.evaluate('__jaden.state') === 'sketch') { await B.tap(cx, cy); await wait(100); await snap('tap: fast-forward'); }
await until('present'); await snap('present');
await until('present', 3.2); const idle = await snap('present idle (hop seen)');
const r0 = idle.stats.renders; await wait(1000);
const r1 = (await snap('present, 1 s later')).stats.renders;
console.log(`        renders in 1 s of idle: ${r1 - r0} (boil at 8 fps, hop drawings on 2s: expect <= ~12)`);
await B.key('Enter'); await wait(300); await snap('Enter: open');
await until('ball', linger); await snap('ball idle');
await B.key(' '); await wait(200); await snap('Space: crack');
await until('greeting'); await snap('greeting');
await until('final'); await snap('final');
await B.tap(cx * 0.6, cy * 0.5); await wait(120); await snap('final tap burst');
await until('final', 4.5); const fin = await snap('replay visible?');
if (fin.replay) {
  const r = await B.evaluate(`(() => { const b = document.getElementById('replay').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; })()`);
  await B.tap(r[0], r[1]); await wait(300); await snap('replay clicked');
}
const slow = await B.evaluate('__jaden.stats.slowList');
if (slow && slow.length) console.log('        slow renders: ' + slow.join(', '));
const drops = await B.evaluate('__jaden.drops');
for (const d of drops || []) console.log(`        ${d.shot.padEnd(9)} drawings shown ${String(d.shown).padStart(4)} / ${String(d.expected).padStart(4)}  (${(100 * d.shown / d.expected).toFixed(0)}%)  wall ${d.wall.toFixed(2)} s for ${d.dur.toFixed(2)} s`);
B.close();
process.exit(0);
