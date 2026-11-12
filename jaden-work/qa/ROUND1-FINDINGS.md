# Round 1 review: consolidated findings

Three independent reviewers looked at the box, ball and greeting. Their harnesses and crops are in `jaden-work/qa/{box,ball,text}/` (`h.html` in each). Below, the findings are grouped by theme, with cross-cutting items first. Verdict: **colour 0 (genga) is convincing everywhere and must be preserved.** Most problems are at colour ≥ 0.5 and in the line renderer.

## A. Graphite line renderer (all figures: highest priority)
1. **Each stroke reads as a tube.** There's a light, blotchy grey ribbon around a darker, near-solid core (base pass about 0.64 plus accent pass about 0.9 at 0.86× width). At 2× it looks like an outlined vector stroke. At 1× the heavy stems look like black brush pen while the light curves look faded grey, as if drawn with two tools. Thin black core slivers show inside the text's r arm, e and J.
   - Fix: use one ribbon whose density follows weight (about 0.55–0.8). Keep the tooth visible even in heavy strokes. Don't clamp whole strokes to weight 1.2.
2. **The line is too black and too cool.** Heavy lines reach about `#0e1015`, which reads as marker.
   - Fix: cap graphite at about `#3a3532` (warm), and let density, not darkness, carry the weight.
3. **The grain looks like a filter.** Soft value-noise "camouflage" blobs sit inside a perfectly clean silhouette with round caps.
   - Fix: drop the low-frequency (8 and 16 texel) octaves from the stroke pattern and sharpen the threshold. Let the paper tooth eat the outer ~25% of the width, so edges are ragged and not vector-clean.
4. **All tapers are identical** (`[6, 10]`).
   - Fix: derive the start and end tapers per stroke from Jasper's own `w` profile, so they're uneven.
5. **Boil.** Paper is always drawn at seed 1 while the line grain re-rolls per seed. On seeds 2–3 the grain no longer matches the paper, and about 30% of ink pixels change by more than 40 levels while the centreline barely moves (about 0.4 px).
   - Fix: lock the line grain to the paper (world-space tooth) and put the boil into the geometry instead: about 1–1.5 units of positional wobble and about ±4% width breathing. The box and ball reviewers found the current boil acceptable in feel, so keep it subtle.

## B. Colour-edge and fill handling (box and ball)
6. **The lit-side bare edges are "torn paper".** Crisp, noise-displaced edges ignore stroke direction. This is worst at colour 0.5: a third of the box body is torn away, and the ball has a straight staircase "bite" that wipes diagonally through swirl-1.
   - Fix: build these edges from **staggered marker-stroke ends along `strokeAngle`**. On the ball, curve the edge around the lit pole, and at colour 1 shrink the bare area to a thin rim crescent.
7. **Constant-width paper slivers** trace many edges like a sticker outline: around the bow loops, under the left loop, both edges of the lid band, and the ribbon's right edge. The ball also gets a paper sliver where colour meets the line at the lower-left terminator.
   - Fix: let colour run *under* the line on most edges, and leave a gap only occasionally, 0–5 units wide and irregular.
8. **Marker banding on the box front** is soft, evenly spaced diagonals, like a brush-texture overlay.
   - Fix: 5–8 crisp, chisel-width overlaps, angle varied ±8°, clustered toward the shadow side and running out at the bare edge.
   - On the ball's dark violet the streaks are invisible (the base is dead flat): raise streak contrast on dark hues so the ball shows the same hand.
9. **Construction lines multiply into dark seams under colour.** The ball at 0.5 reads as a globe.
   - Fix: fade construction where base colour covers it.

## C. Remove every gloss, glint and drop-shadow mark (box and ball)
10. Delete these:
    - `loopGlint` (box bow)
    - `ribbonGlint` (reads as a misregistration gap)
    - the ball's white "fleck" on swirl-2 (looks like a dropped pixel)
    - the finger-hole glint and lighter inner ring (it reads as an embossed button and flickers between boil seeds)
    - `tailLCast` / `tailRCast` (offset-copy drop shadows)
11. **Ball specular:** it's a clean lens with needle tips and no tooth.
    - Fix: give it an irregular, marker-skirted edge. At colour 0, draw a loose closed blue contour instead of the single straight blue line, which reads as a stray mark.
12. **Ball ground shadow:** a crisp, perfect, flat lavender ellipse reads as a vector drop shadow.
    - Fix: no closed shape. Use 2–3 uneven marker passes or hatching plus a contact line, darkest at the contact point, matching how the box's ground is handled.
13. **Finger holes at colour 1:** flat near-black, plus a hard inner-wall shadow shape, with about 50% of the hatching kept.

## D. Ball is over-finished at colour 1
14. Apply the anime "incompleteness" to the ball as much as to the box:
    - lighten the base violet 15–20%
    - cap the shade darkness, so the right silhouette doesn't become a dark mass and the line stays readable
    - keep about 30% of the red hatching visible at colour 1
    - leave a few unpainted slivers along the swirls and the right rim
15. **Swirl streaks** are even-width round-capped ribbons, about 3× pen width at a constant offset (they read as a tube or drop shadow).
    - Fix: 1.3–1.8× pen width, varying pressure, both ends tapered, 2–4 pencil lifts, and an offset that wanders and sometimes crosses the line, with grain along the stroke.
16. **Top-left edge:** the outline, the lit-side searching pass (`0.84–0.95`, offset −5.5) and the blue guide make three parallel lines, which is the rough.js look.
    - Fix: drop that searching pass. Enlarge or offset the guide so it *crosses* the outline rather than hugging it, drawn as 2–3 overshooting arcs.
17. **Outline break at 0.592–0.607 (lower left)** sits at the terminator and reads as a seam.
    - Fix: move the break to the upper left (about 0.82–0.88) and ramp the weight smoothly.
18. **Halves hook:**
    - The ground shadow splits and rotates with the halves. Render the ground once, unclipped and unmoved.
    - Colour is clipped pixel-perfect at the crack while every other edge is off-register. Inset the colour off-register along the crack.
    - The crack line is nearly invisible at colour 1, so draw it heavier.
    - Leave the crack *geometry* itself as is for now. The zigzag reads as clip art, and we may ask Jasper to draw the crack, so just make it easy to swap in a drawn crack stroke later.

## E. Box specifics
19. **Bow removal (`bow: {x: 180, y: -160}`, colour 1)** leaves the loop shapes cut out of the lid's teal as bare notches. The bow also flies off with no knot, because the knot's pink belongs to `lidRibbon`, so it reads as two balloons on stems.
    - Fix: paint the lid teal *under* the loops instead of subtracting them, and give the `bow` group a small designed knot.
20. **Bow loops at colour 1** (flat pink blob, white gloss quad, blue edge, dark bottom) read as a balloon or cherry.
    - Fix: colour each loop as ribbon: pink along the outer contour, pinkShade inside near the knot, and keep a bare crescent at the upper left.
21. **Lid cast shadow** is painted straight across the body's bare top-left patch. When it fades during the lift, it leaves a ghost strip on bare paper.
    - Fix: clip the shadow tone to the coloured area.
22. **The lid at colour 1 reads as a white lid with a pink band** (main-thread note).
    - Fix: colour the lid teal like the body, leaving only a bare lit end at its left.
23. **Red hatching under the lid at colour 0** is short comma ticks covering half the band, far sparser than the ball.
    - Fix: hatch from the line to the red boundary at the ball's spacing.
24. **The blue centre construction line on the ribbon** reads as a crease.
    - Fix: stop it at the lid top.
25. **Bow tails' pink** overshoots the tail end into a rounded sausage.
    - Fix: stop it 3–5 units short of the end.
26. Keep as is: the narrow pink strip on the tails, and the lid band in pink (it reads as ribbon round the lid).

## F. Greeting specifics
27. **Write-on moves like a plotter.** Speed along each stroke is constant, and every pen lift costs the same (about 30 ms), whether it's within a letter, a word gap or the line break. The `!` dots appear within one frame.
    - Fix: ease in slowly at stroke starts and through tight turns, faster on straight runs. Make the lift time scale with travel distance, plus about 150 ms at word gaps and about 300 ms at the line break. Give dots about 70 ms.
28. **The 2nd and 3rd `!` dots** are perfect round-capped pills, solid black.
    - Fix: land heavy and lift light, slightly asymmetric, with grain showing.
29. **Construction baselines** are a good genga touch but too heavy: dead-straight rules 2.8 units wide with the same blotchy grain. The line-1 chord cuts through the b because "birthday" climbs.
    - Fix: fit guides per word. Make them thinner and lighter, slightly bowed and broken once. Delete the x-height stub that runs from "a" to "b".
30. **Pink accent swash: worth offering, redesign it.** Its 120-unit needle tail runs through the third `!` dot, and at 11 units wide it reads as a flat highlighter swoosh.
    - Fix: end it short of and below the last dot, about 5 units wide, two quick coloured-pencil passes ending in a short lift-off flick.
    - Animate it over about 350 ms after the last dot; the review page should drive `accentAmount` so it doesn't pop in.

## G. Review pipeline
31. **The exported PNGs are mis-framed.** `--headless=new` takes about 87 px off the window height, so `text-*.png` has a dead band at the bottom.
    - Fix: size the canvas from the actual viewport, or pad `--window-size`.

## Must not lose
- Jasper's wobble and lumpy outline.
- Lighter lit-side and heavier shadow-side lines.
- Sparse blue guides; red shadow boundaries with ~62° hatching.
- The hole hatching; the faint swirls 1–2.
- The faithful letterforms and writing order, and the blunt-then-tapering write-on tip; no searching passes in the handwriting.
- The clean lid lift with `body-rim`; the working layer toggles.
- No glow anywhere.
