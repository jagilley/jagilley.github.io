#!/usr/bin/env node
/*
 * Frame capture for jaden.html: renders exact drawings with headless Chrome over the DevTools
 * protocol (Node >= 22, no dependencies), using the page's deterministic window.__jaden.seekShot().
 *
 *   node jaden-work/tools/anim/capture.mjs [options] frames...
 *
 * frames (any mix; times are sampled mid-frame):
 *   open:0.5            a shot and a time in seconds into it
 *   open:0-2.4@12       a range, sampled at 12 per second (12 = every drawing on 2s)
 *   open:f14            frame 14 of the shot (24 fps);  open:f0-40@2  every 2nd frame from 0 to 40
 *   @9.25               a time on the canonical auto-play timeline (__jaden.seek)
 *   all@4               every shot, start to end, 4 samples per second
 *
 * options:
 *   --sizes 390x844,1440x900   viewports in CSS px (default 1440x900)
 *   --dpr 2                    device pixel ratio (default 1)
 *   --out DIR                  output directory (default: the session scratchpad or ./anim-out)
 *   --sheet [COLS]             also write one contact sheet per size (cells labelled shot:t / drawing id)
 *   --cell 360                 contact-sheet cell width in px
 *   --no-frames                with --sheet: keep only the sheets (saves disk)
 *   --query "rm=1&wo=2"        extra page query (rm=1 reduced motion, wo=2 write-ons on 2s, logo=official ...)
 *   --page PATH                page to load (default: jaden.html at the repo root)
 *   --list                     print the shot list and exit
 *   --bench                    print each frame's warm render cost (ms, averaged over 5 renders)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { launch } from './cdp.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../../..');

/* ---------- args ---------- */
const argv = process.argv.slice(2);
const opt = { sizes: '1440x900', dpr: 1, out: null, sheet: 0, cell: 360, frames: [], query: '', page: path.join(REPO, 'jaden.html'), list: false, bench: false, noFrames: false };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--sizes') opt.sizes = argv[++i];
  else if (a === '--dpr') opt.dpr = +argv[++i];
  else if (a === '--out') opt.out = argv[++i];
  else if (a === '--sheet') { const n = +argv[i + 1]; if (n > 0) { opt.sheet = n; i++; } else opt.sheet = 4; }
  else if (a === '--cell') opt.cell = +argv[++i];
  else if (a === '--query') opt.query = argv[++i];
  else if (a === '--page') opt.page = path.resolve(argv[++i]);
  else if (a === '--list') opt.list = true;
  else if (a === '--bench') opt.bench = true;
  else if (a === '--no-frames') opt.noFrames = true;
  else opt.frames.push(a);
}
opt.out = opt.out || path.join(process.env.TMPDIR || os.tmpdir(), 'jaden-anim');
fs.mkdirSync(opt.out, { recursive: true });
const sizes = opt.sizes.split(',').map(s => s.split('x').map(Number));

/* ---------- chrome ---------- */
const B = await launch();
const { cmd, evaluate } = B, cleanup = B.close;
const load = (w, h) => B.open(pathToFileURL(opt.page).href + '?qa=1' + (opt.query ? '&' + opt.query : ''), w, h, opt.dpr);

/* ---------- frame list ---------- */
await load(...sizes[0]);
const shots = await evaluate('window.__jaden.shots');
if (opt.list) {
  for (const s of shots) console.log(`${s.name.padEnd(10)} start ${s.start.toFixed(2).padStart(6)} s  dur ${s.dur.toFixed(2).padStart(5)} s${s.loop ? '  (loops until tap)' : ''}`);
  cleanup(); process.exit(0);
}
const frames = [];
const r3 = v => Math.round(v * 1000) / 1000;
for (const f of opt.frames) {
  let m;
  // times are sampled mid-frame ((frame + 0.5) / 24) so a sample never lands on a drawing boundary
  const mid = fr => (fr + 0.5) / 24;
  if ((m = f.match(/^all@([\d.]+)$/))) {
    for (const s of shots) for (let fr = 0; fr < s.dur * 24 - 1e-6; fr += 24 / +m[1]) frames.push({ shot: s.name, t: r3(mid(Math.floor(fr))) });
  } else if ((m = f.match(/^@([\d.]+)$/))) frames.push({ global: +m[1] });
  else if ((m = f.match(/^([a-z]+):f(\d+)-(\d+)(?:@(\d+))?$/))) {   // open:f0-40@2 = every 2nd frame
    for (let fr = +m[2]; fr <= +m[3]; fr += +(m[4] || 1)) frames.push({ shot: m[1], t: mid(fr) });
  } else if ((m = f.match(/^([a-z]+):f(\d+)$/))) frames.push({ shot: m[1], t: mid(+m[2]) });
  else if ((m = f.match(/^([a-z]+):([\d.]+)-([\d.]+)@([\d.]+)$/))) {
    const [a, b, fps] = [+m[2], +m[3], +m[4]];
    for (let fr = Math.floor(a * 24); fr <= b * 24 + 1e-6; fr += 24 / fps) frames.push({ shot: m[1], t: r3(mid(Math.floor(fr))) });
  } else if ((m = f.match(/^([a-z]+):([\d.]+)$/))) frames.push({ shot: m[1], t: +m[2] });
  else { console.error('bad frame spec', f); }
}

/* ---------- capture ---------- */
const written = [];
for (const [w, h] of sizes) {
  await load(w, h);
  const cells = [];
  for (const fr of frames) {
    const info = await evaluate(fr.global !== undefined ? `window.__jaden.seek(${fr.global})` : `window.__jaden.seekShot(${JSON.stringify(fr.shot)}, ${fr.t})`);
    const shot = fr.shot || info.shot, t = fr.t !== undefined ? fr.t : info.t;
    const label = `${shot}:${t.toFixed(3)}`;
    const shotPng = await cmd('Page.captureScreenshot', { format: 'png' });
    const name = `${w}x${h}_${shot}_${t.toFixed(3)}.png`;
    if (!opt.noFrames) { fs.writeFileSync(path.join(opt.out, name), Buffer.from(shotPng.data, 'base64')); written.push(name); }
    if (opt.bench) console.log(`${w}x${h} ${label.padEnd(16)} ${info.id.padEnd(18)} warm ${(await evaluate(`window.__jaden.bench(${JSON.stringify(shot)}, ${t}, 5)`)).toFixed(1)} ms`);
    if (opt.sheet) cells.push({ label: `${label}  ${info.id}`, data: shotPng.data });
  }
  if (opt.sheet && cells.length) {
    // compose the contact sheet in the same browser: a grid of the frames, each labelled
    const cols = Math.min(opt.sheet, cells.length), cw = opt.cell, ch = Math.round(cw * h / w), lab = 18;
    const rows = Math.ceil(cells.length / cols), W = cols * (cw + 6) + 6, H = rows * (ch + lab + 6) + 6;
    await cmd('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
    const loaded = B.once('Page.loadEventFired');
    await cmd('Page.navigate', { url: 'about:blank' }); await loaded;
    await evaluate(`(async () => {
      const cells = ${JSON.stringify(cells)};
      document.body.style.cssText = 'margin:0;background:#555;font:12px/18px ui-monospace,Menlo,monospace;color:#eee';
      const g = document.createElement('div');
      g.style.cssText = 'display:grid;grid-template-columns:repeat(${cols}, ${cw}px);gap:6px;padding:6px';
      document.body.appendChild(g);
      await Promise.all(cells.map(c => new Promise(r => {
        const d = document.createElement('div'), im = new Image();
        im.style.cssText = 'display:block;width:${cw}px;height:${ch}px'; im.onload = r; im.src = 'data:image/png;base64,' + c.data;
        const l = document.createElement('div'); l.textContent = c.label; l.style.cssText = 'height:${lab}px;overflow:hidden;white-space:nowrap';
        d.appendChild(im); d.appendChild(l); g.appendChild(d);
      })));
    })()`);
    const png = await cmd('Page.captureScreenshot', { format: 'png' });
    const name = `sheet_${w}x${h}${frames.length && frames[0].shot ? '_' + frames[0].shot : ''}.png`;
    fs.writeFileSync(path.join(opt.out, name), Buffer.from(png.data, 'base64'));
    written.push(name);
  }
}
console.log(`wrote ${written.length} file(s) to ${opt.out}`);
for (const n of written.slice(-8)) console.log('  ' + n);
cleanup();
process.exit(0);
