# The look

A key-animation drawing that someone has started colouring and hasn't
finished: pencil sketch blended with a loosely anime-inspired style that gives
up completeness to keep the hand.

See it before reading further. `look.jpg`, beside this file, is the two
example figures as they were approved. `../kit/demo.html` is the live version:
`?color=0` is pencil only, `?color=1` is full colour, `?build=0.5` is a figure
part-way through drawing itself. `../kit/RENDERER.md` ("Visual rules baked
in", "Colour dial") is how the renderer implements what follows.

## In the first user's words

These are verbatim from the person the first piece was made with, and they are
the taste anchors for the look. When a choice isn't covered below, reason from
them. Your own user's reactions take over as soon as there are any.

On the first, SVG version of the page:

> Right now, it has a bit of an SVG look to it, insofar as you can tell that a
> lot of the visual stuff is composed of fairly simple shapes and gradients.

On motion, before the animation work began:

> The interpolation factor right now is the main thing that actually reads to
> me as obviously digital.

The target:

> a blend of a pencil sketch style and a loosely anime-inspired style, but an
> anime style which is simpler and sacrifices some of the "completeness" for
> the hand-drawn aesthetic.

On their own drawings as the source:

> it would be better to keep these things as vectors, which we can then do
> some cool animations with, rather than trying to keep the drawing literal in
> pixel space. My art is not very good, so if we deviate slightly from what I
> drew, that's really okay.

On the finished static figures:

> I like a color value about 0.64 or so.

> I also really like the subtle auxiliary lines and shadows here. Those really
> help the artistry.

> Big fan of the boil effect and the animated underline on the writing.

> I also adore the paper color in the background as opposed to plain white.

On the setting:

> a plain paper world with a bit of landscape-style background elements as
> before, but these can be much more sparse, and their stylization is
> important. Whatever we make for the background should follow the same
> stylistic guidelines as we've used in these three core elements.

And from the original request, which still governs: "coherence and simplicity
are the most important things."

## The elements

| Element | What it is |
|---|---|
| Paper | Warm off-white (`#f3eee3`) with a faint tooth, never plain white. The world is paper: skies and grounds are mostly bare. |
| Line | Graphite, warm dark grey (no darker than about `#3a3532`). Weight comes from pressure, which shows as density, not as a blacker colour. One ribbon per stroke, with uneven tapers taken from the pen's own landing and lift, broken up by the tooth. |
| Light | One key light from the upper left, for everything. Lines on the shadow side are heavier; lines on the lit side are lighter and sometimes break. Light that comes from inside the picture is drawn too, as bare paper and a few radiating pencil lines, never as glow. |
| Construction | A few blue col-erase marks (`#7aa6dc`) left in: a guide ellipse, a centre line, baselines under handwriting. They cross the outline rather than hugging it, and fade where colour lands. |
| Shadow | One hard-edged shadow shape per form, as in cel animation. Its boundary is a red pencil line (`#d4574d`) with loose hatching at a right-handed angle (about 62°, varied in spacing, length and angle). Highlights are paper left bare, sometimes with a blue contour. |
| Colour | Flat marker, laid by hand in passes from the shadow side. It runs under the line, sits slightly off-register, and gives out toward the light in stroke ends of uneven length. Some paper is always left. |
| The dial | `color` runs from 0 (pencil and red/blue marks only) to 1 (quick flat colour). **0.64 is the resting value** the first user chose from a slider. Every value between has to look good, because colour may arrive during an animation. |
| Handwriting | Stays graphite, written on in stroke order with a pen's timing. One accent at most (a pink underline swash, on the first piece). |
| Setting | Sparser and lighter than the subject: thinner lines, lower pressure, less colour. |

Palettes are per piece: few colours, each with one shadow tone, chosen to look
like pencil and marker on that paper. Paper, graphite, construction blue and
shadow red are the constants.

## What reads as digital

- Smooth multi-stop gradients, glow, bloom, soft drop shadows, particle
  sparkles.
- Perfect circles, ellipses and straight lines; uniform stroke width; symmetry.
- Completeness: every region filled to its edge, every form rendered.
- The rough.js / Excalidraw look. Doubled jittery outlines and zig-zag fill
  are a recognisable web aesthetic of their own. Three parallel lines along
  one edge (outline, searching pass, guide) land there too.
- Regular hatching, and per-pixel noise that looks like a filter.
- Soft pastel anime with glow. The 2025 "Ghibli filter" trend made that one of
  the most recognisable AI looks there is; "more Ghibli" is the wrong
  direction.

## What went wrong the first time

The first styling pass was convincing with no colour and wrong in ways its
author couldn't see. Three review rounds found the list below (31 findings,
then 9, then polish). Expect these again in any new renderer work or new
figure.

- **The line as a tube.** A pale ribbon round a dark core reads as an outlined
  vector stroke. One ribbon, with density following weight, and some tooth
  showing even in the heaviest line, so heavy is the same pencil pressed
  harder.
- **Too black, too cool.** Heavy lines that reach near-black read as marker.
- **Grain as a filter.** Soft noise blobs inside a clean silhouette. The tooth
  should be sharp and should eat the stroke's edges.
- **Boil that shimmers.** Re-rolling grain each frame makes strokes sparkle
  while barely moving. The grain stays fixed to the stroke and the boil nudges
  geometry by about a unit. Gaps and slivers are placed by a design seed,
  never by the boil seed.
- **The colour edge on the lit side.** It failed four ways before it worked:
  torn paper, a bar-chart staircase, sawtooth teeth, a city skyline. What
  works is marker strokes of uneven length stopping short along a curved
  front, with chisel ends, as in `look.jpg`.
- **Fake marker texture.** Even diagonal banding reads as a brush overlay,
  and straight translucent bars read as glass glare. Flat colour with a
  hand-made edge beats a simulated texture.
- **Sticker outlines.** A constant-width gap of paper between colour and line.
  Colour runs under the line, with only an occasional irregular gap.
- **Gloss.** Glints, flecks, specular blobs, offset-copy drop shadows, a
  perfect ellipse for a ground shadow. All removed. A ground shadow is a few
  marker passes and a contact line.
- **Over-finishing.** At full colour the ball read as a finished vector
  illustration next to an unfinished box. Lighten the base, keep some hatching
  visible, leave slivers of paper.
- **Small sizes.** Light lines crumble into dots and heavy ones go flat.
  Judge every figure at the size a phone will show it, not only zoomed in.
- **A write-on that moves like a plotter.** Constant speed and identical pen
  lifts. A real pen eases into a stroke, slows through tight turns, and takes
  longer to travel further between strokes.

Each round's findings ended with a list of what to keep. Ask reviewers for
one and hold on to it: fixes are as likely to remove what was good as what
was bad.

## Figures nobody drew

- **Authored strokes** are measured against real pen strokes and made no more
  perfect (`strokes.md`, "Authored").
- **Effects are drawings**, in short sequences: a dust puff, speed lines, an
  impact frame built from radial pencil strokes, sparkles that live at fixed
  sites as tick, star, cross. Never particles, and never a flat fill with
  speckle.
- **An official mark keeps its exact geometry** and is rendered in the style:
  graphite outline traced from the real paths, any gradient handled as a few
  hand-coloured marker bands, keylines kept where they define the mark. On the
  first piece, reviewers judged the pencil version of a game logo better in
  context than the crisp one. Keep a flag that swaps the original in, so the
  comparison can be made.
