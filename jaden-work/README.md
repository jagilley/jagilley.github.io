# jaden-work

The work folder behind `jaden.html`, the hand-drawn birthday page for Jasper's
brother (November 2026). It is kept as the first worked example of the
`pencil-genga` skill (`.claude/skills/pencil-genga/`). Nothing here is loaded
by the site; the page's runtime files are in `resources/jaden/`, and this
folder is excluded from the Jekyll build in `_config.yml`.

How it was made, in order: Jasper drew a present, a bowling ball and a greeting
in pen on ruled paper. Three agents extracted them as vector strokes. A styling
agent built a pencil renderer and style data, reviewed over three rounds.
Jasper approved the static look. Then five agents (renderer, background, logo,
effects, director) built the animated page from one brief, reviewed shot by
shot. The earlier SVG version of the page is at commit `8be42a8`.

## Read in this order

| Path | What |
|---|---|
| `thumbs/t064.jpg` | A still of the approved look: the three figures at colour 0.64. |
| `STYLE-BRIEF.md` | The brief the styling agent worked from. |
| `style/README.md` | The renderer's API and the figure data format. The renderer itself is `resources/jaden/pencil.js`. |
| `qa/ROUND1-FINDINGS.md`, `qa/ROUND2-FINDINGS.md` | Consolidated static-review findings, with fixes. |
| `ANIMATION-BRIEF.md` | The brief the animation team worked from; records Jasper's decisions. |
| `qa/ANIM-QA-RUBRIC.md`, `qa/ANIM-ROUND1.md` | The motion reviewers' brief, and their consolidated findings by owner. |
| `../jaden.html` | The page. Its header comment describes the exposure-sheet engine. |

The two briefs are kept as they were handed out. Where they disagree with
`style/README.md` or the code (the graphite colour, where the renderer lives),
the later files are right.

## Everything else

| Path | What |
|---|---|
| `source/` | Jasper's three photos (box, ball, greeting), location metadata stripped. |
| `extract/<figure>/` | Extraction output: `*.strokes.json`, `*.svg`, the clean render, and `*-overlay.png` (strokes over the photo). |
| `tools/box/`, `tools/ball/`, `tools/text/` | The three extraction pipelines. |
| `tools/style/build.py` | Generates `resources/jaden/{box,ball,text}.style.js` from the strokes. |
| `tools/bg/`, `tools/fx/`, `tools/logo/` | Builders for the authored background, the effects and the traced logo. `hand.py` and `hand.js` are the drawing hand they share. |
| `tools/anim/` | Capture tools: `capture.mjs` (exact drawings and contact sheets), `live.mjs` (real-time runs with taps), `cdp.mjs` (headless-Chrome driver). |
| `style/*-NOTES.md` | Each artist's notes for the director. |
| `style/*.js` | Stubs that redirect to `resources/jaden/`; `pencil.frozen.js` is the renderer as it was before the animation work. |
| `review/` | Review pages: `index.html` (figures with dials), `bg.html`, `fx.html`, `logo.html`, and `export.html` for headless stills. |
| `qa/<figure>/h.html` | The static reviewers' harness pages. |
| `thumbs/` | Small contact sheets the main thread looked at along the way. `together-final.jpg` predates the final colour edge. |

## What is not in git

All of it regenerates (see `.gitignore`):

- `venv/`: `python3 -m venv venv && venv/bin/pip install -r requirements.txt`
- `review/png/`: static exports of the review pages, via `review/export.html`
  in headless Chrome.
- `tools/box/debug/`, `extract/*/work/`, `extract/text/_work/`: extraction
  intermediates, rebuilt by rerunning the pipelines. Some were cut from the
  original photos and carried their GPS metadata.

The skill's `kit/` holds generalised, name-free copies of the renderer, the
capture tools (`tools/anim/`), the two drawing hands (`tools/bg/hand.py`,
`tools/fx/hand.js`) and `tools/style/geom.py`. New pieces start from the kit;
this folder keeps the originals as they were used.

The tools use absolute paths under `/Users/jasper/Code/jagilley.github.io/`.
The capture tools need Node 22 or later and Google Chrome. Run one headless
Chrome at a time on this machine.
