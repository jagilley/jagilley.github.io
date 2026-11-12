# GTA VI logo: notes for the director

## Files

| Path | What |
|---|---|
| `resources/jaden/logo.style.js` | Runtime data (~156 KB, integer coordinates): `JADEN.logo = {strokes, style, render}`. Generated. |
| `resources/jaden/logo-official.js` | `JADEN.logoOfficial`, the crisp official mark (~20 KB), standalone so it still works as a fallback if the logo data fails to load. Load it with its own `<script>` tag. Generated. |
| `jaden-work/tools/logo/build.py` | The builder. Run `jaden-work/venv/bin/python -I jaden-work/tools/logo/build.py`. |
| `jaden-work/tools/logo/official.py`, `svgpath.py` | Pull the official trace out of `jaden.html` (`<symbol id="gtaVI">`, `<symbol id="gtaWord">`, their gradients) and map it to logo units. |
| `jaden-work/tools/logo/shot.sh`, `info.sh` | Headless PNG capture, and write-on timing plus a rough bench. |
| `jaden-work/review/logo.html` | Preview: phone and desktop sizes at colour 0 / 0.64 / 1, the official mark beside them, the logo over the ball halves, and a live canvas with write-on/build-up, boil, a rise-and-slam demo and the dev flag. `?r=frozen` previews against `pencil.frozen.js`. |
| `jaden-work/review/png/logo-*.png` | Static exports of the above. `logo-two-hit.png` shows the VI alone, the wordmark alone (scaled), `only: 'word'`, and both with a squash, over stripes to check the paper-out. |

## Units, anchor, groups

- Units: 100 = one ruled line, pen width about 7. The logo is **1400 wide and 1085.9 tall**; the ball is about 800 across.
- **Anchor: (0, 0) is the base centre** of the official bounding box. The V's tip touches y = 0, and the I's foot is at y ≈ −24. The mark spans x −700…700 and y −1085.9…0.
- `style.bounds` is `[-756, -1137, 743, 65]`, which includes the blue construction lines that run past the mark.
- Coordinates are integers; widths keep one decimal and pressures two. Half a unit is 0.04% of the logo, and a before/after diff showed only grain placement changes.
- Groups:

  | Group | Pivot | Contents |
  |---|---|---|
  | `vi` | `[0, 0]`, the base centre | The big VI. |
  | `word` | `[143.4, -612.6]`, the slab's centre | The "grand theft auto" wordmark. |

  `sx`/`sy` squash is about each group's base centre, as in the renderer.

## How to draw it

**Use `JADEN.logo.render(ctx, opts)`, not `Pencil.render` directly.**

- It takes the same options as `Pencil.render`: `seed`, `color`, `colorSeed`, `reg`, `weight`, `build`/`draw`, `groups.vi`/`word`/`root`, `only`, `alpha`, `x`, `y`, `scale` and `layers`.
- It draws two passes, the VI and then the wordmark.
- Before the wordmark it fills the slab, out to its rim, with fresh paper that matches `Pencil.paper`. This is how the official mark layers: the letters stay white, and the VI's lines and colour don't show through them.
- A single `Pencil.render` call would show the VI through the letters.

### The two-hit reveal (the VI rises alone, then the wordmark slams down)

Each part draws alone, with its own paper-out, under its own group transform. The paper-out follows `x`, `y`, `rot`, `scale`, `sx`/`sy`, `reg` and `groups.root`.

```js
// the VI rising alone (the slab isn't drawn and nothing is papered out for it)
JADEN.logo.render(ctx, {seed, color, knockoutVI: true, groups: {vi: {y: -300, sx: 0.9, sy: 1.15}, word: {visible: false}}});
// the wordmark slamming down onto it: both parts, the wordmark scaled about its slab centre
JADEN.logo.render(ctx, {seed, color, knockoutVI: true, groups: {vi: {}, word: {scale: 1.6}}});
// a ghost/multiple of the wordmark alone
JADEN.logo.render(ctx, {seed, color, only: 'word', alpha: 0.35, groups: {word: {scale: 2.2}}});
```

- `only: 'vi'` and `only: 'word'` work as well as `visible: false`.
- A wordmark with `alpha` < 1 papers out at that alpha, so the VI shows through a ghost.
- With `knockoutVI`, the VI's paper-out is its exact silhouette. The notch and the gap between V and I stay open.
- The renderer's own `layers.knockout` works, but its paper is visibly grainier than the page's, so the letters look dirty.

Options specific to `JADEN.logo.render`:

| Option | Effect |
|---|---|
| `knockoutVI: true` | Also papers out whatever is behind the VI, such as a sky wash. |
| `layers.knockout: false` | Skips all paper fills. |
| `only: 'word'` with `alpha` | Draws multiples or ghosts of the wordmark slam. |

```js
JADEN.logo.render(ctx, {x, y, scale, seed, color: 0.64,
  groups: {vi: {y: -40, sx: 1.06, sy: 0.92}, word: {scale: 1.5, alpha: 1}}});
```

During a write-on (`draw` or `build.line`), the slab is papered out only once its outline strokes (`style.slabStrokes`) are complete. In that drawing the VI lines under the slab disappear, as if erased.

### Write-on and build-up

The key line is drawn in this order:
1. The VI silhouette in 7 strokes: the top-left edge, down the left arm, the notch, the top-right edge, the I's right side, the I's left side and foot, then the V's right arm.
2. The field contour in 7 strokes.
3. The slab outline in 4 strokes.
4. The letters in reading order, each one's outline followed by its counters.

The R of "grand" and the h of "theft" are one official contour, split at the neck between them.

| Part | Time (at `penSpeed` 5000) |
|---|---|
| Natural total | ≈ 14.2 s |
| VI | 0–5.4 s |
| Wordmark | 6.2–14.2 s |

The wordmark's time is mostly pen lifts between letters, so play it faster.

Use `build: {line, construct, color, shadow}` for the full hand build-up. Plain `draw` shows the hatching straight away. In `build.color`, the marker is laid VI first (plum band, then the field bands from the bottom up), then the slab.

### Dev flag: the crisp official mark

This lives in `resources/jaden/logo-official.js`. `JADEN.logoOfficial.ready.then(...)` resolves once the images have loaded. After that, `JADEN.logoOfficial.draw(ctx, {x, y, scale, groups})` draws the original Wikimedia symbols:
- at the same units, anchor and pivots;
- with group `x`, `y`, `rot`, `scale` and `alpha` honoured (it ignores `sx`/`sy`/`reg`);
- returning `false` until loaded.

The raw strings are `JADEN.logoOfficial.svg.vi` and `.word`.

## What's in the data

### Line

The graphite key line runs exactly on the official contours. Straight edges keep the official corners; the ghost overlay in `logo.html?export=solo&layers=line&ghost=0.4` checks this.

The hand is added only as:
- a sub-unit wander (about ±0.8);
- tapers;
- small corner overshoots (the two V diagonals cross just past the tip);
- two searching passes;
- lighter lit-side edges, with one small break on the top-left edge and fades along the top edges.

The VI has two contours: the silhouette and the colour field. The letters use a slightly thinner, lighter line.

### The white keyline

The keyline is **paper left on purpose**: a `highlight` that cuts it out of the colour, with a blue genga contour on its outer edge that yields as colour arrives.

I tried graphite on both sides of it (`build.py lines`). At phone size that pinches the white into a dark double line, so I dropped it.

### Dark keyline

This is the `vi-plum` band. Its base fades to magenta-purple (`vi-plum-low`), as in the official gradient. The official near-black outer half is a second marker tone (the `vi-keyline-deep` shadow shape), so it deepens with the shadow dial: mid-dark at 0.64 and near-black at 1. At colour 0 it gets graphite hatching that thins toward the light.

### The sunset field

The smooth gradient becomes **four marker bands plus a sun spot**:

| Zone | Colour |
|---|---|
| Blue | `#5b61d2` |
| Orchid | `#bf56cd` |
| Pink | `#fb69ad` |
| Orange | `#ff8c47` |
| Sun spot (yellow-orange) | `#ffb548` |

- The sun spot sits at the I's foot, where the official radial glow is.
- The bands are painted bottom-up. Each band's lower edge is a row of chisel-cut marker ends of uneven length that lies over the band below; the band below runs up under it, so seams show the upper colour's ends rather than paper.
- The colourist stopped short at the lit end: the top of the V's left arm (`litFade` on the blue band).
- No gradients, glow or blur anywhere.

### Wordmark

The letters are **paper**, with graphite outlines from the official letterforms, on a **dark-plum slab** (`ink #1d0030`, the official colour).

Phone legibility (QA L1):
- The slab is laid in two marker coats (`word-block`, `word-block-2`). At 0.64 it reads near-solid: the darkest pixels are about `#170422`, against the official `#1c022c` at the same size.
- The letter outlines sit 1.8 units outside the official letter edges, so they merge into the slab.
- The slab's holes are pre-shifted against the colour layer's off-register offset (`Pencil.config.register`, default `[2.2, -1.6]`). The plum therefore meets each letter edge instead of creeping into its top-right. If that default changes, update `REGISTER` in `build.py`.
- No construction lines cross the letters.
- The letters are clean paper.

- **At colour 0:** the slab is a dense graphite hatch (the "dense graphite fill"), so the knocked-out letters read even with no colour.
- **At 0.64:** plum marker goes over it, and the hatch is kept at about 64%.
- **The official gradient rim:** coloured-pencil passes hugging the slab, gold at the top-left through coral, pink and magenta to violet.

At phone size (logo 340 CSS px) the letters are about 50 px tall, so outlines plus the fill read cleanly. Fills alone would lose the letters at colour 0.

### Construction

These are a letterer's guides in blue:
- the top line;
- the two V edges, run on so they cross under the tip;
- the I's base and right edge;
- two guides for the wordmark, one above the slab and one below it.

## Weak spots

- **Cost.** Two passes over the whole bounds, 39 long strokes and a dense slab hatch. In headless Chrome a full logo frame measured about 3–4× the ball (≈ 12 ms at 700×560 CSS, 2×, in a quiet moment; the machine was heavily loaded later). During holds, cache each boil seed's frame to an offscreen canvas: the logo is static apart from the seed. Call `Pencil.warm(JADEN.logo, {scale})` during the sketch-in.
- **Band seams** read as marker ends at desktop size, but they are a touch busy at 0.3–0.5 colour, where lit-edge retreat opens small paper slivers.
- **The bare top-left of the V's arm** at low colour is house style, but it is the one place the mark is visibly incomplete.
- **Write-on erase.** During a write-on, the VI under the slab vanishes in one drawing when the slab outline closes. It's a deliberate "erase", but check it reads.
- **Ball halves and occlusion.** In `logo.html` the ball halves (`crack.split: 1`, `layers.knockout: true`) did not hide the V's tip behind the left half. If the logo should rise from behind the halves, check the occlusion order in the page.

## Renderer features that would help (worked around in data)

1. **Knockout paper that matches `Pencil.paper`'s grain**, or a per-group occlusion order inside one render. Either would let one `Pencil.render` draw the logo, and `JADEN.logo.render` could go.
2. **Restrict `deviceBox` to visible groups.** The two passes each process the full bounds.
3. **A designed colour front.** Band seams are baked into the region polygons, because `litFade` fronts only follow the light.
4. **Highlights and shadow tones with holes.** Rings are passed as keyhole polygons: one ring with zero-width bridges.
