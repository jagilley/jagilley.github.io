#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   CDP RENDER HARNESS — drive headless Chrome over the DevTools protocol with
   nothing but Node's built-in WebSocket (Node ≥ 22). No puppeteer, no npm.

   Why: a plain `chrome --screenshot` sees one static state and waits on every
   CDN asset. A visual essay has figures whose states only exist in the live
   page: a scroll-scrubbed stage at p = 0.6, a hovered arrow, a toggled chart,
   a dragged widget. This script loads the page, puts it in any state (scroll,
   run JS, click), and captures the full page, an element, or the viewport.

   USAGE:  node render.mjs jobs.json        (see jobs.example.json)
   jobs.json = { "file": "/abs/page.html", "width": 1180, "height": 900, "dpr": 2,
                 "settle": 800,            ms to wait after load (fonts/MathJax)
                 "jobs": [ {
                   "out":   "/abs/x.png",
                   "reload": true,          (optional) reload before this job
                   "prep":  "<js>",         (optional) evaluated first; may return a Promise;
                                            a non-1 return value is printed ("prep -> ...") — handy for probes
                   "scroll": 1200 | "#sel", (optional) scrollTo y, or scroll an element to the top
                   "scrollOffset": 60,      (optional) px above the element to leave
                   "wait": 400,             ms to wait before capture
                   "clip": "full" | "#sel" | [x,y,w,h],
                   "pad": 12,               px around an element clip
                   "vp": true               capture the VIEWPORT as-is and save the element's
                                            viewport rect to <out>.rect.json; crop afterwards with
                                            crop_vp.py. REQUIRED for anything position:sticky —
                                            a clipped/beyond-viewport capture re-lays the page out,
                                            un-pins sticky stages, and offsets the clip.
                 } ] }
   Jobs run in order in one tab, so state carries over (a hover set up in one
   job is still there in the next) unless "reload" is set.

   Readiness: waits for readyState interactive (CDN subresources can hold
   'complete' for minutes), forces scroll-behavior:auto (smooth scrolling makes
   programmatic scrolls crawl), waits for document.fonts and for MathJax's
   startup promise (up to ~15 s) so captions show typeset math. Pair with
   qa_copy.py to point the page's CDN assets at local copies: a full-page
   render drops from ~10 minutes to ~1 minute.
   ═══════════════════════════════════════════════════════════════════════════ */
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const spec = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const W = spec.width || 1180, H = spec.height || 900, DPR = spec.dpr || 2;

const udd = mkdtempSync(join(tmpdir(), 'cdp-'));
const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=0', `--user-data-dir=${udd}`, `--window-size=${W},${H}`, 'about:blank'],
  { stdio: ['ignore', 'ignore', 'pipe'] });
const wsUrl = await new Promise((res, rej) => {
  let buf = '';
  chrome.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) res(m[1]); });
  chrome.on('exit', c => rej(new Error('chrome exited ' + c)));
  setTimeout(() => rej(new Error('no DevTools url\n' + buf)), 15000);
});
const port = new URL(wsUrl).port;
const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map(); const listeners = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  else if (m.method) listeners.forEach(f => f(m));
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const waitEvent = (method, timeout = 20000) => new Promise((res, rej) => {
  const f = m => { if (m.method === method) { listeners.splice(listeners.indexOf(f), 1); res(m.params); } };
  listeners.push(f); setTimeout(() => rej(new Error('timeout ' + method)), timeout);
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error('page JS error: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails));
  return r.result.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
listeners.push(m => { if (m.method === 'Runtime.exceptionThrown') console.error('PAGE ERROR:', m.params.exceptionDetails?.exception?.description || JSON.stringify(m.params.exceptionDetails)); });
async function load(file) {
  const url = file.startsWith('http') ? file : 'file://' + file;
  await send('Page.navigate', { url });
  // poll readiness rather than trusting loadEventFired (CDN stylesheets/MathJax can hold the load event for a long time)
  // 'interactive' is enough: the DOM is parsed and scripts ran; CDN subresources (MathJax, fonts) can keep 'complete' away for a long time
  const t0 = Date.now(); let state = '';
  while (Date.now() - t0 < (spec.loadTimeout ?? 8000)) {
    try { state = await evaluate('document.readyState'); } catch (e) { state = 'err'; }
    if (state === 'complete' || state === 'interactive') break;
    await sleep(100);
  }
  // smooth scrolling makes every programmatic scroll crawl in headless Chrome: force instant scrolls
  try { await evaluate("document.documentElement.style.scrollBehavior='auto'; 1"); } catch (e) {}
  try { await evaluate('document.fonts ? Promise.race([document.fonts.ready, new Promise(r=>setTimeout(r,2500))]).then(()=>1) : 1'); } catch (e) {}
  // MathJax arrives from a CDN and typesets asynchronously: wait for it (up to ~15 s) so captions show math, not \( \)
  try { const mj = await evaluate('(async()=>{ for(let i=0;i<60;i++){ if(window.MathJax&&MathJax.startup&&MathJax.startup.promise){ await MathJax.startup.promise; return "typeset"; } await new Promise(r=>setTimeout(r,250)); } return "no-mathjax"; })()'); console.log('mathjax:', mj); } catch (e) { console.log('mathjax wait failed', e.message); }
  await sleep(spec.settle ?? 1200);
}
process.on('exit', () => { try { chrome.kill('SIGKILL'); } catch (e) {} });
await load(spec.file);
const lap = () => {};
for (const job of spec.jobs) {
  lap('job ' + job.out.split('/').pop());
  if (job.reload) await load(spec.file);
  if (job.prep){ const pv = await evaluate(job.prep); if (pv !== 1) console.log('  prep ->', JSON.stringify(pv)); }
  if (job.scroll !== undefined) {
    if (typeof job.scroll === 'number') await evaluate(`window.scrollTo(0, ${job.scroll}); 1`);
    else await evaluate(`(function(){var el=document.querySelector(${JSON.stringify(job.scroll)}); if(!el) throw new Error('no element '+${JSON.stringify(job.scroll)}); var r=el.getBoundingClientRect(); window.scrollTo(0, window.scrollY + r.top - ${job.scrollOffset ?? 0}); return 1;})()`);
  }
  lap('prep+scroll done'); await sleep(job.wait ?? 350); lap('wait done');
  let clip;
  if (job.vp) {
    // sticky stages: capture the visible viewport as-is and record the element's viewport rect for cropping afterwards
    // (any clip or captureBeyondViewport re-lays the page out and un-pins position:sticky)
    const r = await evaluate(`(function(){var el=document.querySelector(${JSON.stringify(job.clip)}); if(!el) throw new Error('no element '+${JSON.stringify(job.clip)}); var r=el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height];})()`);
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    writeFileSync(job.out, Buffer.from(shot.data, 'base64'));
    writeFileSync(job.out + '.rect.json', JSON.stringify({ rect: r, dpr: DPR, pad: job.pad ?? 12 }));
    console.log('wrote', job.out, 'viewport', W + 'x' + H, 'element rect', r.map(Math.round).join(','));
    continue;
  }
  if (job.clip === 'full' || job.clip === undefined) {
    const sh = await evaluate('[Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, document.body.offsetHeight)]');
    console.log('  full page size', sh); clip = { x: 0, y: 0, width: sh[0], height: Math.min(sh[1], 16000), scale: 1 };
  } else if (Array.isArray(job.clip)) {
    clip = { x: job.clip[0], y: job.clip[1], width: job.clip[2], height: job.clip[3], scale: 1 };
  } else {
    const pad = job.pad ?? 12;
    // vp: clip in viewport coordinates without resizing the viewport — required for position:sticky stages,
    // which captureBeyondViewport would un-pin by making the whole document the viewport
    const r = await evaluate(`(function(){var el=document.querySelector(${JSON.stringify(job.clip)}); if(!el) throw new Error('no element '+${JSON.stringify(job.clip)}); var r=el.getBoundingClientRect(); return ${job.vp ? '[r.left, r.top, r.width, r.height]' : '[r.left+window.scrollX, r.top+window.scrollY, r.width, r.height]'};})()`);
    clip = { x: Math.max(0, r[0] - pad), y: Math.max(0, r[1] - pad), width: r[2] + 2 * pad, height: r[3] + 2 * pad, scale: 1 };
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: !job.vp }); lap('screenshot done');
  writeFileSync(job.out, Buffer.from(shot.data, 'base64'));
  console.log('wrote', job.out, `${Math.round(clip.width)}x${Math.round(clip.height)} css px @${DPR}x`);
}
ws.close(); chrome.kill('SIGKILL');
