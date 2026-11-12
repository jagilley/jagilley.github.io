# The review loop

The idea is the visual-essay skill's review pass
(`../../visual-essay/references/review-qa.md`): whoever authored the
coordinates can't see them, so review-only agents judge captures against the
stated intent and the author fixes from their reports. Its reviewer prompt
skeleton and its gotchas transfer; its capture harness and its collision
rubric belong to that skill. What differs here is what reviewers judge
(whether it looks made by a hand), that reviewers come back to verify their
own findings, and that it runs twice: once on the static figures, once on the
motion.

On jaden this loop found 31 problems in the first static figures, and about
fifty in a first animated pass that worked end to end and looked strong on the
main thread's own contact sheet.

## A round

1. **Capture, and look yourself first.** Form your own view from a small
   contact sheet before anyone else reports. You will be asked to arbitrate.
2. **One review-only agent per figure** for statics, **per shot** for motion,
   plus one technical reviewer for motion. Each gets:
   - the briefs, so it knows the intent and Jasper's words;
   - the captures, or the capture tool if it is running alone (see below);
   - a folder of its own to write in, and nothing else;
   - the rubric and the report format.
3. **Don't edit while reviews are out.** Their citations point at the files
   as they were.
4. **Consolidate into one findings file** in `<piece>-work/qa/`: grouped by
   theme for statics (cross-cutting problems first), by owner for motion, each
   with the reviewer's concrete fix, ending with a "must not lose" list. Send
   each part to the agent that owns it, resumed.
5. **The same reviewers verify their own findings** against new captures.
   Repeat until what comes back is polish. Jaden statics went 31 findings,
   then 9, then one small round. Motion went about 50, then two blockers and
   six polish items from a single verifier.
6. **Your own last look, then Jasper.**

The report format that worked: at most ten findings, ranked, each with where
(figure or shot, frame, viewport), what is wrong, and a concrete fix in terms
of the thing itself ("cluster drawings near the apex, add a stretch drawing at
f12"). Then one or two sentences on what works and must not be lost. Direct,
not polite.

## What reviewers judge

**Statics.** The question is whether each figure reads as drawn by hand, both
at the size it will be shown and zoomed in. The static reviewers' prompts on
jaden weren't kept; these classes are how their findings grouped
(`jaden-work/qa/ROUND1-FINDINGS.md`), and `look.md` lists what they caught.

1. *Line.* Does it read as one pencil? Tubes and outlines, lines too black,
   grain that looks filtered, identical tapers, lines that crumble or go flat
   at small sizes.
2. *Colour and edges.* Does the colour look laid by hand? Fills that reach
   every edge, sticker gaps, torn or stepped edges, fake texture, seams.
3. *Finish.* Anything glossy or complete: glints, drop shadows, perfect
   shapes, one figure more finished than its neighbours.
4. *Design.* Do the added shapes (shadows, construction, anything the source
   didn't have) read as drawn, and as what they are? Where there is a source
   drawing, is the figure still that drawing?
5. *Behaviour.* Every position of every dial, parts moved to their extremes,
   the write-on if there is one, and the difference between boil seeds if the
   figure will ever be held on screen.

Figures are also judged together on one sheet: same pencil, same light, same
degree of finish.

**Motion.** Four classes, from `jaden-work/qa/ANIM-QA-RUBRIC.md`, which is the
reviewer brief used on jaden and worth reading whole:

1. *Interpolation or digital tell.* Anything that changes continuously instead
   of by drawing; variation that strobes or is too uniform; glow, particles,
   gradients, vector-perfect shapes.
2. *Animation craft.* Anticipation, squash and stretch, overshoot, settle;
   spacing; holds too short to read or long enough to drag; arcs; silhouettes;
   whether the viewer can tell what just happened.
3. *Style coherence.* Anything that breaks the look or disagrees with the
   approved statics; build-up in the wrong order.
4. *Technical defect.* Pops, missing or doubled elements, layering, seams,
   cropping at a viewport, input and state bugs, performance.

Motion is judged from **consecutive drawings on a contact sheet**, read one by
one. A single frame can't show spacing.

**Technical review** (one agent, for motion): framing across viewports (seven
on jaden, from 390×844 to 2560×1080); anything still moving by interpolation;
drawings dropped under 4× CPU throttle; keyboard and screen-reader paths;
rapid and mid-animation taps; reduced motion; a blocked font or script;
console errors; payload size.

## Tools

All in `jaden-work/`, written against that page. Copy them into the new work
folder and repoint the page path and the hook name (`window.__jaden`).

| Tool | What it does |
|---|---|
| `tools/anim/capture.mjs` | Renders exact drawings through the seek hook: single frames, ranges at a rate, or whole shots, at any viewports, as contact sheets. `--bench` prints render cost. The header documents the frame syntax. Node ≥ 22, no dependencies. |
| `tools/anim/live.mjs` | Plays the page in real time with scripted taps and optional CPU throttle, and reports how many of each shot's drawings were shown. Covers what seeking can't: autoplay, fast-forward, keyboard, replay. |
| `tools/anim/cdp.mjs` | The headless-Chrome driver both use. |
| `review/export.html` | The page for stills: any figure or the together sheet, with every render option as a query parameter. Screenshot it with headless Chrome. |
| `tools/logo/shot.sh` | The working recipe for that screenshot, written for `logo.html`: it pads the window, waits for the file, kills Chrome (which doesn't exit by itself) and crops. |
| `qa/<figure>/h.html` | The harness pages the static reviewers built: a row of panels from a JSON query, for close-ups at chosen options. |
| `review/index.html`, `bg.html`, `fx.html`, `logo.html` | The interactive review pages. |

Practicalities:

- **One headless Chrome at a time** on this machine (SKILL.md, "This
  machine"). The simplest arrangement is that you capture every sheet up
  front, since the page is deterministic, and reviewers work from images and
  zoom with PIL. The technical reviewer needs a live browser and runs alone.
- Prefer sheets over frame dumps (`--sheet --no-frames`). Read images as crops
  no wider than about 1600 px, and zoom where it matters.
- `--headless=new` takes about 87 px off the window height. Size canvases from
  the real viewport or pad `--window-size`, or exports come out mis-framed.
- Make sure the copy under review loads what the real page loads. Every early
  render of the first Jaden page showed a fallback font because the test copy
  never loaded the real one.
- Give reviewers intent, not code, and ask them to judge pixels first. Given
  the code, they read what you meant.
