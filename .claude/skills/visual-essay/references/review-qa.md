# The review-agent pass for script-built figures (MANDATORY)

The scrolldeck Overlap-QA loop isolates a static `<svg>`, lets an agent edit it,
and splices it back. A canvas sequence, a chart built from `DATA` at runtime or
a draggable widget has no such block to isolate: its pixels only exist in the
live page, in a particular state. So the loop splits in two: **you** capture the
states with the render harness and **a review-only agent per figure** judges
them against the rubric and the figure's intent, reporting findings you then
fix in the page. On the first visual essay this pass returned 10 findings on the
accuracy scrolly, 10 on the three-chart figure, 9 on the canvas sequence, 6 on
the slide rule, 7 on the lens chart and 10 on the winding figure. Three were
bugs a reader would have hit on the first scroll. Do not skip it.

## 1. Capture the states

One `jobs.json` for the harness (`render.mjs`), rendered against the
`qa_copy.py` copy of the page. Per figure:

- **scrolly / canvas**: the stage (`"clip": "#figX .stage", "vp": true`) at
  every phase boundary and once inside each phase — the first essay used
  p = 0.02, 0.24, 0.335, 0.45, 0.66, 0.75, 0.9, 1 for an eight-phase sequence.
  Scrub with the `__sp` helper from `jobs.example.json`.
- **live chart / widget**: the whole card at its default state, then once per
  control: the toggle clicked, a slider moved to a different value, a hover
  dispatched on a labelled element.
- Run `crop_vp.py` on the output directory so the `vp` captures are cropped to
  the element. Read every capture yourself before spawning anything.

## 2. Spawn one review agent per figure, in parallel

`general-purpose` subagents, all in one message. Each gets: the capture paths,
the figure's intent *element by element*, the four-class rubric, and a unique
zoom-file prefix so parallel agents never clobber each other's crops. They do
**not** edit files. Prompt template (fill the ALL-CAPS slots; keep the rubric
and the method verbatim):

```
You are a meticulous visual-QA reviewer. You will REVIEW rendered screenshots
of one JavaScript-built figure from a web essay and REPORT problems. Do NOT edit
any file. The author will fix the figure from your report.

FILES (PNG captures at 2× device pixels; each is <WHAT: the figure's pinned
stage at a scroll position / the whole figure card in a state>):
  <ABS>/figX-p0.png     (<state>)
  <ABS>/figX-p45.png    (<state>)
  ...

WHAT THE FIGURE SHOULD SHOW: <EVERY ELEMENT AND ITS INTENT — titles, axes and
their labels, series and their colours, markers, readouts, controls, captions;
what changes between the captured states; what must agree with what (e.g. "the
readout's epoch must equal the cursor's position", "the marker sits ON the
line"). Name the things most likely to be wrong.>

Hunt ALL FOUR failure classes:
  1. Collision  — glyphs overlapping text/lines/dots/axes.
  2. Occlusion  — an element hiding another so something is lost (a panel
                  over a title, a dot over an arrowhead, one marker over another).
  3. Clipping   — anything cut by the stage/card/SVG edge (readouts at the far
                  cursor position, rotated axis titles, labels past the lens rim).
  4. Proportion — sized/placed wrong even if nothing overlaps (dead space,
                  unbalanced panels, a figure crowded to one side, labels
                  floating far from their marks, unreadably small text).
Also note anything that would confuse a reader relative to the intent above,
including numbers on screen that disagree with each other or with the caption.

METHOD: Read each PNG. Zoom suspect regions with PIL, writing ONLY to files
named like <ABS>/zoom-figX-<n>.png (other agents work in the same directory;
never write any other filename):
  python3 -c "from PIL import Image; Image.open('<png>').crop((X0,Y0,X1,Y1)).save('<zoom path>')"

REPORT: a numbered list of findings, each as: [class] [which PNG] [pixel
location in that PNG] [what is wrong] [a concrete suggested fix in terms of
the element]. Order by severity. Say explicitly which captures are clean. End
with one line: CLEAN or NEEDS FIXES with the count.
```

## 3. Fix, re-render, re-read

Apply every finding in the page (the HTML in the repo is the source of truth;
patch it with a script when the change is more than a line, and assert each
replacement matched exactly once). Then re-render the same `jobs.json` and
read the new captures yourself — the reviewer's suggested fix is a suggestion,
and a fix can introduce a new collision. Re-run a reviewer on any figure whose
fix was structural (a rewritten layout, a moved panel, a new control).

## What the reviewers catch that you will not (examples from the first essay)

- A marker computed from the raw series while the line is drawn from a
  clamped series: the dot sits off the line only at the first frame.
- A pointer placed by `translate` at the right angle but rotated by half of
  it: it aims at the neighbouring number.
- Chords shorter than a dot's diameter: the stride is invisible exactly for the
  windings the control invites the reader to try.
- A caption that names an epoch the readout has already passed.
- A label whose descender sits on a gridline, a label underlined by a
  connector, a legend one dot-radius from the first data point.
- An "overlapping dots" scatter: 97 dots, 93 distinct blobs.

## Gotchas

- Captures of `position:sticky` stages must use the harness's `vp` mode; a
  clipped capture un-pins the stage and the reviewer sees a blank card.
- Give the reviewer the *intent*, not the code; given the code it reads what
  you meant, not what rendered.
- Zoom filenames must be unique per agent (`zoom-figX-n.png`), or one agent
  "fixes" another's crop.
- The reviewers judge balance against the intent you wrote. If a figure's
  intent paragraph is vague, the proportion findings will be too.
