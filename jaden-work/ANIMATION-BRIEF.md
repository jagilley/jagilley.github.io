# Animation brief: "For Jaden", hand-drawn v2

Read `jaden-work/STYLE-BRIEF.md` first; every rule in it still applies. The static style is approved. Jasper's reaction: "remarkably beautiful". This brief covers turning it into the animated page.

## What Jasper approved and asked for
- **Colour ≈ 0.64** is the look. It's the resting colour level for every figure: not 0, and not 1.
- **Keep:**
  - the subtle auxiliary marks: blue construction lines, red shadow boundaries, hatching
  - the boil
  - the write-on with the animated underline swash
  - the warm paper colour
- **The crack stays as built** (`style.crack` on the ball). Jasper tried drawing his own and preferred ours.
- **The box draws itself from nothing:** blank paper, then Jasper's lines write on in his stroke order, *then* construction, colour and shadow are added.
- **Setting: a plain paper world** with a few landscape-style background elements, as in v1 (`/Users/jasper/Code/jagilley.github.io/jaden.html`), but much sparser. They are stylised exactly like the three core figures: pencil line, light construction, red/blue genga marks, marker colour stopped early.
- **Frame-capped animation, not interpolation.** Jasper's words: "The interpolation factor right now is the main thing that actually reads to me as obviously digital." Motion must be held drawings at a capped rate, with a little per-drawing randomisation (position registration, how much colour is laid in), like hand-drawn animation.

## Timing rules (the most important section)
- **Nothing moves by continuous tween.** Positions, rotations, scales, colour levels and camera all change only when a new *drawing* is shown.
- **Exposure:**
  - action on **2s** (12 drawings/s)
  - slow moves and settles on **3s** (8/s)
  - holds are held, but alive: the boil cycles 2–3 seeds at about **8 fps**
- **Write-ons** (the box lines, the greeting, the crack and any other drawn-on mark) may advance at 24 fps (on 1s), so they keep the pen-moving feel Jasper loved. Try 12 fps as well and keep whichever reads more hand-made.
- **Every new drawing:**
  - gets a new seed, which re-rolls the boil jitter
  - gets a tiny registration offset (about ±0.5–1 unit, a hair of rotation)
  - may vary the colour slightly (marker ends re-rolled, colour amount ±0.03)

  Keep it subtle: alive, not strobing.
- **Use classic animation spacing.** Key poses plus inbetweens with eased spacing (slow-in/slow-out comes from *spacing the drawings*, not from tweening). Add anticipation, squash and stretch, and overshoot as separate drawings. Use smears or multiples (2–3 ghost copies of a group on one drawing) for fast moves, and an impact frame for the crack.
- **Camera:** prefer **cuts and held framings**. If the camera moves, it moves in steps on 2s or 3s like everything else.

## Storyboard (a starting point: the director may improve it, but keep the beats)
**0. Sketch-in** (automatic, about 5–7 s; a tap during it fast-forwards it)
- Blank paper. A few background roughs sketch on quickly and lightly: the horizon/ground line, a hill contour or two.
- The **box** writes on in Jasper's stroke order. Then its construction marks, then colour (marker passes laid in one after another), then shadows and hatching, then the ground shadow.
- Sparse background details finish last (sun, a cloud or two, a few grass ticks). The page is then ready.

**1. Present idle** (loops until tap)
- Boil on the holds.
- Every ~3 s, a little hop or wiggle as drawings on 2s: squash, stretch up, land squash, settle, with the bow wobbling.
- No text. The hop is the affordance.

**2. Open** (tap; about 2–3 s)
- Anticipation squash.
- The **lid and bow pop off** and fly out of frame, with smears or multiples. The groups `lid` and `bow` and the hidden `body-rim` already support this.
- The **ball bursts up out of the box.** It's bigger than the box; play that as a gag, not a problem.
- The box leaves. It's the director's choice: it tumbles off frame on 2s, or an eraser wipes it away and leaves ghost lines, which suits a pencil world.
- The ball drops into place with a squash and a drawn dust puff.

**3. Ball idle**
- Boil.
- Every few seconds the ball shivers, as if something inside wants out. The finger-hole hatching can "pulse" between two drawings.

**4. Crack** (tap)
- Shivers that escalate.
- The **crack draws on** (write-on of `style.crack`).
- **An impact frame of 1–2 drawings**: heavy graphite emphasis lines radiating from the ball, with everything else dropped to line-only or blank paper.
- The **halves split apart** on 2s, using the existing halves hook.
- Drawn emphasis or speed lines radiate from the opening. This is light without glow.
- The **GTA VI logo** rises out of the ball on 2s with a squash on landing, plus a few drawn sparkle marks.

**5. Greeting**
- The greeting **writes on** with its swash. The current write-on is about 9.7 s; the director may speed it up to around 6–7 s if it drags.
- Meanwhile the **sky gets a loose dusk marker wash** scribbled in on 3s: orange, pink and violet strokes, a nod to Vice City and the logo's sunset palette.
- Final hold: everything boils. A tap on the paper makes a small drawn burst. A small hand-drawn replay button fades in after a few seconds.

## The GTA VI logo
The mark must stay the **official one**: an exact trace of its geometry. The source is the public-domain Wikimedia trace already in v1 (`<symbol id="gtaVI">` and `<symbol id="gtaWord">` in `jaden.html`). Render it **in style**:
- a graphite outline traced from the official paths
- marker colour in the official palette, with the gradient handled the way a colourist would: a few hand-coloured bands or zones, not a smooth gradient
- the official dark/white keylines where they define the mark

It should be instantly recognisable as GTA VI. The small wordmark letters may be better as dense graphite fills than as outlines; the logo artist decides. Keep a dev flag that swaps in the crisp official SVG for comparison.

## Background elements (sparse!)
Lighter and sparser than the figures, so they read as setting, not subject:
- a ground/horizon line and one or two low hill contours
- a sun (a loose circle)
- one or two anime cumulus outlines
- a few grass ticks or tufts near where the figures stand
- optionally a tiny distant tree or two, as in v1

Colour them at a lower amount than the figures; the sky mostly bare paper with a few marker strokes. Also provide a **dusk variant** for the sky wash at the reveal.

## Hand-drawn FX (all drawn, never particles or glow)
- a dust puff for the ball landing (3–4 drawings)
- emphasis/speed lines for the crack (2–3 drawings)
- an impact-frame treatment
- a split burst
- small sparkles (4-point pencil and coloured-pencil stars, 2–3 drawings)
- a tap burst for the final state
- smear or multiples guidance for the lid and bow flight
- a hand-drawn replay icon

Every mark must follow the style brief: graphite or coloured pencil, tapered, tooth, no perfect geometry.

## Technical
- **Runtime layout:**
  - The new page is **`/Users/jasper/Code/jagilley.github.io/jaden-next.html`** (noindex, standalone, like v1).
  - Its runtime files live in **`/Users/jasper/Code/jagilley.github.io/resources/jaden/`**: `pencil.js` and the figure data.
  - Build tooling and QA stay in `jaden-work/`.
  - Don't touch `jaden.html` (v1) until Jasper approves the swap.
  - Don't commit anything.
- **Renderer:** `pencil.js` (API in `jaden-work/style/README.md`) is owned by the style lead. Other agents treat it as read-only and preview against `jaden-work/style/pencil.frozen.js` (a snapshot) until the upgraded one lands. The data format must stay backward compatible.
- **New figures** (background, logo, FX) use the same figure data format as `box/ball/text`: strokes with `pts [[x, y, w], …]` in drawing order, plus a style object with regions, shadows, highlights, construction and palette, in the same units (100 = one ruled-line spacing; pen width about 7). Authored strokes must carry a hand: wobble, uneven pressure, imperfect closure. Draw them like a person would, and check them beside Jasper's strokes at the same scale.
- **Determinism for QA:** the page must expose `window.__jaden` with `seek(t)` (or `seekShot(name, t)`) that renders the exact drawing at any time, plus `state`. Reviewers capture frames from it with headless Chrome.
- **Fit:** works from phone portrait to desktop landscape. Fit a per-shot focus box like v1's camera; no horizontal scroll.
- **Accessibility:**
  - keyboard (Enter/Space advances)
  - aria-live narration as in v1
  - `prefers-reduced-motion`: no boil, no shake; drawings appear complete in quick steps
- **Performance:** only re-render when the drawing changes (≤ 24/s). Warm caches during sketch-in. Smooth on a phone.
- **Disk is nearly full** (about 5 GB free). Keep intermediates small and clean up after yourself.
