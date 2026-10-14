# Data pipeline: compute, assert, embed

Every number a figure draws comes from the run's artifacts, through one script,
and the same script checks the essay's prose against the data before a single
pixel is placed.

## 1. Locate the artifacts

The essay's build notes say where the numbers of record live (results JSON,
tables of record, banked `.npz`). Some live on a Modal volume; fetch them into
the scratchpad, never into the repo:

```bash
MODAL_PROFILE=<profile> modal volume ls <volume> /<run>
MODAL_PROFILE=<profile> modal volume get <volume> /<run>/<arm>_final.npz ./data/
```

Read downloaded files with `python3 -I` from a directory that holds no scripts.

## 2. `compute.py`: derive and assert

One script, run once, that:

- loads the artifacts and recovers the objects the essay talks about (which
  units survived, which coordinates they read, the recovered positions);
- derives every figure's arrays from *those* (scores on all pairs, the output
  arrow per pair, the per-bin envelope of a scatter, a fit and its residual);
- **asserts every claim the essay states**: accuracy on all pairs, the fit
  amplitude and residual, the margins, the winding and offset, the agreement
  with a formula. Print each as `claim: value (essay says X)`. A mismatch is a
  finding for the author, not something to paper over in the figure;
- writes a compact `data.json`: floats rounded to what the figure can show,
  scatters sampled with a fixed seed (1,600 of 912,673 points), clouds reduced
  to per-bin min/max envelopes, lookup tables (circle order, place of each
  number) precomputed so the page's JS stays simple. Aim for tens of KB.

Keep recorded series (accuracy by epoch, weights-remaining by round) as they
were logged; the chart draws the record, not a smoothed version of it.

## 3. Generated static SVGs

When a static figure's geometry *is* data (a ring of 97 recovered positions,
arrows whose length and direction are weights, a line chart of a recorded
series), generate the SVG from `data.json` with a script (`gen_svgs.py`
pattern): compute positions, place labels by rule (anchor by quadrant, keep
labels outside the ring, label the quarter points of a dense ring rather than
consecutive members), emit `class="anim-draw"` / `anim-fade` with staggered
delays, and give every SVG its precise `aria-label`. The generated SVG then
goes through the Overlap-QA loop like any hand-authored one; after the splice,
the HTML is the source of truth.

## 4. Embed and assemble

The page template carries placeholders: `{{DATA}}` inside
`<script>var DATA = {{DATA}};</script>`, plus one per generated SVG and one
for any recorded series. `assemble.py` fills them once. From then on edit the
assembled HTML directly; regenerate only when the data changes, and re-splice.

## 5. Everything downstream reads `DATA`

Live charts, widgets and canvas sequences compute from `DATA` at runtime
(`netOutput(a, b)`, `netScores(a, b)`), so a widget's readout and a static
chart's annotation cannot drift apart: they are the same arithmetic on the
same 18 numbers.
