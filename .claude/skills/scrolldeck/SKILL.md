---
name: scrolldeck
description: Build a "scrolldeck" — a faux-LaTeX, scroll-driven visual presentation for the jagilley.github.io blog. Use when asked to make a visual/slides-style/scrollytelling post, port a talk or beamer/LaTeX deck into a scrollable web page, or create an "Apple-webpage-style" walkthrough where content and diagrams reveal on scroll. The reference implementation is forward-self-models-visual.html. REQUIRES a subagent visual-QA pass on every SVG (see references/overlap-qa.md) — do not skip it.
---

# Scrolldeck

A **scrolldeck** is a slide deck you read by *scrolling* instead of arrow-keying.
It takes a talk or a beamer/LaTeX deck and renders it as one long, scroll-driven
web page in this blog's faux-LaTeX skin: every slide becomes a card, every figure
is rebuilt as inline SVG that assembles itself as it scrolls into view, and the
whole thing reads like an Apple product page wearing a LaTeX sweater.

Reference implementations (study before building): **`forward-self-models-visual.html`**
(blue/green accent) and **`neural-networks-learn-bottom-up.html`** (orange accent) — two
decks in the same format with *different signature colors*; see "The palette & per-deck
accent" below for why.
Starter skeleton with every primitive wired up: **`references/scaffold.html`** — copy it.

## The one rule you cannot break

**Every hand-authored SVG MUST pass the subagent Overlap-QA loop before shipping.**
You author SVGs by reasoning about coordinates, which makes you blind to the pixels
they render into — braces droop, arrowheads hide under dots, rotated labels clip.
A separate vision agent that sees only the image catches what you can't. Full
procedure, rubric, and prompt template: **`references/overlap-qa.md`**. This is a
hard requirement of the format, not a nice-to-have.

## Vocabulary (the parts of a scrolldeck)

- **Bookends** — the dark `slate800` **hero** (opening) and **outro** (closing).
  These replace the beamer title and summary slides. Give each a soft radial glow.
- **Bands** — full-width dark section dividers, one per beamer `\section`, each with
  a **progress meter** (`--p` = fraction, .2/.4/.6/.8/1) that fills as it scrolls in.
- **Panels** — white slide cards, **one per source slide**, content kept close to
  verbatim. Each opens with a **frame title** (bold, blue left-rule).
- **Blocks** — beamer-style titled boxes: `.block` (blue), `.alertblock` (red),
  `.exampleblock` (green). Use for "core intuition", "consequence", callouts.
- **Stat cards** — big-number tiles (`.stat.blue/.green/.purple`) for headline
  results (a cosine, a %, a param count).
- **Self-drawing diagrams** — inline SVG whose arrows draw in (`.anim-draw`), bars
  grow (`.anim-grow`/`.anim-growx`), and elements fade (`.anim-fade`) on scroll.
- **Reveal** — the Apple-style fade-and-rise (`.reveal`, staggered with `.d1..d5`)
  applied to panel content when its `[data-observe]` ancestor enters the viewport.
- **Parallax drift** — a small scroll-linked `translateY` on key diagrams
  (`data-parallax=".06"`–`".12"`; keep it subtle — a few px).

## Core principles

1. **Live inside the blog's skin.** Keep `latex.now.sh/style.css`, the `#f0f0f0`
   canvas, the `← All Posts` link, MathJax, and the OG/canonical metadata block.
   A scrolldeck is a *new format within the existing identity*, never a reskin.
2. **One slide → one panel, content verbatim.** Port the words as-is. Drop only
   pure slide-idiom (title/summary chrome) that the bookends already replace.
3. **Rebuild figures as SVG — never screenshot the LaTeX/beamer output.** TikZ
   diagrams become hand-built inline SVG in the deck's palette (see below). This is
   where the Overlap-QA loop earns its keep.
4. **Serif prose, sans furniture.** Body prose inherits the LaTeX serif (the
   blog's signature). Diagram labels, stat numbers, table text, and block titles
   use `--sans`. This mirrors beamer's `\sffamily` labels over serif body.
5. **Motion is subtle and scroll-driven.** Fade+rise, draw-in, grow, gentle
   parallax — nothing bounces or spins. Respect `prefers-reduced-motion` and
   `<noscript>` (the scaffold already does).

## Build workflow

1. **Read the source** (the `.tex`/slides) and the reference post
   `forward-self-models-visual.html`. Map each slide to a panel and each
   `\section` to a band.
2. **Copy `references/scaffold.html`** to `<slug>.html`. Fill in metadata.
3. **Build the bookends**, then the bands, then the panels top to bottom. Keep
   prose verbatim; choose `.block`/`.stats`/`.cols` layouts per slide.
4. **Rebuild each figure as inline SVG.** Reference the shared `#ah-*` arrowhead
   markers. Give every diagram a precise `aria-label` — the QA agents depend on it.
5. **Run the Overlap-QA loop** on every SVG (`references/overlap-qa.md`). Non-negotiable.
6. **Verify the whole page** with headless Chrome, in normal *and* reduced-motion/
   no-JS state (render the isolation harness, which mirrors those overrides).
7. **Wire it into the blog:** add an entry to `blog-archive.html` (newest first)
   and a `<loc>` to `sitemap.xml`. Link the companion prose post from the lead/outro.

## The palette & per-deck accent

The table below is the **vocabulary** of hues (beamer-extended, exposed as CSS vars
in the scaffold) — not a fixed per-element assignment. Don't *improvise* colors (no
eyeballed one-off hex), but **do** give each deck its own signature identity:

| var | hex | use |
|---|---|---|
| `--mainblue` | `#3B82F6` | primary accent, `.hl`, block titles, frame-rule |
| `--emerald600` / `--fwdgreen` | `#059669` / `#22C55E` | "forward"/positive, `.fwd`, example blocks |
| `--warmred` | `#EF4444` | alerts, negatives, `.red` |
| `--softpurple` | `#8B5CF6` | tertiary (e.g. param counts) |
| `--arrowyellow` | `#EAB308` | tap points / highlighted flow |
| `--amber` | `#F59E0B` | callout accents |
| `--streamgray` | `#64748B` | structural lines (residual stream, axes) |
| `--grayout` | `#9CA3AF` | dimmed / `.dim` |
| `--slate800/700/200/100/50` | see scaffold | dark bg / body text / borders / tints |

**Per-deck signature accent.** Every scrolldeck earns *one* signature accent that
owns the **chrome** — the scroll-progress bar, section bands, progress meters, the
`.frame-title` left-rule, primary `.hl` and block titles — and it is often *not* the
default blue. Derive it from the source when the deck has a color identity of its
own: carry the source's `\definecolor`s over verbatim, compute any blends
**precisely** (e.g. a beamer warmth scale `learned!P!unlearned` → generate the six
band hexes with a throwaway script; never eyeball a gradient), then let the central
metaphor drive the assignment. Two worked examples:

- `forward-self-models-visual.html` runs on **blue + green** — its thesis is
  "forward model = green, main model = blue," so those own the chrome.
- `neural-networks-learn-bottom-up.html` runs on **orange** (`--gateorange #F97316`,
  lifted straight from the source `.tex`) — its warmth scale encodes *how far each
  level is learned*, so orange owns the chrome and blue is demoted to the
  hierarchy / top-down / model role.

The scaffold ships blue-primary; to re-accent, add your var (e.g. `--gateorange`) and
repoint the chrome rules at it (`.scroll-progress`, the `.band`/`.sec-num`/
`.sec-progress i` accents, `.frame-title` border, `.hl`, block-title backgrounds),
then reassign the secondary colors (blue/green/red/purple) to whatever the metaphor
needs — add a matching arrowhead `<marker>` (`#ah-orange`) and block variant
(`.gateblock`) if the accent isn't already covered. When the source has no strong
palette, pick one accent that fits the topic and commit to it. The rule is *don't
invent arbitrary per-element hex* — not *always use blue*.

## SVG conventions

- **Shared markers.** Arrowheads live in one document-level `<svg><defs>` and are
  referenced by `url(#ah-blue)` etc. anywhere in the page. Add a color there once.
- **Self-drawing strokes:** put `pathLength="1"` on the line/path and class
  `anim-draw`. **Growing bars:** class `anim-grow` (from baseline) or `anim-growx`
  (from left) with `style="transform-origin:<x>px <baseline>px"`; stagger via `--gd`.
- **Bars encode data — never let QA change a value.** Fix layout, not the numbers.
- **Math:** SVG can't render MathJax. Use Unicode in-SVG (`aᵢ`, `âⱼ`, `σ`) and put
  real formulas in an HTML `.note` caption below the SVG (`\( … \)`).
- **Rotated labels** (vertical axis titles, "residual stream"): if the text also
  carries `.anim-fade`, wrap the rotation in `<g transform="rotate(...)">` so a
  `transform:none` override can never strip it. Keep glyphs off the viewBox edge.
- **Two-column slides:** `.cols` (or `.left-wide`/`.right-wide`); they stack under
  760px. Diagram on one side, prose on the other is the default shape.

## Accessibility & robustness

- The reduced-motion and `<noscript>` overrides reveal everything and skip motion.
  Critically, they exclude `.anim-fade` from `transform:none` (it animates opacity
  only) so static rotations survive. Keep this exactly as the scaffold has it.
- `prefers-reduced-motion` also disables parallax and the bob cue in the JS.

## Verifying with headless Chrome

The IntersectionObserver hides `.reveal` content until scrolled into view, so a
naive top-of-page screenshot of the live file looks blank below the fold. To check
layout, render the isolation harness (animations forced to final state) — see
`references/isolate_and_render.js`. To confirm the JS itself runs, render the live
file and check the hero (which reveals immediately, in-viewport). Split tall
renders with `sips -c <h> <w> --cropOffset <y> <x> in.png --out seg.png`.

## Reference files

- `references/scaffold.html` — copy-paste skeleton: palette, all CSS classes,
  shared markers, hero/band/panel/outro, the observer+parallax JS. Start here.
- `references/isolate_and_render.js` — extracts each diagram SVG into a standalone
  2×-renderable harness (+ splice-back snippet) for the QA loop.
- `references/overlap-qa.md` — the mandatory subagent QA loop: the 4-class rubric
  (collision / occlusion / clipping / proportion) and the per-SVG prompt template.
