# The review loop

Whoever authored the coordinates can't see them. So review-only agents judge
captures against the stated intent, and the author fixes from their reports.
Reviewers judge whether the work looks made by a hand, they come back to
verify their own findings, and the loop runs twice: once on the static
figures, once on the motion.

On the first piece this loop found 31 problems in the first static figures,
and about fifty in a first animated pass that worked end to end and looked
strong on the main thread's own contact sheet.

## A round

1. **Capture, and look yourself first.** Form your own view from a small
   contact sheet before anyone else reports. You will be asked to arbitrate.
2. **One review-only agent per figure** for statics, **per shot** for motion,
   plus one technical reviewer for motion. Each gets:
   - the briefs, so it knows the intent and the user's words;
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
   Repeat until what comes back is polish. The first piece's statics went 31
   findings, then 9, then one small round. Its motion went about 50, then two
   blockers and six polish items from a single verifier.
6. **Your own last look, then the user.**

A reviewer's brief says who it is (a demanding animation director and
visual-QA reviewer who reports and does not edit), what to read first, how to
look, the rubric, and the report format. The format that worked: at most ten
findings, ranked, each with where (figure or shot, frame, viewport), what is
wrong, and a concrete fix in terms of the thing itself ("cluster drawings near
the apex, add a stretch drawing at f12"). Then one or two sentences on what
works and must not be lost. Direct, not polite.

Give reviewers intent, not code, and ask them to judge pixels first. Given the
code, they read what you meant.

## What reviewers judge

**Statics.** The question is whether each figure reads as drawn by hand, both
at the size it will be shown and zoomed in. These classes are how the first
piece's static findings grouped, and `look.md` lists what was caught.

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

**Motion.** Four classes, as used on the first piece:

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
on the first piece, from 390×844 to 2560×1080); anything still moving by
interpolation; drawings dropped under 4× CPU throttle; keyboard and
screen-reader paths; rapid and mid-animation taps; reduced motion; a blocked
font or script; console errors; payload size.

## Tools

In `../kit/tools/`. Node 22 or later and Google Chrome; no other dependencies.
Set `CHROME` if Chrome isn't at the macOS default path.

| Tool | What it does |
|---|---|
| `capture.mjs` | Renders exact drawings through a page's seek hook: single frames, ranges at a rate, or whole shots, at any viewports, as contact sheets. `--bench` prints render cost. The header documents the frame syntax and what the hook must expose. |
| `still.mjs` | One screenshot of any local page at an exact viewport, for review pages and static figures: `node still.mjs --page ../demo.html --query "color=0.64" --out box.png`. |
| `live.example.mjs` | Plays a page in real time with scripted taps and optional CPU throttle, and reports how many of each shot's drawings were shown. Covers what seeking can't: autoplay, fast-forward, keyboard, replay. The tap script inside is the first piece's; rewrite it for yours. |
| `cdp.mjs` | The headless-Chrome driver the others share. |

A piece builds its own review pages. The first piece had one for the drawn
figures (each beside its photo and its plain vectors, at three colour levels,
with a live canvas, a colour slider, a boil toggle, write-on replay, layer
toggles, sliders for moving parts, and a together sheet), one each for the
background, the effects and the logo, and an export page that took every
render option as a query parameter. `../kit/demo.html` is the smallest version
of that idea.

Practicalities:

- **One headless Chrome at a time** unless the machine has memory to spare
  (SKILL.md, "Machines"). The simplest arrangement is that you capture every
  sheet up front, since the page is deterministic, and reviewers work from
  images and zoom with PIL. The technical reviewer needs a live browser and
  runs alone.
- Prefer sheets over frame dumps (`--sheet --no-frames`). Read images as crops
  no wider than about 1600 px, and zoom where it matters.
- Capture through the tools here rather than Chrome's `--screenshot` flag,
  which loses about 87 px of window height in new headless mode and doesn't
  exit by itself.
- Make sure the copy under review loads what the real page loads. Every early
  render of the first piece showed a fallback font because the test copy never
  loaded the real one.
- Give each parallel reviewer its own folder or filename prefix for crops, or
  one will overwrite another's.
