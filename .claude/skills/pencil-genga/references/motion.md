# Motion

> The interpolation factor right now is the main thing that actually reads to
> me as obviously digital. I think a bit of frame-rate-capped animation with
> some degree of randomization on e.g. the position of objects or maybe the
> degree of coloring ought to look pretty good here.

That was Jasper before the animation work began, and it is the whole
premise. A piece that moves is an **exposure sheet**: each shot is a list of
drawings, each a complete pose held for a whole number of frames at 24 fps.
Nothing is evaluated between drawings.

The worked example is `jaden.html`: its header comment describes the engine,
and the `Sheet` class and the storyboard below it show how shots are written.
`jaden-work/ANIMATION-BRIEF.md` is the brief it was built from.

## Timing

- **Action on 2s** (12 drawings a second), **slow moves and settles on 3s**
  (8 a second).
- **Holds are held but alive.** A held drawing boils through two or three
  seeds at about 8 fps.
- **Write-ons advance on 1s** (24 a second). Jasper liked the feel of the pen
  moving; on jaden a 12 fps version was tried and kept as a flag (`?wo=2`).
- **Every new drawing differs slightly:** a new seed, a registration offset of
  about half a unit to a unit with a hair of rotation, and optionally a touch
  more or less colour (±0.03, marker ends re-rolled). The aim is alive, not
  strobing.
- **Ease comes from spacing the drawings**, not from a curve applied to time.
  Anticipation, squash and stretch, overshoot and settle are separate
  drawings. Fast moves get smears or two or three ghost copies on one drawing.
  A hit gets an impact frame.
- **The camera cuts** and holds framings. If it moves, it moves in steps like
  everything else.
- **Opacity counts.** A fade in alpha steps is still interpolation; cut it in
  one drawing or draw it on.

## Things draw themselves

The Jaden page opens on blank paper and the present draws itself: the line in
Jasper's stroke order, then construction marks, then colour in marker passes,
then shadow and hatching. Jasper asked for that order specifically. The
renderer's `build` option does it (`style/README.md`, "Build-up"). It works
for any figure, and a static piece can use it as its only motion.

## Staging lessons from the first piece

Five reviewers went through the first full pass drawing by drawing and
returned about fifty findings (`jaden-work/qa/ANIM-ROUND1.md`). The ones that
will recur:

- **No instructions on screen.** The present hops every few seconds; that is
  the affordance.
- **Answer a tap at once** with one big drawing. A tap that gets no visible
  response for half a second feels broken.
- **Give the eye time.** The ball first appeared for two drawings and then left
  the frame. Something the viewer must recognise needs to hang in view.
- **The payoff pose is the clearest pose.** The logo first rose, then sank
  back behind the halves. The hero rests where it reads best.
- **Idles vary.** The same shiver every 2.29 s is a metronome. Two variants at
  irregular intervals.
- **Colour arrives as marker passes**, a couple per drawing, not as one wedge
  with a ruler-straight front.
- **A phone in portrait is the likely screen.** Compose each shot to a focus
  box per aspect; on jaden the greeting breaks across three lines on tall
  screens so the final picture fills them.

## What the engine needs

- **A deterministic seek hook.** `window.__<piece>.seekShot(name, t)` and
  `seek(t)` render the exact drawing for any time, and a flag stops the clock.
  Capture tools and reviewers depend on it. See `window.__jaden` at the end of
  `jaden.html` for the full surface (`shots`, `state`, `stats`, `drops`,
  `bench`, `tap`).
- **Render only when the drawing changes**, on one canvas. Jaden works like
  cel levels: the background is one cached level per camera and boil seed,
  moving figures are sprites drawn once per seed, and the climax is
  pre-rendered while the viewer is idling just before it.
- **Measure dropped drawings on a slow device.** With the CPU throttled 4×
  (about a mid-range phone), count how many of a shot's drawings actually
  reached the screen. The first pass showed 64% of the greeting; after the
  caching work every shot showed 96–100%. `jaden-work/tools/anim/live.mjs`
  does the count.
- **Reduced motion:** no boil and no shake; drawings appear complete, in a few
  quick steps.
- **Input:** keyboard as well as pointer, a `click` path for screen readers,
  key auto-repeat ignored, a short guard after each state change so a double
  tap doesn't skip a shot, and `overscroll-behavior: none` so pull-to-refresh
  can't reload mid-reveal.
- **Loading:** everything self-hosted. Load the renderer and the first figure
  up front and the rest while the first figure draws, with retry and a visible
  fallback if a core file fails.
- **Data size:** integer coordinates wherever the render doesn't change. On
  jaden that took the figure data from 388 to 254 KB gzipped.

## One lesson from before the redraw

The SVG version of the page flashed white, full-screen, on Jasper's laptop and
nowhere in testing. Two rounds of removing plausible causes didn't fix it.
What did was reproducing it: headless Chromium with its GPU memory capped
dropped whole tiles and showed the page background for a frame. The fix was
painting the scene on a single canvas instead of a stack of full-screen
layers. Two things to keep: paint on one canvas with the page background set
to the paper colour, and when Jasper reports something you can't see,
reproduce it before changing anything else.
