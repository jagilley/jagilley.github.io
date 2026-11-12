# pencil.js: the renderer and the figure data format

`pencil.js` draws vector strokes as graphite pencil with a hand-applied colour
pass, onto a canvas 2D context. Everything is vector until render time; the
only raster is a 256² paper-tooth height field generated once at startup. All
media and the paper share that one tooth. Graphite and coloured-pencil strokes
carry it in their own frame, so boil frames nudge the geometry without
re-rolling the grain.

## In this kit

| Path | What |
|---|---|
| `pencil.js` | The renderer. Copy it into a piece; don't load it from here. |
| `example/box.js`, `example/ball.js` | Two example figures (a present and a bowling ball, from pen drawings), in the format described below. |
| `demo.html` | Renders both examples with a few query options. Start here to see the API used. |
| `tools/` | Capture, authoring and photo tools; see the skill's reference files. |

```html
<script src="pencil.js"></script>
<script src="example/box.js"></script>   <!-- window.GENGA.box  = {strokes, style} -->
<script src="example/ball.js"></script>  <!-- window.GENGA.ball -->
```

Works from `file://` (no fetch). The global is the data files' choice, not the
renderer's: a piece uses its own.

## Units and coordinates

All the figures of a piece share one unit, with y pointing down. In the
examples **100 = one ruled-line spacing** of the paper they were drawn on
(about 7 mm), and the pen is about 7 units wide. Figures are drawn at their
true relative sizes, so pen widths match. `style.bounds` is a figure's extent
including shadows and construction lines.

## API

```js
Pencil.render(ctx, GENGA.box, {
  // the drawing
  seed: 1,          // boil seed: a small rigid nudge per stroke/mark. Same options, same pixels.
  color: 0.64,      // colour amount: 0 = pencil only ... 1 = quick colour. Default 0.64, the resting look
  colorSeed: 0,     // re-colour by hand: re-rolls marker-end positions/lengths and edge wobble, subtly (0 = the base look)
  reg: {dx: 0, dy: 0, rot: 0},   // this drawing's registration on the pegs (units, radians), about the figure centre
  weight: 1,        // line heaviness: > 1 presses every line harder and wider (impact frames)

  // build-up: each layer added by hand in turn (each 0..1; all complete when omitted)
  build: {line: 1, construct: 1, color: 1, shadow: 1},
  draw: 1,          // write-on (same as build.line, and wins if both are given): a number 0..1 on the natural pen
                    //   timeline, or an array by stroke index, an object by stroke id, or fn(id, index) -> 0..1

  // parts
  groups: {         // per-group transforms, see "Groups"
    lid: {x, y, rot, scale, pivot: [x, y], sx, sy, ox, oy, alpha, visible},
    root: {...}     // the whole figure (applied before `clip`); also takes sx/sy/ox/oy
  },
  only: 'bow',      // render just these groups (a name or a list) and their children: multiples / smears
  alpha: 1,         // whole-figure alpha (e.g. 0.3 for a ghost copy)
  show: ['body-rim'],       // reveal hidden designed strokes (the box's rim, for when the lid is off)

  // placement and compositing
  x: 0, y: 0, scale: 1,     // placement in ctx space: px = x + unit * scale
  layers: {paper: false, knockout: false, construction: true, colour: true, shadow: true, line: true},
  clip: polygonOrPath2D,    // figure units, under groups.root
  colourClip: polygon,      // extra clip for the colour layer only (keeps colour off-register short of a cut edge)
  accent: 'underline',      // a named entry of style.accents (an optional colour touch); accentAmount 0..1 animates it
  blend: 'multiply',        // default; use 'normal' only on a transparent canvas (see Compositing)
});
```

Helpers:

| Call | What it does |
|---|---|
| `Pencil.paper(ctx, x, y, w, h, {scale, seed})` | Paper fill (colour plus faint tooth). Pass the same `scale` as the figures so the grain matches. |
| `Pencil.fit(fig, w, h, pad)` | Returns `{scale, x, y}` that centres the figure's bounds in a w×h box. |
| `Pencil.line(ctx, pts, {width, pressure, color, level, seed, taper, draw, alpha, x, y, scale})` | Draws an ad-hoc line in the same hand (emphasis lines, speed lines). Graphite goes through the same pressure/tooth pipeline as the key line; a `color` makes it coloured pencil. `draw` writes it on. |
| `Pencil.regionPath(fig, name)` | Returns a Path2D of a fill region. `regionPath(GENGA.ball, 'disc')` is the whole ball outline. |
| `Pencil.timeline(fig)` | Returns `[{id, start, end, startMs, endMs, length}]`: where each stroke sits in `draw` 0..1 and in natural time. |
| `Pencil.writeDuration(fig)` | Total write-on time at natural pen speed (ms). |
| `Pencil.warm(fig, {scale, color, seeds})` | Builds the figure's caches and tooth patterns for drawing at `scale` (device px per unit). Call it per figure while something else is on screen. |
| `Pencil.boilSeed(ms, seeds=[1,2,3], fps=8)` | Returns the boil seed for a timestamp. |
| `Pencil.DEFAULT_COLOR` | 0.64. |
| `Pencil.config` | Global knobs: `toothScale`, `baseLevel` (graphite pressure), `weightGain`, `widthScale`, `minDensity`, `boil` (`amp`, `rot`), `register`, `hatchAngle`. |

### Build-up

`build: {line, construct, color, shadow}`, each 0..1 and complete (1) when omitted:

| Key | What appears |
|---|---|
| `line` | The drawn strokes, written on in their stored order on the timed pen model (= `draw`). Visible designed strokes, such as the bow knot, come last. |
| `construct` | Blue construction marks, drawn on one after another along their length. |
| `color` | The marker, region by region in `regionOrder`, in individual broad chisel passes laid side by side from the shadow side. Each pass has its own width (0.7–1.3×), angle (±6°, drifting from pass to pass), a slight arc and wobbly edges, and sweeps along its length with a rounded-chisel tip. Where a region keeps a bare lit edge (`litFade`) the passes run head-on toward the light and stop where the colourist stopped; otherwise they zig-zag at the region's `strokeAngle`. Where a fresh pass laps over the one before, the ink is darker and dries back over the next few passes. Coloured-pencil strokes (the ball's swirls) follow, along their length. At `color: 1` the layer is exactly the finished one, so there is no pop on the last drawing. The box takes 34 passes (12 on its body) and the ball 21. |
| `shadow` | 0–0.4: red shadow boundaries, then blue highlight contours, drawn on. 0.15–0.7: hatching strokes appear in the order the hand laid them. 0.45–1: the shadow tone arrives shape by shape in passes, then the ground passes and contact lines. |

To have a figure draw itself from nothing, step `line` 0→1, then `construct`,
`color` and `shadow`. Shadow tone never appears where the base marker hasn't
been laid yet. `demo.html?build=0.7` shows one moment of it.

### Per-drawing variation (frame-capped animation)

Give each new drawing:
- a new `seed`, taken from a small pool such as 1–6 (nudges are cached per seed);
- a small `reg`, about ±0.5–1 unit and a hair of rotation;
- optionally a new `colorSeed` (1, 2, 3 …) and a colour amount ±0.03.

Design-seed features don't move between drawings: hatching layout, gaps in
colour, bare ends. Nothing is tweened inside the renderer: every call draws
one complete drawing.

### How the graphite line is made

Each key stroke is one ribbon. Its width comes from the stroke's own pen
width, with uneven tapers taken from its own landing and lift. Its *pressure*
(0..1) follows the line weight.

Each pressure level has a coverage pattern. Peaks fill first, pits never drop
below `minDensity` (so a light line stays one line), and even full pressure
leaves about 10% of the pits showing (heavy is the same pencil pressed
harder). Each stroke is drawn as coverage into a scratch buffer at three
nested widths, the outer ring a little lighter. Overlaps take the max, so
there are no seams. The result is tinted warm graphite (`#3a3532`) and
multiplied onto the canvas.

The pattern sits in the stroke's own frame. Boil is a small rigid nudge per
stroke (about ±1 unit and a fraction of a degree), so a stroke's grain is the
same on every boil frame. When a tooth pit is smaller than a device pixel, the
threshold softens and the edge erosion halves, so small renders stay
continuous instead of crumbling.

### Compositing

Media are **multiplied** onto what is underneath, as pigment on paper would
be. Draw `Pencil.paper` (or any opaque paper-coloured backdrop) first; colours
are calibrated so that teal on paper reads as the palette's teal. On a
transparent canvas, either pass `blend: 'normal'` or set the canvas CSS to
`mix-blend-mode: multiply` over a paper background.

Figures do not hide what is behind them. When one must occlude another,
render it with `layers: {knockout: true}`. Each group's `occluders` polygon is
then filled with paper first.

### Groups

| Figure | Groups (parent) | Notes |
|---|---|---|
| box | `body`, `ground`, `lid`, `lidShadow` (body), `bow` (lid) | `ribbon-*-lid` strokes travel with `lid`; the bow (loops, tails, a small designed knot) rides on the lid unless given its own transform. The lid's teal is whole under the bow, so taking the bow off leaves no notches. Fade `lidShadow.alpha` as the lid lifts. Show `'body-rim'` once the lid is off. |
| ball | `ball`, `ground` | Use the `crack` option for the crack and halves (below). |

A group transform is applied in three steps:
1. translate(x, y);
2. rotate and scale about the pivot (the style default, or `pivot` in the options);
3. squash/stretch `sx`/`sy` about (`ox`, `oy`), which defaults to the group's **base centre**, the middle of the bottom of its extent, so a squash sits on the ground.

Parents compose and alpha multiplies down the chain. `only` renders just the
named groups and their children. Use it with `alpha` to draw multiples or
smears of a part on one drawing.

### Write-on

`draw: t` reveals strokes in their stored order on a timed pen model:
- The pen eases in at each stroke start and slows through tight turns. It runs at `style.penSpeed` (units/s) on straight runs and eases out at the end.
- A pen lift takes 100 ms plus time in proportion to the travel. Add 150 ms at a word gap and 300 ms at a line break.
- Dots take 70 ms.

`t` is normalised time, so `draw = elapsed / Pencil.writeDuration(fig)` plays
at natural speed. A stroke in progress has a blunt pencil tip, and its end
taper appears only when it finishes. Searching passes appear once their stroke
has passed them. Only the key line is written on; construction, colour and
shadow follow the other options.

### Colour dial

| `color` | What you see |
|---|---|
| 0.64 | **The resting look** (the default). |
| 0 | Graphite line, blue construction, red shadow boundaries with loose red hatching, blue highlight contours, graphite hatching in holes and ground contact. |
| ~0.1 to 0.7 | Marker base arrives. Its alpha ramps up while its lit-side front sweeps from the shadow side toward the light. The front is made of marker strokes of uneven length (a slow wave, the odd stroke running to the outline, the odd early stop) with rounded chisel ends. On the box they follow the stroke angle and round into the most-lit corner; on the ball and the bow loops they run radially toward the lit pole. Construction fades wherever colour lands. |
| ~0.3 to 0.9 | Shadow tone is multiplied over the base, only where colour has landed. Hatching fades to its `keep` (30–50%); red lines fade to ~65%. |
| 1 | Flat marker colour (no fake streak texture) plus shadow tone. The colour runs under the line, with an occasional gap and spill. Bare paper is left at the lit ends. |

### A piece-specific feature: the crack

The renderer has grown features for the piece it was built for, and a new
piece should feel free to do the same in its own copy. The example ball can
crack and split:

`crack: {draw, split, spread = 70, lift = 30, tilt = 0.22, pts = style.crack, width = 7.5}`

- **`draw` 0..1 with `split: 0`** writes the crack on across the intact ball, from the top, heavier than the outline.
- **`split` 0..1** separates the halves. The ground contact is rendered once and stays put. Each half is clipped to its side of the crack, its colour stopping a few units short of the break, off-register. Each half swings out about the contact point, and a hatched inner wall opens along each broken edge.
- **`half: -1 | 1 | {side, wall, pts, width}`** renders one half in place, for callers that move the halves themselves as sprites.

Try `Pencil.render(ctx, GENGA.ball, {crack: {split: 0.6}})`.

### Performance

Geometry is built once per figure (the design build); a boil seed only picks
rigid nudges, so a fresh seed for every drawing is cheap. Measured at
1600×1600 device px in headless Chrome on a laptop:

| Frame | Time |
|---|---|
| A complete box or ball | ~4–5 ms |
| Build-up frames | ~4–6 ms |
| The ball's halves (three renders) | ~8.5 ms |
| First render of a figure | ~130–670 ms (design build and tooth patterns) |

Use `Pencil.warm(fig, {scale})` for each figure before it is needed, and keep
boil seeds in a small pool.

## Style data format

A figure is `{strokes, style}`. `strokes` is the extraction output:
`{figure, unit, viewBox, groups, strokes: [{id, role, group, closed, pts: [[x, y, w], …]}]}`,
with `pts` in drawing order and `w` the local pen width. In `style`, filled
shapes and construction are in whole units and pencil-drawn marks in half
units; drawn strokes keep their precision, because the pen timing reads their
curvature. `style` holds:

| Key | Contents |
|---|---|
| `bounds` | `[x0, y0, x1, y1]`: figure extent, used by `fit`. |
| `designSeed` | Lays out hatching, colour gaps and the marker-stroke ends. The boil seed only nudges geometry. |
| `palette` | Name → hex, as each colour should *read* on paper. |
| `groups` | `{name: {parent, pivot}}`. |
| `lines` | Per stroke id: `group`, `weight[]` (per source point, about 0.55–1.45: line weight from lost-and-found or downstroke emphasis, drives pressure and a little width), `taper: [start, end]` (units) and `tip: [startMin, endMin]` (both derived from the pen width at each end), `land` (extra pressure for a heavy pen landing), optional `breaks: [[f0, f1, ramp]]` (gaps, as fractions of length, ramped over `ramp` units), `fade: [[f0, f1, min]]`, `level` (pressure multiplier), `dot` (lands heavy, lifts light). |
| `extraStrokes` | Designed strokes that were not in the drawing: `{id, group, pts, hidden}`. |
| `second` | Searching passes: `{stroke, from, to, offset, level}`. |
| `regions` | Fill regions: `{group, color, shade, polys: [[x, y]...], holes?}`. `color` is the base marker; `shade` is the tone shadow shapes take on this region. Optional hand controls: `inset` (edge offset; by default the colour runs ~1.4 units under the line with occasional gaps, and setting it turns the gaps off), `outset` (spill past shadow edges), `retreat` (how far colour pulls back at low `color`), `litFade` (fraction left bare at the most-lit end, as a front across the light), `crescent` (a bare crescent at the lit pole, as a fraction of the radius), `slivers` (more frequent paper gaps), `frontOf` (share another region's front), `opacity`, `strokeAngle`/`strokeWidth` (marker direction and width for the front's stroke ends). Regions are painted in `regionOrder`; later ones cover earlier ones. |
| `colorStrokes` | Coloured-pencil strokes painted over the base (the ball's swirls): `{id, group, color, pts: [[x, y, width, pressure]...], frontOf}`. Grain runs along the stroke. |
| `shadows` | Shadow shapes: `{id, group, polys, on: [regions], edge: [polylines], hatch: {color, spacing, level, full?, fade?, keep?}, tone?, passes?, noFill?}`. Each is multiplied over each host region as that region's `shade`, clipped to where colour landed. `edge` is the red boundary line. Hatch options: `full` runs each hatch from line to boundary, `fade` thins it toward the light, and `keep` is how much survives at colour 1. `tone` shadows sit on the paper; with `passes` (`[{pts, width}]`) they are drawn as overlapping marker passes instead of a shape. `noFill` means hatching only. |
| `highlights` | `{id, group, poly, edge}`: left as paper inside colour; `edge` is a blue pencil contour that yields as colour arrives. |
| `marks` | Small pencil marks drawn with the shadow layer, e.g. a ground contact line: `{group, pts, width, level, color}`. |
| `construction` | `{group, pts, level, width}`: blue col-erase marks. |
| `occluders` | `{group, poly}` for `layers.knockout`. |
| `accents` | Optional colour touches, by name. |
| `disc`, `crack` | Ball only: the disc for clipping halves, and the crack polyline. |
| `penSpeed` | Write-on pen speed on straight runs, in units/s. |

All polygons are clockwise on screen (positive shoelace area with y down).

### Where style data comes from

It is generated, never hand-edited. The examples came from a Python builder
that derives fill regions from the strokes (raster booleans at half-unit
resolution, traced back to polygons; `tools/geom.py` has those helpers) and
holds the designed shapes (shadow shapes, highlights, construction) as plain
numbers. That builder is specific to its figures and is not in this kit; a
new piece writes its own. For figures authored in code, `tools/hand.js`'s
`Fig` class builds strokes and style together.

## Visual rules baked in

- Key light from the upper left, everywhere: `TO_LIGHT = (-0.6, -0.8)`.
- Shadow-side lines are denser (more pressure) and a little wider. Lit-side lines are lighter and grainier, and a couple break or fade with a ramp.
- Hatching rises lower-left to upper-right at about 62°, with varied spacing, length and angle. It thins toward the light.
- Colour sits slightly up and to the right of the line and mostly runs under it. It gives out on the lit side in marker-stroke ends and spills a little past shadow edges.
- No gloss marks, glints or drop shadows.
- Handwriting stays graphite. Its downstrokes are heavier, as with a real pencil.
