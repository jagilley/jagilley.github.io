# Style brief: "For Jaden", hand-drawn pass

## What this is
A virtual present-opening page for Jasper's brother Jaden's birthday. Jaden gets GTA VI. The sequence:
1. A wrapped present.
2. Clicked open, it holds a bowling ball (a family inside joke).
3. The ball cracks open to reveal the official GTA VI logo, and "Happy birthday, Jaden!!!" appears.

v1 (`/Users/jasper/Code/jagilley.github.io/jaden.html`) works and its timing is good, but it looks like an SVG: smooth gradients, perfect geometry, uniform strokes, glow, particles and elastic tweens. **Jaden is averse to the "AI aesthetic"**, and the v1 look reads that way. The 2025 "Ghibli filter" trend made soft pastel anime with glow and sparkles a recognisable AI look in its own right, so the target is something that is visibly made by a hand.

Jasper drew the three figures himself in pen, and they were extracted to centerline vector strokes:
- `jaden-work/extract/box/box.strokes.json`, plus `.svg`, `-clean.png` and `-overlay.png`
- `jaden-work/extract/ball/ball.strokes.json`, and so on
- `jaden-work/extract/text/text.strokes.json`, and so on

Units: **100 = one ruled-line spacing** on his paper (about 7 mm). This is the same scale for all three figures, and the median pen width is about 7 units. Each JSON has `strokes[]`, and each stroke has `pts: [[x, y, w], …]` in drawing order, with `w` = local ink width. Every stroke also carries a semantic `role`/`group` (box: `lid`/`body`/`ribbon`/`bow`; ball: `outline`/`holes`/`swirls`; text: per-letter in writing order). Read the JSON headers and the `*-clean.png` files before starting.

## The target look
**A blend of pencil sketch and a loosely anime-inspired style.** The anime part should be simpler: it gives up some "completeness" in exchange for the hand-drawn feel. Think of a key-animation drawing (genga) that someone has started colouring and hasn't finished.

### Line
- **Jasper's strokes are the key line.** Keep his geometry and wobble; that is the provenance. Small corrections are fine, but don't redraw his figures.
- Render the line as **graphite pencil**:
  - a warm dark grey, not black
  - pressure taper at stroke ends
  - paper tooth breaking up the line (grain shows through, so density is not uniform)
  - an occasional second, searching pass that doesn't sit exactly on the first, kept sparing
- **Lost-and-found edges.** The key light comes from the upper left, consistently across all figures:
  - lines on the shadow side (bottom and right) are heavier
  - lines on the lit side are lighter and may break or fade out
- **Construction lines.** Add a few light blue "col-erase" pencil construction marks underneath, the way an animator roughs in forms: a loose guide ellipse for the ball, centre lines, a box guide or two. Keep them sparse; a few marks, not a grid.

### Anime layer (cel logic, hand-applied)
- Each form gets **one base tone and one hard-edged shadow shape** (kage), designed like anime shadow shapes, not gradients. Examples:
  - a crescent on the ball's lower right
  - the lid's cast shadow on the box body
  - the box's right side
  - a ground contact shadow under the box and under the ball
- **Highlights** are shapes left as paper white, sometimes edged with a blue-pencil line, like the ball's specular highlight.
- In real genga, shadow boundaries are marked with **red coloured pencil** and highlight boundaries with **blue**. Use that vocabulary: a red boundary line plus loose hatching for a shadow area.
- **Colour is applied by hand and left unfinished:**
  - coloured-pencil hatching, or a quick flat wash or marker
  - it doesn't reach the lines everywhere and is slightly off-register
  - paper tooth shows through
  - colour stops short or fades out on the lit side
  - some parts are left as line only
- **Two presets on one dial:**
  - `color: 0` = **"genga"**: graphite line, blue construction, red/blue shadow and highlight boundaries, sparse hatching, almost no colour.
  - `color: 1` = **"quick colour"**: the same drawing with loose flat cel colour plus its shadow tone added.

  Everything in between should look good too, because the animation may bring colour in at the reveal.

### Palette
A starting point carried over from v1; refine it, but keep it few and pencil-friendly:

| Role | Colours |
|---|---|
| Paper | warm off-white, ≈ `#f3eee3` |
| Graphite | ≈ `#2f2c30` |
| Construction blue | ≈ `#7aa6dc` |
| Shadow-line red | ≈ `#d4574d` |
| Box wrapping | teal ≈ `#3fa79a`, shadow ≈ `#2a7c78` |
| Ribbon / bow | pink ≈ `#ee7290`, shadow ≈ `#c04a6c` |
| Ball | deep violet ≈ `#4a3a9a`, shadow ≈ `#281d5e`; swirls violet/pink (`#b77be6`, `#ff86c4`); finger holes near-black violet |

The greeting stays mostly graphite. One restrained colour touch is allowed if it helps, such as a coloured-pencil offset shadow or a single underline flourish. Propose it as an option, not the default.

### Things that read "AI/SVG": avoid all of them
- smooth multi-stop gradients, glow, bloom, soft drop shadows, sparkles
- perfect circles, ellipses or straight lines, uniform stroke width, symmetric anything
- over-rendering and completeness
- **the rough.js / Excalidraw "sketchy" look**: doubled jittery outlines and zig-zag hachure fill are themselves a recognisable web aesthetic
- perfectly regular hatching: spacing, angle and length must vary like a hand
- per-pixel random noise that looks like a filter

Hatching goes at a consistent right-handed angle (strokes rising lower-left to upper-right, roughly 55–70°), with natural variation.

## Technical requirements (the assets will be animated next)
- **Vectors in, style at render time.** Put the style in a small renderer, `jaden-work/style/pencil.js`, that draws a figure from its stroke JSON plus a per-figure style file onto a canvas 2D context. No baked raster art; the paper-grain texture may be generated once at startup.
- **Per-figure style data:** `jaden-work/style/<figure>.style.js`. It holds:
  - fill regions as polygons derived from the strokes, such as the box body, lid, ribbon, bow loops, ball disc and holes
  - shadow shapes and highlight shapes
  - construction marks
  - the palette assignments

  Ship data as `.js` files that assign onto `window.JADEN` (for example `window.JADEN.box = {strokes, style}`), so pages work from `file://` without fetch.
- **API, roughly:** `Pencil.render(ctx, figure, {seed, color, draw, groups, scale, layers})`.

  | Option | Meaning |
  |---|---|
  | `seed` | **Deterministic:** the same seed gives an identical frame. Boil = cycling 2–3 seeds at about 8 fps; each seed changes the jitter, hatching and grain subtly, not wildly. |
  | `color` | 0–1, the dial above. |
  | `draw` | 0–1 write-on progress, or per-stroke progress, drawing the strokes in order along their length. The greeting will be revealed this way. |
  | `groups` | Per-group transforms or visibility, e.g. `{lid: {x, y, rot, alpha}}`, so parts can move independently: the lid lifts, the bow flies off, the ball halves separate. |
  | `layers` | Toggles for paper / construction / colour / shadow / line. |

- **Performance:** one figure at about 800 CSS px on a 2× display should render in well under 16 ms on a laptop, so boil and animation can run live. Cache what you can per seed.
- **Review page:** `jaden-work/review/index.html`.
  - For each figure:
    - the original photo crop (`extract/<fig>/<fig>-overlay.png` is fine, or re-crop it)
    - the plain extracted vectors
    - the styled figure at `color: 0`, `0.5` and `1`
    - a live canvas with a colour slider, a boil on/off toggle (8 fps), a replay button for the write-on, and layer toggles
  - Plus a **"together" panel**: all three figures on one sheet of paper at their relative sizes, to judge coherence.
  - Also export static PNGs of each figure at `color: 0` and `color: 1`, and of the together panel, to `jaden-work/review/png/`. Use headless Chrome:

    ```
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --screenshot=… --window-size=…
    ```

    or a small export path in the page.
