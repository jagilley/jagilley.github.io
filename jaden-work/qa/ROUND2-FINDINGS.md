# Round 2 review: consolidated findings

Verdicts: **greeting** ready after item 8. **Box** ready after items 1–2. **Ball** ready after items 1, 2, 4, 5. Colour 0 is ready everywhere. Most of round 1 verified fixed; what remains is below.

## Cross-cutting
1. **Marker streaks read as glass glare (box and ball, colour ≥ 0.5).**
   - What's wrong: 4–5 ruler-straight, constant-width, hard-edged translucent diagonal bars with square ends run across the full face; on the box they also cross onto the lid.
   - Fix: 2–5 *short* overlaps (about 60–150 units), slightly arced, with the angle varied ±8°. Their ends sit inside the fill, ink pools slightly darker at the ends (marker overlap), contrast is about half, and they cluster toward the shadow side. If they still read as glare, delete them; flat colour with a hand-made edge is better than a fake texture.
2. **The stroke-end front is a staircase (box and ball, colour 0.3–1).**
   - What's wrong: identical round caps step along a straight diagonal, like a bar chart.
   - Fix: vary stroke lengths by about ±40–80 units, curve the envelope they end on (around the ball's lit pole, and a loose arc on the box), use angled chisel or marker ends instead of round caps, and vary pass width 0.6–1.4×.
3. **Small-scale line quality (together sheet, all figures).**
   - What's wrong: lit lines break into dotted crumbs (the lid band reads as stitching), and heavy lines have a flat matte core with crumbly edges. On the box, light and heavy lines still read as two different tools.
   - Fix: scale edge erosion to the on-screen texel size (halve it when a texel is smaller than a device pixel). Keep light lines continuous with a minimum density of about 0.45. Let about 10–15% of the fine tooth show *inside* heavy strokes, so heavy is the same pencil pressed harder, not a different tool.
4. **Boil shimmer.**
   - What's wrong: light strokes (the J bar, a, e, the light swirls) still re-speckle internally on each seed; about 31% of ink pixels change by more than 40 levels. The ball's swirl slivers jump to new places each seed and flash.
   - Fix: keep pressure and tooth sampling identical across seeds, so only the geometry moves. Place any gaps or slivers by the *design* seed, never the boil seed. For the swirls, drop the paper slivers and leave occasional gaps that show the violet base.

## Ball
5. **Square notch in the colour at the bottom contact point**, about (501, 810), at the start/end point of the disc and crescent polygons. It's visible at 1×.
   - Fix: start the polygons somewhere hidden, or close the seam.
6. **The specular reads as a chip or a fifth hole** (a lumpy white blob at colour 1), and at colour 0 its closed blue oval reads as the letter "O".
   - Fix: make it an elongated lit *area* that follows the ball's curvature in the upper left (a comma/crescent, not a blob). At colour 0, indicate it with 2 short open blue arcs that don't close.

## Box
7. **Bow.**
   - Loop interiors are straight-edged triangles that read as cat ears. Draw them as curved teardrops running from the knot.
   - The knot is a pink dome with no pencil line. Add two short pencil strokes so it is *drawn*.
   - When flying off, the bow still reads as cherries on stems. The teardrops plus a drawn knot should fix that; re-check with the bow moved.

## Greeting
8. **The "Jaden!!!" construction guide climbs about 8° while the writing climbs about 3°.** It cuts through e/n, runs between the "!" stems and their dots, grazes dot 1 like a strikethrough, and hugs the swash at the J.
   - Fix: refit it to the bottoms of a/d/e/n and the dots, running *under* the dots.
9. **Minor timing.**
   - In-word pen lifts should be ≥ 100 ms.
   - Add a beat of about 200 ms between the last dot and the swash.

## Keep
Everything verified fixed in round 1:
- one-ribbon line, warm graphite, per-stroke tapers
- timed write-on, teardrop dots, redesigned swash
- holes, outline break, triple-line fix
- halves ground
- hatching under the lid, no slivers, no glints

Colour 0 everywhere.
