# The current skin and content conventions (mutable)

Everything in this file is how the first visual essay looked and was wired,
and all of it is expected to be overhauled. SKILL.md deliberately does not
depend on any of it. When the skin changes, change this file and the scaffold;
keep `data-scrolly=` as the format's marker.

## Skin (as of the first essay, October 2026)

- The scrolldeck skin: dark `slate800` hero and outro with a radial accent
  glow, dark section bands with a progress meter, the blog's `#f0f0f0` canvas,
  `latex.now.sh` serif for prose and sans for figure furniture, MathJax.
- Prose sits in a reading column (`.prose`, 46rem measure). Figures are white
  cards (`.fig`) between paragraphs, full content width.
- One signature accent per essay (violet for the first), a categorical set for
  its recurring objects (blue / orange / green for the three units), per the
  scrolldeck palette rules.
- Captions: a bold accent-coloured title sentence (`.fn`) followed by the
  caption text. **No figure numbers**, and the prose says "the next figure" or
  "the chart above" rather than "Figure 3".
- A hero glyph (static SVG, usually script-generated from the data) doubles as
  the share card's centrepiece; the share card reproduces the hero.
- The essay's enumerated points become `.cols` of `.block`s; one `.pull`
  quote; a `.stats` row at most once.

## Scaffold class names (the skin's implementation)

- `.scrolly` card → `.stage` (pinned) → `.stage-body` (the SVG or canvas) +
  `.stage-cap` (caption strip with `.cap-dots` and `.cap-text`); `.steps` →
  `.step[data-at]` spacers. `.stage-tools` for on-stage controls,
  `.stage-counter` for a big number readout.
- `.fb` is the `<noscript>` fallback image; `html.no-js` / `html.js` switch
  the stage from pinned to static and reveal the steps as a list.
- Widgets: `.seg` segmented toggle, `.btn`, `.chk`, `input[type=range]`,
  `.w-grid` / `.w-eq` / `.w-ctl` layout.
- Current stage geometry: `top:14px; height:min(80vh,720px)`; steps `88vh`
  (last `60vh`); under 760 px the stage is `min(72vh,560px)` and
  `.stage-tools` scale to 0.66.

## Content conventions

- Appendices stay out of the page unless asked; sentences that only point at
  them ("Appendix D has the arithmetic") are dropped. The research-repo link
  in the source's footer is dropped (the repo is private).
- Build notes in the source ("Notes for the build") are not content.
- Each script-built figure's `aria-label` and fallback `alt` carry the
  figure's intent paragraph, numbers included.

## Wiring

- `blog-archive.html`: a plain entry, newest first, whose title links straight
  to the essay; no "Visual walkthrough" companion sub-link (that pattern is for
  a scrolldeck that accompanies a prose post).
- `sitemap.xml`: a `<loc>` with today's `lastmod`.
- Resources: `resources/<slug>-og.png` (1200×630), `resources/<slug>-<fig>.png`
  fallbacks, any printable companion as `resources/<slug>-<name>.svg`.
