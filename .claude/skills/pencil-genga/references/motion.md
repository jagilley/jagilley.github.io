# Motion

> The interpolation factor right now is the main thing that actually reads to
> me as obviously digital. I think a bit of frame-rate-capped animation with
> some degree of randomization on e.g. the position of objects or maybe the
> degree of coloring ought to look pretty good here.

That was the first piece's user before the animation work began, and it is the
whole premise. A piece that moves is an **exposure sheet**: each shot is a
list of drawings, each a complete pose held for a whole number of frames at
24 fps. Nothing is evaluated between drawings.

`../kit/sheet.example.js` is the core of the first piece's engine, excerpted
for reading: the `Sheet` class, one shot written out as drawings (a hop), and
the function that turns a time into a drawing with its seed, registration and
colour. If you have the first piece, its page is the whole engine and its
header comment describes it.

## Timing

- **Action on 2s** (12 drawings a second), **slow moves and settles on 3s**
  (8 a second).
- **Holds are held but alive.** A held drawing boils through two or three
  seeds at about 8 fps.
- **Write-ons advance on 1s** (24 a second). The first user liked the feel of
  the pen moving; a 12 fps version was tried and kept behind a flag.
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

The first piece opens on blank paper and its present draws itself: the line in
the order it was originally drawn, then construction marks, then colour in
marker passes, then shadow and hatching. The user asked for that order
specifically. The renderer's `build` option does it (`../kit/RENDERER.md`,
"Build-up"; `../kit/demo.html?build=0.5` shows a moment of it). It works for
any figure, and a static piece can use it as its only motion.

## Staging lessons from the first piece

Five reviewers went through the first full pass drawing by drawing and
returned about fifty findings. The ones that will recur:

- **No instructions on screen.** The present hops every few seconds; that is
  the affordance.
- **Answer a tap at once** with one big drawing. A tap that gets no visible
  response for half a second feels broken.
- **Give the eye time.** A ball first appeared for two drawings and then left
  the frame. Something the viewer must recognise needs to hang in view.
- **The payoff pose is the clearest pose.** The reveal first rose into view,
  then sank back behind what it came out of. The hero rests where it reads
  best.
- **Idles vary.** The same shiver every 2.29 s is a metronome. Two variants at
  irregular intervals.
- **Colour arrives as marker passes**, a couple per drawing, not as one wedge
  with a ruler-straight front.
- **A phone in portrait is the likely screen.** Compose each shot to a focus
  box per aspect; the first piece breaks its handwritten greeting across three
  lines on tall screens so the final picture fills them.

## What the engine needs

- **A deterministic seek hook.** A global on the page with `seekShot(name, t)`
  and `seek(t)` that render the exact drawing for any time, and a query flag
  that stops the clock. Capture tools and reviewers depend on it. The header
  of `../kit/tools/capture.mjs` lists what the hook must expose, and
  `live.example.mjs` what a live run reads on top of that.
- **Render only when the drawing changes**, on one canvas. The first piece
  works like cel levels: the background is one cached level per camera and
  boil seed, moving figures are sprites drawn once per seed, and the climax is
  pre-rendered while the viewer is idling just before it.
- **Measure dropped drawings on a slow device.** With the CPU throttled 4×
  (about a mid-range phone), count how many of a shot's drawings actually
  reached the screen. The first pass showed 64% of one shot; after the caching
  work every shot showed 96–100%. `../kit/tools/live.example.mjs` does the
  count.
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
  the first piece that took the figure data from 388 to 254 KB gzipped.

## One lesson from before the redraw

The SVG version of the first piece flashed white, full-screen, on its user's
laptop and nowhere in testing. Two rounds of removing plausible causes didn't
fix it. What did was reproducing it: headless Chromium with its GPU memory
capped dropped whole tiles and showed the page background for a frame. The fix
was painting the scene on a single canvas instead of a stack of full-screen
layers. Two things to keep: paint on one canvas with the page background set
to the paper colour, and when the user reports something you can't see,
reproduce it before changing anything else.
