# Strokes

Every figure, whatever its source, ends up in one format: a list of strokes,
each with `pts: [[x, y, w], …]` in the order the pen travelled (`w` is the
local line width), an `id`, and the named part (`group`) it belongs to. All
the figures in a piece share one unit so that pen widths match. On jaden, 100
units is one ruled line of Jasper's paper (about 7 mm) and the pen is about 7
units wide. `jaden-work/extract/box/box.strokes.json` is a small example;
`jaden-work/style/README.md` ("Style data format") documents the style data
that sits on top.

Strokes come from three places, and one piece can use all three.

## From Jasper's drawing

A photo of pen on paper. One extraction agent per figure, in parallel. Each
returns the strokes as JSON and SVG, in drawing order and split into named
parts, plus an overlay of the strokes on the photo, which is how you check
fidelity (`jaden-work/thumbs/extract-sheet.jpg` shows all three overlays).

`jaden-work/tools/{box,ball,text}/` are three working pipelines for the same
job. In each, code separates the ink from the paper and finds its centreline,
and the agent composes the strokes by hand against debug images: waypoints
routed along the ink for the figures, numbered skeleton segments for the
handwriting. Order and direction are read from the ink itself: a blunt blob
where the pen landed, a tapered flick where it lifted.

What to expect:

- **Ruled paper.** The rules have to be separated from the ink, and they give
  the unit.
- **Show-through.** Ghost marks on the ball photo were the box, drawn on the
  back of the same sheet.
- **Faint strokes that are real.** The ball's upper-left swirls looked like
  noise and were pen. They stay, as lighter lines.
- **Parts that will move.** Split strokes where they cross a boundary between
  parts, as the ribbon was split at the lid's edge so its top could lift.
- **The wobble is the point.** Closing a gap or dropping a stray mark is fine.
  Redrawing is not.

**Strip the photos first.** Phone photos carry GPS coordinates and this repo
is public. Run `strip_photo_metadata.py` (beside this file) and work only from
the stripped copies: crops and previews cut from an original inherit its
metadata, which is how sixteen of the box pipeline's debug images came to
carry a location (they are kept out of git).

## Authored

For things nobody drew. Offer once before authoring a piece's main figures: a
few of them in Jasper's pen is the strongest thing this look has. If Jasper
has already said no, don't ask again.

On jaden the background and the effects were authored, each by one artist
agent writing code that generates strokes and style data together. Neither
needed a change to the renderer. There are two builders, independent of each
other:

| Builder | Files | Needs |
|---|---|---|
| Python | `tools/bg/build_bg.py` (its `Fig` class, `marker_region`, the polygon helpers) with `tools/bg/hand.py` | The venv: numpy, plus scipy and scikit-image through `tools/style/geom.py`. |
| Node | `tools/fx/build.js` with `tools/fx/hand.js` (its `Fig` class: graphite strokes, coloured marks, regions, shadows, construction) | Nothing. |

Both exist to make code draw no better than Jasper does. Measured on the
Jaden drawings, long lines wander 1–1.7% of their length from the chord in
slow waves of 150–300 units, with the odd jog where the hand corrected itself,
and pen width runs 5–8 units. Nothing is evenly spaced, closed exactly, or
symmetric unless the caller asks. Check an authored figure beside real strokes
at the same scale before anyone styles it.

Everything authored so far was setting or effect, and deliberately lighter
than the subject: lines 4–5 units wide at pressure about 0.6, against Jasper's
7 at about 0.8. **An authored subject has not been done yet.** Start from
Jasper's values, put it beside the box, and expect the first review round to
have a lot to say. The artists' notes are in `jaden-work/style/bg-NOTES.md`
and `fx-NOTES.md`.

## Traced

For a logo or other official mark, where the geometry has to be exact.
`jaden-work/tools/logo/` pulls the official paths (`official.py`,
`svgpath.py`) and builds a pencil figure from them (`build.py`);
`jaden-work/style/logo-NOTES.md` explains the result. Keep a flag that swaps
the crisp original back in, so the two can be compared in place.
