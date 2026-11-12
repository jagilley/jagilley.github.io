# Strokes

Every figure, whatever its source, ends up in one format: a list of strokes,
each with `pts: [[x, y, w], …]` in the order the pen travelled (`w` is the
local line width), an `id`, and the named part (`group`) it belongs to. All
the figures in a piece share one unit so that pen widths match. In the
examples, 100 units is one ruled line of the paper they were drawn on (about
7 mm) and the pen is about 7 units wide. `../kit/example/box.js` holds a
figure's strokes and its style data together; `../kit/RENDERER.md` ("Style
data format") documents both.

Strokes come from three places, and one piece can use all three.

## From the user's drawing

A photo of pen on paper. One extraction agent per figure, in parallel. Each
returns the strokes as JSON and SVG, in drawing order and split into named
parts, plus an overlay of the strokes on the photo, which is how you check
fidelity.

There is no extraction code in the kit, because each drawing needed its own.
The first piece's work folder has three working pipelines (`tools/box/`,
`tools/ball/`, `tools/text/`), and they share a shape:

1. Normalise the photo's lighting and separate the ink from the paper and its
   rules, by colour.
2. Find the ink's centreline (a pruned skeleton, or a darkness map to route
   along) and its local width (a distance transform).
3. The agent composes the strokes by hand against zoomed debug images:
   waypoints joined by the shortest path along the ink for the figures,
   numbered skeleton segments put in writing order for the handwriting.
4. Export, and render the overlay.

Order and direction are read from the ink itself: a blunt blob where the pen
landed, a tapered flick where it lifted.

What to expect:

- **Ruled paper.** The rules have to be separated from the ink, and they give
  the unit.
- **Show-through.** Ghost marks on one photo were another figure, drawn on
  the back of the same sheet.
- **Faint strokes that are real.** Some swirls on the ball looked like noise
  and were pen. They stay, as lighter lines.
- **Parts that will move.** Split strokes where they cross a boundary between
  parts, as the ribbon was split at the lid's edge so its top could lift.
- **The wobble is the point.** Closing a gap or dropping a stray mark is fine.
  Redrawing is not.

**Strip the photos first.** Phone photos carry GPS coordinates, and a repo may
be public. Run `../kit/tools/strip_photo_metadata.py` (lossless) and work only
from the stripped copies: crops and previews cut from an original inherit its
metadata, which is how sixteen debug images on the first piece came to carry a
location.

## Authored

For things nobody drew. Offer once before authoring a piece's main figures: a
few of them in the user's own pen is the strongest thing this look has. If the
user has already said no, don't ask again.

On the first piece the background and the effects were authored, each by one
artist agent writing code that generates strokes and style data together.
Neither needed a change to the renderer. The kit has both of the drawing hands
they used:

| File | What it gives you | Needs |
|---|---|---|
| `../kit/tools/hand.js` | Stroke primitives and a `Fig` class that collects graphite strokes, coloured marks, fill regions, shadows and construction, and builds a complete `{strokes, style}` figure. | Node, nothing else. |
| `../kit/tools/hand.py` with `geom.py` | Stroke primitives (`hand_line`, `loop`, `widths`, `lit_weight`, `marker`) and geometry helpers, including raster booleans for deriving regions. No figure assembler: the first piece's was part of its background builder. | numpy, scipy, scikit-image. |

Both exist to make code draw no better than a person does. Measured on the
first piece's drawings, long lines wander 1–1.7% of their length from the
chord in slow waves of 150–300 units, with the odd jog where the hand
corrected itself, and pen width runs 5–8 units. Nothing is evenly spaced,
closed exactly, or symmetric unless the caller asks. Check an authored figure
beside real strokes at the same scale before anyone styles it;
`../kit/example/` has two to compare against.

Everything authored so far was setting or effect, and deliberately lighter
than the subject: lines 4–5 units wide at pressure about 0.6, against the
pen's 7 at about 0.8. **An authored subject has not been done yet.** Start
from the pen's values, put it beside the example box, and expect the first
review round to have a lot to say.

## Traced

For a logo or other official mark, where the geometry has to be exact. Parse
the official vector paths, map them into the piece's units, and build a pencil
figure from them: a graphite outline along the real paths, fills as marker
regions, a gradient as a few hand-coloured bands. Keep a flag that swaps the
crisp original back in, so the two can be compared in place.
