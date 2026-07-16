# The Overlap-QA Loop (MANDATORY)

**No hand-authored SVG ships without passing this.** You place SVG coordinates by
reasoning about numbers; you are effectively blind to the pixels they produce.
Every scrolldeck built without this step has shipped with drooping braces,
occluded arrowheads, clipped labels, and arrows cutting through boxes. A vision
pass by a *separate* agent — one that only sees the rendered image, not your
intent — is the only reliable catch. Budget for it; it is not optional polish.

## Why a subagent, not just you re-rendering

You can render and look too. But you authored the coordinates, so you carry an
anchoring bias: you see what you meant, not what rendered. A fresh agent given
only the picture and a plain description of what it *should* show has no such
bias. Use one agent **per SVG**, working on an **isolated** copy so they run in
parallel without edit contention.

## The four failure classes (rubric)

A collision-only checklist is not enough — it misses half of what goes wrong.
Instruct agents to hunt all four:

1. **Collision** — glyphs overlapping other text, lines, arrowheads, or box edges
   so legibility suffers.
2. **Occlusion (z-order)** — one element painted over another because it is drawn
   later: a dot covering an arrowhead, a box hiding a line end. *An arrowhead that
   terminates at its target's center gets swallowed by the target's marker/dot —
   end the stroke a few units short of the edge instead.*
3. **Clipping** — anything cut off by the viewBox edge. Rotated axis labels and
   value labels above the tallest bar are the usual victims. Widen the viewBox or
   move the element; never let a glyph touch the edge.
4. **Proportion / balance** — nothing technically overlaps, but an element is
   sized or placed wrong: a brace that droops far past the box it annotates, a
   label floating too far from its mark, a bar chart crammed to one side. This is
   a *judgment* call, which is exactly why the agent needs the diagram's intent.

Always give each agent **what the diagram is supposed to depict** (element by
element). Balance can only be judged against intent, not against the pixels alone.

## The loop

1. Build isolation harnesses: `node isolate_and_render.js <deck.html> <outdir> <darkIndices>`
   (see that file). It writes `svg-N.html` (standalone, animations forced to final
   state, correct background) and `orig-N.txt` (exact block for splice-back).
2. Render each at **2× DPI** with headless Chrome (command printed by the script).
3. Spawn **one `general-purpose` subagent per SVG, in parallel** (all in one
   message). Each loops: render → Read PNG → judge against the 4-class rubric →
   Edit the `<svg>` in its `svg-N.html` → re-render, until a render is clean
   (cap ~5 iterations). Agents edit **only** the `<svg>…</svg>`, never the wrapper.
4. Read each agent's final render yourself to confirm (don't just trust "clean").
5. Splice the fixed SVGs back into the deck (splice snippet is in
   `isolate_and_render.js`), then render the **whole page** once more and eyeball
   it in context.

## Per-SVG prompt template

Fill in the ALL-CAPS slots. Keep the rubric and constraints verbatim.

```
You are a meticulous visual-QA specialist fixing element problems in ONE inline
SVG diagram. Work only on this file:  <ABS>/svg-N.html

WHAT THIS DIAGRAM SHOULD SHOW: <DESCRIBE EVERY ELEMENT AND ITS INTENT — the agent
judges balance against this, e.g. "a red brace '}' that should be vertically
CENTERED on the middle box and span roughly its height (not droop toward the box
below)". Name the specific things most likely to be wrong.>

RENDER (run after every edit; the harness forces the final, fully-visible state):
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 --window-size=900,1400 --screenshot="<ABS>/render-N.png" --virtual-time-budget=3000 "file://<ABS>/svg-N.html"
Then Read the PNG (rendered 2×; SVG coords are viewBox units). Zoom suspect
regions:  sips -c <H> <W> --cropOffset <Y> <X> <png> --out /tmp/z.png

Hunt ALL FOUR failure classes, not just collisions:
  1. Collision  — glyphs overlapping text/lines/arrowheads/box edges.
  2. Occlusion  — an element painted over another (e.g. a dot swallowing an
                  arrowhead — end the stroke short of the target's edge).
  3. Clipping   — anything cut by the viewBox edge (rotated labels, top labels).
  4. Proportion — sized/placed wrong even if nothing overlaps (droop, imbalance).

LOOP: render → Read → fix → render, until clean. Max 5 iterations.

HARD CONSTRAINTS: edit ONLY the <svg>…</svg> in svg-N.html (not the wrapper
<style>, marker <defs>, or <body>). NEVER change text wording, numeric values
(bar lengths/heights encode data — keep each value proportional), colors, or which
elements exist. Reposition/reshape/adjust the viewBox — do not redesign.

When clean, STOP, leave the corrected svg-N.html on disk, and report: CLEAN or not,
iterations used, and the exact coordinate change(s) you made.
```

## Gotchas the harness exists to expose

- **Missing arrowheads.** Markers are defined once in a document-level `<svg><defs>`
  and referenced by `url(#ah-*)`. The harness copies that block in; if you author
  SVGs without it, isolated renders lose every arrowhead. (In the live page it
  works because the defs live elsewhere in the same document.)
- **`.anim-fade` + static rotation.** `.anim-fade` animates opacity only. If the
  page's reduced-motion/`<noscript>` override applies `transform:none` to it, any
  rotated label carrying `.anim-fade` (e.g. a vertical axis title) loses its
  rotation for those users. The scaffold's overrides deliberately exclude
  `.anim-fade` from `transform:none`. Belt-and-suspenders: put the rotation on a
  wrapping `<g transform="rotate(...)">` so it can never be stripped.
