# Canvas sequences: patterns

A canvas sequence is a scrolly whose stage is a `<canvas>` redrawn from scratch
at every scroll progress `p`. The first essay's was a network drawn to scale
(one dot per parameter, in perspective) that folds, is squeezed to a handful
of survivors, hands over to a second network, and ends with the last dots
flying to their places in a static SVG. These are the patterns that made it
work; the scaffold's example C is a minimal version.

## Invariants

- **`draw(p)` is idempotent.** No state accumulates between frames; everything
  is recomputed from `p` and precomputed tables. Scrolling backwards must look
  exactly like scrolling forwards in reverse.
- **Device-pixel aware.** On resize set `canvas.width/height = css × dpr`,
  `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, and redraw at the last `p`.
- **Seeded randomness** (`lcg(seed)`) for any layout noise, so renders are
  reproducible between QA runs and the reviewers' coordinates stay valid.
- **Typed arrays** for per-dot state (position, rank, death time); tens of
  thousands of dots redraw at scroll rate if each frame is one `beginPath` /
  `rect` loop / `fill`.

## Counting down on a schedule

- Give every dot a **rank** in (0, 1]. The alive count at progress `p` is a
  schedule `f(p)` log-interpolated between recorded milestones
  `[(p₀, n₀), (p₁, n₁), …]`; dot `i` dies at `p = f⁻¹(rank·N)`. Then the
  count on screen always equals the schedule and the counter can print it.
- Which dots survive longest is a choice: put the survivors where the real
  survivors were (a few rows and columns, so the remains read as wiring, not
  as noise), and make the final set exactly the real final set.
- **Shavings**: a dot that died within the last ~0.06 of `p` is drawn falling
  (`y += k·dt²`) and fading. Clamp the scatter to below its sheet so it never
  rises into a title.

## Phases

- Phase boundaries are the step thresholds. Inside a phase use `smooth()`
  easing of a local `u ∈ [0,1]`; across phases, hand off state explicitly
  (where the fold leaves a block is where the squeeze starts).
- **Crossfades are sequential**: A fades out fully, then B fades in. Two
  overlapping networks share titles and the reviewers will flag it.
- Outlines and titles are the size reference; keep them through the squeeze.
  A title holds its original place until the shavings nearby have faded, then
  settles above the folded block, and is renamed to the folded shape.
- Counters and labels change only at the milestones the prose names; between
  them, show the schedule's value.

## Handing off to a static SVG

- The end state is a real static SVG (QA'd by the Overlap-QA loop) overlaid on
  the stage and faded in over the last few hundredths of `p`.
- Dots fly to its arrow tips: compute targets from the SVG's *on-screen* box
  (`getBoundingClientRect` at draw time), not from the stage's size, because
  the SVG is letterboxed inside the stage.
- Controls that belong to the end state (a trace button, hover hooks) fade in
  with the SVG, not before.

## Capturing for QA

Scrub with the harness's `__sp(id, p)` at every phase boundary and once inside
each phase; capture in viewport mode. Reviewers need to see the fold mid-way,
the squeeze with its shavings, the crossfade, the flight and the end state as
separate frames.
