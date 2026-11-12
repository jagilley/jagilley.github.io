# Animation QA, round 1: consolidated findings by owner

Five reviewers covered:
- sketch/present (`qa/r-sketch/`)
- open/ball (`qa/r-open/`)
- crack (`qa/r-crack/`)
- greeting/final (`qa/r-greet/`)
- technical (`qa/r-tech/`)

Their evidence sheets are in those dirs.

**Verdict:** the bones are right and much of it is lovely. Every pose change is quantised, and no run logged a console error. Three areas need work:
- **performance**, which on a real phone drops write-on drawings and blunts the climax
- the **open** shot's staging
- the **reveal**'s payoff pose

Keep the "Must not lose" list at the bottom.

---

## DIRECTOR (`jaden-next.html`)

### D-A. Performance architecture (highest priority: phones drop drawings now)
1. **Layer caching.**
   - Build one background base per boil seed via `JADEN.bg.merge()`, instead of 18 `Pencil.render` calls. Render it with a ~20 px margin and blit it at the shake offset, so the shake no longer busts the cache.
   - Draw the dusk wash onto a persistent layer *incrementally* as beats arrive.
   - Cache the logo and each ball half as bitmaps per boil seed, and blit them with each drawing's squash, rotation and registration.
   - In the final hold, key the cache by boil phase, not by drawing number (sparkles currently miss it on every drawing).
   - Align write-on rows and dusk beats with the boil phase (start on a multiple of 3), so the under-text layer stops rebuilding on 2 of every 3 drawings.
   - Measured: 36% of greeting drawings dropped at 4× CPU, and only 117 of 191 rendered live at 1440@2.
2. **Pre-render the climax** during ball idle: both impact drawings, crack:15–19, the split, the burst and emph. First renders currently cost 85–218 ms against 83 ms exposures.
3. **Warm-up scheduling.**
   - Warm only box seed 1 before starting. Today `warmStart` blocks 300–400 ms before the first frame, and 680 ms at 4×.
   - After that, warm one slice of ≤ 40 ms per step, at least 150 ms apart, and skip a step after a recent tap.
   - Warm the costliest figures (logo, impact) first.
   - iOS has no `requestIdleCallback`, so pace the setTimeout fallback.
4. **Frame clock clamp: raise it from 0.1 s to 0.25 s.** Under load, the 8 s greeting ran in slow motion for 30 s.
5. **Loading.**
   - Load pencil, box and bg first (about 148 KB gzipped). Load the rest async during the sketch-in, with retry.
   - If a core file fails, show a visible fallback. Today blank paper stays forever.
   - Keep the official-logo fallback independent of `logo.style.js`. The logo artist is splitting it out to `resources/jaden/logo-official.js`.

### D-B. Sketch-in and present
6. `hz-mid` pops in complete at f8 (half the screen at 1440, full width in portrait). Write it on as a stroke. Portrait shows nothing new until f34; give it something early.
7. **Ordering:**
   - Finish the box completely, then add the background details (sun, cloud, grass, hill colour) as a ~1 s coda. Today two pens work at once (f90–146).
   - Give construction 14–16 frames on 2s, so it's visible as its own layer. Today the build reads as line then colour.
   - Lay in the hill colour over 4–5 drawings; today ~80% arrives in one drawing at f130.
8. **The horizon inside the box fades out in alpha steps (f76–87).** Cut it in one drawing instead.
9. **Tap fast-forward** currently shows a new drawing every screen refresh, with the boil flipping at ~40 Hz.
   - Show one drawing per 2 frames with the boil frozen.
   - Then guard the present against taps for 0.6 s after it appears. Today the same tap burst opens it immediately, and at 4× CPU the present was visible for 73 ms.
10. **Hop.**
    - Use ballistic spacing (f54 at y −60, then ~−101).
    - Bring the first hop in ~1 s after the drawing finishes, not 2.3 s.
    - Alternate the hop with a wiggle variant at irregular intervals.
11. **Tap mid-hop:** the box teleports 25 px to the ground. Finish the hop down to the landing squash on 1s, then start the open.

### D-C. Open and ball idle
12. **Staging, the biggest craft issue.** The ball reads as a ball for only 2 drawings, then is off-frame for ~0.7 s, and f22–31 is empty paper. f12 is cropped at the top at 1440, 768 and 2560.
    - Fix: **hang the ball in frame** (y ≈ −450, 3 drawings on 3s) while the box scoots out under it, then drop it.
    - Keep the empty beat to ≤ 4 frames.
13. **The "too big for the box" gag doesn't land:** the ball is 82% of the box's width, so it visibly fits.
    - Bulge the box (sx ≈ 1.25) and pinch the ball at the rim on the way out.
    - In the hang, draw the ball at ≈ 1.3× the box's width.
14. **Layering:**
    - Draw the trails *behind* the figures, anchored at the lid's end. Today they're over the box face, about 100 px low, and the trails cross the ball at f10.
    - Clip the ball to the box interior while it's inside. Its violet leaks past the box's right wall at f8–9.
15. **Speed lines:**
    - Anchor them at the ball's bottom edge; at f12 they flank the box, so the box seems to vibrate.
    - Drop the f14 set, which runs vertically beside a diagonal move.
16. **Fall spacing:** use −1500 → −950 → −300 (stretched, sy ≈ 1.3) → contact. It currently slows into contact.
17. **Lid path:** extend it to x −2500; at 2560×1080 it pops out at f16.
18. **Portrait framing:** widen it (pw ≈ 1400), so the f36 dust puff isn't cropped at both edges.
19. **Ball idle shiver:** today it's an even ±3 px slide, identical every 2.29 s, and the hole pulse is invisible (~5/255).
    - Make it a **knock from inside**: bulge, lift ~12 units, squash, then a decaying rock about the contact point.
    - Make two variants, alternating at irregular 2–4 s.
    - Keep the two hole drawings ≥ 30 levels apart.

### D-D. Crack and reveal (the climax)
20. **The payoff pose is a retreat.** The logo is clearest at the apex (f51–55, 5 frames), then sinks back, and at rest the halves hide ~17% of it: the V's lower-left arm, most of the I, the "t" of "theft".
    - Rest the logo higher: y ≈ −560, with the V tip just under the rim. Use split rest ≈ 1.15 and s ≈ 0.55 (tune it).
    - Update `LOGO0`, which greeting and final share. The logo must read as the hero.
21. **Bring back the two-hit reveal from v1.** The VI rises *alone* (`word` hidden), hangs, then the **wordmark slams down** onto it on 2s, with a smear, squash on both, a shake and one emph drawing. Today they rise as one, and the f61 squash lands on nothing.
22. **Tap response.**
    - Answer the tap immediately with one big jolt drawing; f0–13 currently repeats the idle shiver, so the tap gets no visible response for 0.58 s.
    - Then ramp the tremble from 6 to 18 units, with the last 4 frames on 1s. It currently drops to ±1–2 px during the crack write-on.
23. **Impact:** hold impact drawing 2 for 3 frames. The FX artist is also rebuilding that drawing.
24. **Sparkles.**
    - Use 3–4 fixed sites, each living tick → star → cross, staggered (new drawings coming from the FX artist). Today the whole set moves every drawing, so it flickers.
    - In the final, anchor them on the logo's sides, away from the text; today they land on the third "!" and the swash.
    - Play them at irregular 5–8 s gaps, not every 3 s.
25. **Burst:** clip it at the ground line. crack:17's bolt currently runs through the ground to the frame bottom. The FX artist is redrawing the burst remnants.
26. **The halves need an inner face.** The style lead is adding a hatched dark-violet inner rim along the broken edges; enable it when it lands.

### D-E. Greeting, dusk and final
27. **Wash vs text:** keep the wash out of a ~40-unit halo around the words (clip it), with no pink under "Jaden". A violet band currently crosses the x-height of "Happy… birthday," and the pink swash gets lost among the pinks. The background artist is also reworking the wash strokes themselves.
28. **The sun:**
    - Set it through 3–5 eased, *held* key positions on the colour phases, not 36 equal 3 px steps.
    - Stop it at y ≈ −380, or knock it out by the hills and ground. In portrait the set sun sits over the ridge like a glass marble.
29. **Phone composition (390×844, the likely device).** Content fills only 31–70% of the height, the bottom 30% is blank, the logo is 39% of the width, and the x-height is ~13 px.
    - On tall screens, break the greeting as "Happy / birthday, / Jaden!!!".
    - Use pw ≈ 1300, with the ground ≈ 78% down.
    - Make the logo bigger.

    The greeting's pull-back currently shrinks the hero.
30. **Tap burst:** make it ≈ 60 screen px, 2 drawings longer (on 3s), and use the coloured variant on dark fills. Today it's 20 px, hidden by the finger, and gone in 0.33 s.
31. **Replay:** ignore scene taps for 500 ms after replay; a double-tap fast-forwards the replayed sketch-in.
32. **Framing:**
    - Place the clouds and sun relative to the visible view rect. Today a 10 px sliver of the right cloud shows in portrait final (x ≈ 650 would fix it).
    - At 768×1024 the left cloud is cut and the hills are missing; move the cloud down ~120 for aspects 0.6–0.8.
    - The reveal sun is half cut at the left (x ≈ −540).
    - The top of the cloud leaves the frame at 1440 and 2560.

### D-F. Input and accessibility
33. Ignore auto-repeat key events (`e.repeat`). Holding Enter currently cracks the ball.
34. Add a `click` handler, ignoring clicks that follow a `pointerdown`, so VoiceOver and TalkBack activation can advance. The aria narration must not say "Press Enter" to touch users.
35. Set `overscroll-behavior: none` and `touch-action: pinch-zoom` (or `manipulation`) on `#scene`. Android pull-to-refresh can reload the page mid-reveal.

---

## STYLE LEAD (`pencil.js`, box/ball/text data)
- **S1. `build.color` lays colour in as one flat wedge** with a ruler-straight front: f106 is a right triangle, and it finishes as a staircase of blocks. Fix:
  - Lay in *individual marker passes*, each sweeping along its length.
  - Each pass gets width 0.7–1.3×, angle ±6° and slightly wobbly edges, and multiplies where passes overlap.
  - Show 1–2 passes per build step.
  - Pass ends vary in length by ±40–80 units along a curve.
  - At `build.color = 1` it must equal the approved static 0.64 look.
  - Applies to every figure, the background hills included.
- **S2. Halves inner face:** when the ball is split, draw a hatched dark-violet inner rim (an inner wall) along each broken edge, so the logo seems to come out of a hollow shell, not a solid ball.
- **S3. Data size:** round coordinates in `box`/`ball`/`text.style.js` to integers (or 0.5) wherever it's visually lossless. The reviewers measured the total dropping from 388 to 254 KB gzipped with integer rounding.

## FX ARTIST (`fx.style.js`)
- **F1. Impact drawing 2:**
  - Problem: the dark field is a flat fill with uniform per-pixel speckle and straight wedge edges, which reads as a filter.
  - Fix: build it from dense radial tapered graphite strokes with paper slivers between.
- **F2. Burst:**
  - crack:19 leaves one yellow wedge on the left half that reads as a horn. Make it 3–5 remnants scattering outward.
  - crack:17's bolt has a white arrowhead that reads as a tooth. Redesign that tip.
- **F3. Sparkles:**
  - Redesign them for **fixed sites**: each sparkle has a 3-drawing life (tick → star → cross), so the director can stagger 3–4 sites.
  - Push them away from the ✦ glyph look.
- **F4. Tap burst:** give it more presence. Add 2 extra drawings (for holds on 3s) and a coloured-tick variant that reads on dark fills.
- **F5. Data size:** `fx.style.js` is 604 KB. Trim it with integer coordinates and fewer points where it's visually lossless.

## LOGO ARTIST (`logo.style.js`)
- **L1. Phone legibility:** darken the wordmark keyline toward `#1d0030`, and bring the letters closer to paper white. The official mark is slightly crisper at phone size.
- **L2. Two-hit reveal:** confirm and document that `JADEN.logo.render` can draw `vi` alone and `word` alone, each with correct paper-out. The VI will rise alone and the wordmark slam down separately.
- **L3. Move `JADEN.logoOfficial`** into its own `resources/jaden/logo-official.js`, so a logo-data failure still has a fallback.
- **L4. Data size:** use integer coordinates where visually lossless.

## BACKGROUND ARTIST (`bg.style.js`)
- **B1. The dusk wash still reads as stripes in context.** In the director's integration it shows as about 50 flat, toothless, parallel horizontal bands, each popping in whole. Rework it:
  - 12–18 strokes per colour zone, in 3–4 **zig-zag marker passes**, angle ±10°
  - real marker texture and tooth, with overlap build-up
  - each pass **drawn on progressively over 2–3 drawings** (expose per-stroke draw progress in `duskState`)
  - ≥ 40% of the sky left as paper

  Check what the director actually renders (`--query` capture of greeting:2–8 at 390×844 and 1440×900), not only your preview.
- **B2. Sun set:** provide 3–5 key positions with holds, and make the hills and ground knock out the sun as it sets behind them.
- **B3. Data size:** use integer coordinates where visually lossless.

---

## Must not lose
- The box write-on in Jasper's stroke order on 1s (it reads as a real pen).
- The present boil, alive with steady colour.
- The hop's key poses, including the lid lifting a hair on the rebound.
- The anticipation squash, the pop multiples, the box tumble, and the heavy landing (squash, rebound, dust, 0.5 s settle).
- The seamless present→open→ball hand-offs.
- The logo peeking through the slit at crack:17 and emerging from behind the halves.
- The light/dark impact flip (4 frames).
- The halves' overshoot and rock-back, and the rise that slows into its apex.
- The greeting write-on: order, eased strokes, the 0.5 s line-break pause, dabbed dots, the 0.2 s beat, the two-pass swash.
- The replay icon's draw-on.
- Reduced motion; the spoiler-free OG image; noindex; no console errors.
- The pencil logo, which reviewers judged better than the official one in context.
