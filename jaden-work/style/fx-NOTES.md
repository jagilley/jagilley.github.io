# FX notes for the director

Hand-drawn effects for `jaden-next.html`. Every effect is a **sequence of drawings**, not a particle system or a
tween. Each drawing is an ordinary pencil.js figure (`{strokes, style}`), so the boil, `reg`, `weight`, `alpha`,
`build` and `layers` all work on it as they do on the box and ball.

- Data: `resources/jaden/fx.style.js` sets `window.JADEN.fx`. Load it after `pencil.js`.
- Generator: `jaden-work/tools/fx/build.js` (sequences) and `hand.js` (stroke primitives). Rebuild with
  `node jaden-work/tools/fx/build.js`. Don't hand-edit the output.
- Review: `jaden-work/review/fx.html` plays every sequence at its exposure in context, shows every drawing, and has
  the replay icon at 44 px. Add `?r=frozen` to use the old renderer, `?sheet=<seq>[&cols=2][&c=0.64][&cell=i]` for PNG
  export (`?sheet=sparkleSites` gives the 4×3 sparkle grid), and `?bench` for timings. Contact sheets are in
  `review/png/fx-*.png`.

**Round 2 (QA F1–F5):**
- **F1:** impact 2 is rebuilt from about 260 radial pencil strokes, with paper slivers between them and stroke ends
  making the silhouette's edge.
- **F2:** the bolt ends in forked prongs. Burst 3 is now five scattered remnants plus open chevrons.
- **F3:** sparkles live at fixed sites as tick, glint, cross.
- **F4:** the tap has 5 drawings, plus `tapColour` for dark fills.
- **F5:** the data is 254 KB, down from 604, using integer coordinates and RDP-simplified points. The renders are
  unchanged.

## Data shape

```js
JADEN.fx = {
  dust: [fig, fig, fig, fig], emph: [3], impact: [2], burst: [3],
  sparkleA: [3], sparkleB: [3], sparkleC: [3], sparkleD: [3],   // one site each: tick, glint, cross
  sparkle: = sparkleA,                                          // alias for older callers
  tap: [5], tapColour: [5], trailLid: [2], trailBow: [2], replay: fig,
  meta: {<seq>: {on: {fig, at}, anchor, holds, layers?, play}},   // placement + timing, machine-readable
  notes: {...},                                                    // the short version of this file
}
// each fig: {strokes, style, anchor: [0, 0], size: [w, h], hold}   (hold = 24 fps frames)
```

Every drawing is authored around its **anchor at (0, 0)**, in figure units (100 = one ruled-line spacing, pen about 7),
at the same scale as the figures. To place one on a host figure drawn at `{x, y, scale}`:

```js
const m = JADEN.fx.meta.dust, at = m.on.at;          // [462, 832] in ball units
Pencil.render(ctx, JADEN.fx.dust[i], {
  x: ball.x + at[0] * ball.scale, y: ball.y + at[1] * ball.scale, scale: ball.scale,
  seed, reg, layers: {knockout: true},
});
```

Treat every FX drawing like any other drawing. Each time a new one appears, give it a new `seed` from the pool and a
small `reg` of about ±0.5–1 unit. Never scale or tween an FX drawing: its successive drawings already grow, break up
and thin out.

## Sequences

| Seq | Drawings | Anchor (host point) | Size (units, w×h) | Holds (24 fps) | Play |
|---|---|---|---|---|---|
| `dust` | contact, bloom, break-up, thin-out | ball ground contact, ball (462, 832) | 1245×135 → 1583×317 | 2, 2, 3, 3 | Once. Start on the landing squash drawing. **knockout on.** |
| `emph` | dense, dense (a different set), thinning | ball centre, ball (462, 429) | ~2500 square | 2, 2, 2 | Cycle 1-2 on 2s while the light pours out, then end on 3. |
| `impact` | dark field, silhouette | ball centre | ~5300 square (wedges run past any frame) | 2, 2 | Once. See below. |
| `burst` | seam (forked ends), open, remnants | ball centre (the crack's middle) | 475×1251, 1264×1382, ~2000 square | 2, 2, 3 | Once, alongside the first split drawings (`crack.split` ≈ 0.25, 0.6, 0.9). **knockout on.** |
| `sparkleA`–`D` | tick, glint, cross | the sparkle's own centre; site = logo centre + `meta.sparkleX.on.at` | tick ~70, glint ~180×280, cross ~170×320 (A; B–D smaller) | 3, 3, 3 | One life per site; see "Sparkle life cycle". |
| `tap` | land, burst, fly, break, fade | tap point | 171 → ~360 square | 2, 2, 3, 3, 3 | Once per tap. |
| `tapColour` | the same five, in colour on eraser strokes | tap point | same | 2, 2, 3, 3, 3 | Use instead of `tap` when the tap lands on a dark fill. **knockout on.** |
| `trailLid` | 2 alternates | the lid's trailing edge; **+x = direction of travel** | 474×781 | 2, 2 | Alternate 1-2 on the fast flight drawings. Rotate it to the motion. |
| `trailBow` | 2 alternates | the bow's trailing edge; +x = travel | 365×245 | 2, 2 | As above. |
| `replay` | 1 drawing | icon centre | 129×136 (about 110 across the loop) | — | `scale = 44 / 110` CSS px per unit (× dpr). Write it on with `draw` 0..1 over `Pencil.writeDuration` (about 0.9 s), then boil on 3 seeds. |

Sequences that are drawn on 2s: dust contact/bloom, emph, impact, burst, tap and trails. Sequences that settle on 3s:
dust break-up and thin-out, the last burst drawing, and sparkles.

## Sparkle life cycle

There are four fixed sites around the logo. Each site lives through three drawings, on 3s:

1. **tick:** a small flicked stroke with a coloured nick across it. The glint arrives.
2. **glint:** four separate arms flicked out from the centre (a long vertical, shorter sides, a slight tilt), a
   coloured-pencil pass beside the long arms, and two tiny diagonal glints. It's never a closed ✦ outline.
3. **cross:** stretched thin and broken at the middle, in coloured pencil only. The glint goes out.

Then the site is **off for 2–6 drawings** (re-roll the gap each cycle), and the life repeats with a fresh seed.

| Site | At (from the logo centre, logo units) | Size | Look |
|---|---|---|---|
| `sparkleA` | (−482, −252) | 128 | graphite arms, gold |
| `sparkleB` | (446, −304) | 104 | rose |
| `sparkleC` | (594, 74) | 86 | graphite arms, lilac |
| `sparkleD` | (−604, 82) | 70 | gold and sunset |

Stagger the sites by 1–2 drawings so that no more than two are lit at once and no two peak (glint) on the same
drawing. Use 3 sites on phone portrait (drop C or D if the logo crowds the frame). Sparkles start once the logo has
landed, and the site positions can move with the logo's final placement. In the final hold, key the render cache
by boil phase so cached sparkles hit.

## Tap burst variants

- **`tap`** is graphite with a couple of coloured ticks, ~1.5× the presence of v1. Its 5 drawings are land (a ring
  fragment and short ticks), burst (the biggest), fly, break and fade, with holds 2, 2, 3, 3, 3.
- **`tapColour`** is the same layout and timing in coloured pencil (gold, rose, sunset, lilac). Each tick sits on a
  paper-coloured **eraser stroke** (an occluder), so it reads on the violet ball, the logo or a ground shadow. Render
  it with `layers: {knockout: true}` (that's `meta.tapColour.layers`). On paper the eraser is invisible and it reads
  as coloured ticks. Pick the variant per tap from what's under the tap point.

## Staging the impact frame (the split instant)

Sequence: the shivers escalate, the crack writes on, then **impact 1, impact 2**, then cut straight back to full
colour on the first split drawing, with `burst[0]` and `emph` starting there.

1. **impact[0], "dark field"** (2 frames). Show blank paper, then `impact[0]` at the ball's anchor, then the ball at
   `color: 0`, `layers: {colour: false, shadow: false, construction: false}`, `weight: ~1.25`, with the crack fully
   drawn (`crack: {draw: 1, split: 0}`). Heavy graphite wedges crowd in from past the frame edge and stop on a jagged
   clearing around the ball. The clearing is bare paper.
2. **impact[1], "silhouette"** (2–3 frames). Show paper, then `impact[1]`, then the ball with
   `layers: {knockout: true, line: true, colour: false, shadow: false, construction: false}`. The burst is built from
   about 260 radial pencil strokes. They start under the ball, fan out with paper slivers between them and varying
   pressure, and either flick off or stop blunt at the jagged edge. The knocked-out ball reads as a white disc with
   its line on top. Outside the burst is paper, with a few heavy rays.
3. On both drawings, **hide everything else**: the background, the ground line and the ball's ground contact. Don't
   boil the impact drawings within their hold, and don't shake the camera: the polarity flip between the two drawings
   is the hit. A ±2–4 unit `reg` jump between them is plenty.

`impact` is the heaviest FX: about 17 ms (drawing 1) and 40 ms (drawing 2) cached at 1600² device px in Chrome with GPU, and 100–300 ms the first
time. Warm both drawings (and `emph`, about 50 ms first) offscreen during ball idle, once per seed you'll use.

## Multiples and smears (lid and bow flights)

Use multiples when the part moves more than about half its own size between drawings. On those drawings only:
- Render the part twice more, at **1/3 and 2/3 of the way back** toward its position on the previous drawing, with
  `only: 'lid'` (or `'bow'`) and the same group transform interpolated.
- Ghost nearer the part: `alpha: 0.4`. Ghost farther back: `alpha: 0.2`. On both: `color: 0.35`, `weight: 0.8`,
  `layers: {construction: false, shadow: false}`. The ghosts are lighter re-drawings, never blurred copies.
- Optionally add `trailLid` / `trailBow` behind the part: anchor on its trailing edge, rotate the context to the
  travel direction, and alternate the two drawings. Use either the ghosts or the trail on a given drawing if the
  frame gets busy; the review page shows both together.
- No multiples on the first drawing of a move (the anticipation) or on the last one before the part leaves frame.

## Colour and layers

- Graphite and coloured-pencil FX marks don't follow the colour dial. Coloured-pencil marks are `style.marks`, and
  their colours (rose, sunset, gold, lilac) nod to the logo's palette.
- The dust fill (`dust`/`dustShade`) and the burst fill (`flash`/`flashShade`) are marker regions designed at 0.64.
  They behave like the figures' colour, and at `color: 0` the dust and burst become clean genga line drawings.
- Dust has a red kage boundary with loose hatching on its front billows. Dust contact has one faint blue construction
  ground line, so `layers.construction: false` drops it.
- The burst leaves bare paper at its core, and the seam in burst 1: that paper is the light. There's no glow anywhere.

## Renderer features

Everything uses the existing format: key-line strokes with `weight/taper/tip/breaks`, `marks`, `regions` (with
`holes`, `litFade`, `crescent`), `shadows` and `occluders`. The impact staging relies on the new `weight`, `only`,
`alpha` and `crack` options. Nothing in pencil.js had to change. To rotate a trail, either `ctx.rotate` about the
anchor or pass `groups: {root: {rot, pivot: [0, 0]}}`.

One feature would help: coloured-pencil marks with per-point pressure. `marks` are uniform pressure. `colorStrokes`
has per-point pressure, but only inside the colour layer, and only when the figure has regions.
