---
name: pencil-genga
description: Make something in the hand-drawn "pencil genga" look — graphite line on warm paper, blue construction marks, red shadow boundaries with hatching, flat marker colour that stops short, and, when it moves, held drawings at 8–12 a second instead of tweens. Use when asked for a hand-drawn, pencil, sketchbook or anime-key-drawing look, for something that must not read as "AI" or "SVG" art, for a card, gift page, illustration or animation in this style, or to turn the user's own pen drawings (photos) into vector figures. Covers static pieces as well as animated ones. Bundles a canvas renderer, example figures and capture tools (kit/). ALWAYS start from the kit and from any earlier piece in the repo (see "Where to start"). REQUIRES review-agent passes on everything drawn, and the user's approval of the static look before any animation (references/review.md). Run one headless Chrome at a time.
---

# Pencil genga

A *genga* is an animator's key drawing: graphite line, blue construction marks
still showing, shadow shapes ringed in red pencil for whoever colours it next.
This skill keeps a look built on one of those that somebody started colouring
and didn't finish, along with the process that produced it. Both come from one
piece: a hand-drawn birthday page, built from its author's pen drawings of a
present and a bowling ball.

The look exists because the first version of that page worked well and still
read as made by a machine: gradients where a painter would lay a flat tone,
lines that were too perfect, and motion that slid smoothly between poses. Its
recipient dislikes the "AI aesthetic". So the test for every mark and every
frame is whether it looks made by a hand. Where the user has drawn something,
those strokes are the line.

Later pieces won't all be gift pages, start from a drawing, or move. What
carries over:

- `references/look.md`: the look, in the first user's words, and the mistakes
  the first piece made on the way to it.
- `references/strokes.md`: where a figure's lines come from (the user's
  drawing, code, or an official mark) and how each is done.
- `references/motion.md`: how things move, for pieces that do.
- `references/review.md`: the review loop that got all of it right.
- `kit/`: the renderer, its documentation, two example figures and the tools.

This file covers how a piece is put together and how the work is run. Paths
are relative to this skill's folder unless they start with `<piece>`.

## Where to start (every time)

**See the look.** `references/look.jpg` is the two example figures at the
resting colour level. `kit/demo.html` renders them live from `file://`
(`?color=0`, `?build=0.7`, `?boil=1`), and `kit/RENDERER.md` documents the
renderer and the figure data format.

**Look for earlier pieces in the repo you are in.** Each piece keeps its own
copy of the renderer, so with the layout under "Where things live" this lists
them, newest first, with any uncommitted one at the top:

```bash
for f in resources/*/pencil.js; do echo "$(git log -1 --format=%cs -- "$f" | grep . || echo uncommitted) $f"; done | sort -r
```

If there is one, the newest finished piece is a fuller worked example than the
kit. Read its page, its `resources/<piece>/` and its work folder
`<piece>-work/`, starting from the README there, and prefer its practice over
anything here that contradicts it.

The first piece's work folder holds what a kit can't generalise: its two
briefs, the findings from every review round, three extraction pipelines, the
builders for its figures, its review pages, and the page itself. The reference
files call these "the first piece's". If you are not in that repo, what is
written here is what you have, and it is enough to work from.

## How a piece is built

A figure is authored as strokes and stays that way until the moment it is
drawn: centreline strokes in the order the pen made them, grouped into named
parts, plus style data (fill regions, shadow shapes, highlights, construction
marks, a palette). A renderer (`kit/pencil.js`) turns that into pencil, paper
tooth, marker and hatching on a canvas, and the same options always give the
same pixels.

That is what lets colour be a dial the user sets by eye, lets a figure write
itself on and its parts move separately, and lets a reviewer ask for any
drawing and get exactly that drawing. Figure data ships as `.js` files that
assign onto a global, so pages run from `file://` with no server.

## The stages

A piece enters and leaves where it needs to; a static piece skips stage 4.
Scale the cast to the piece: one small figure might be one artist and one
reviewer. It is still reviewed by someone who didn't make it, and still seen
by the user before it ships.

**1. Direction.** Agree with the user what the piece is and where the hand in
it comes from before anyone draws in bulk. If you are restyling something that
exists, say specifically what reads as digital in it (`references/look.md` has
the diagnosis of the first piece); the existing version is also the animatic,
and its staging and timing carry over. If the piece will sit inside another
page, settle how a sheet of paper meets that page: pencil and marker are
multiplied onto paper and need it underneath. When the direction is open, a
few still frames of one moment in different treatments settle it faster than
discussion.

**2. Strokes.** From the user's photographed drawing (one extraction agent per
figure), authored in code with a deliberately imperfect hand, or traced from
an official mark. `references/strokes.md` covers each.

**3. Style.** The renderer and each figure's style data are built or extended
against a style brief and shown on a review page: each figure at several
colour levels (beside its source, where it has one), on a live canvas with
dials, and all the figures together on one sheet to judge whether they match.
On the first piece one styling agent owned the renderer and the style data for
the drawn figures, while each artist of an authored figure wrote its strokes
and style together; a piece that doesn't change the renderer needs no renderer
owner. Run the review loop (`references/review.md`) until a round comes back
as polish. Then the user reviews the page. This is a decision point, not a
courtesy: on the first piece it produced the colour level (0.64), the idea
that the present should draw itself from nothing, and a world made of bare
paper. Don't start motion before it.

**4. Motion**, if the piece moves. Write an animation brief that records what
the user decided, in the user's words. Then a small team works from it: the
renderer's owner, resumed, extends it; artists author any new figures; a
director builds the page. `references/motion.md` has the rules. The page
exposes a deterministic seek hook so that any drawing can be captured, and
reviewers go through it shot by shot.

**5. Ship.** Build beside any existing version (`<piece>-next.html`) and swap
when the user approves. A private gift page is `noindex`, unlinked, left out
of any sitemap, and its link-preview image shows nothing that spoils it.
Commit and push only when asked; on a published site, pushing is what
publishes.

## What holds across pieces

- **Authored as strokes, styled by the renderer.** Nothing is painted as a
  raster or produced by image generation; the paper tooth is the only texture
  and it is computed. This is about how figures are made, not how they are
  delivered: a static figure may ship as an image exported from the renderer
  when a live canvas (about 105 KB of renderer plus data) buys nothing.
- **Deterministic.** Same options, same pixels. Review depends on it, and so
  does the boil.
- **Nothing tweens.** Whatever changes, changes when a new drawing is shown:
  position, scale, colour, opacity, the camera.
- **A real hand is kept.** The user's geometry and wobble are the provenance
  of a piece. Authored strokes are held to the same irregularity.
- **Makers don't judge their own work.** Whoever wrote the coordinates cannot
  see them. Review-only agents look at pixels, and so do you before anything
  goes to the user.

## Running the agents

Brief agents the way you would want to be briefed: the background, the user's
words verbatim, pointers into the repo, and what the thing is for, leaving the
how to them. Two briefs carry the process, one for style and one for motion.
The first piece's are worked examples if you have them, not templates; a new
piece has its own subject, decisions and constraints.

- **Briefs are files in the work folder**, shared by every agent on a stage.
- **One owner per file.** Others treat the renderer as read-only and preview
  against a frozen snapshot while it is being changed. You carry API changes
  and mismatches between agents.
- **Resume, don't respawn.** An agent's context is most of what it is worth.
- **Keep the main thread thin**, and still look for yourself. A small contact
  sheet is enough to form your own view before each handoff.
- Subagents don't touch git.

## Machines

- **One headless Chrome at a time**, unless you know the machine has memory to
  spare. Five review agents each running their own crashed an 8 GB laptop in
  the middle of the first piece. By default, capture the contact sheets
  yourself and hand reviewers the images; an agent that needs its own captures
  runs alone. Say so in every brief.
- **Keep intermediates small.** Contact sheets, not frame dumps; clean up
  after extraction; share one Python environment between pieces.
- **Each reviewer writes only in its own folder.** One overwrote a capture
  script when this wasn't said.

## Where things live

This is the layout the first piece used, in a static-site repo. Fit it to the
host repo's conventions, but keep each piece's renderer with the piece.

| Path | What |
|---|---|
| `<piece>.html` | The page. A piece that is a figure inside another page has none; the host page is edited instead. |
| `resources/<piece>/` | What the page loads: its renderer, figure data, link-preview image. |
| `<piece>-work/` | Briefs, tools, review pages, QA findings, extracted strokes, source photos, and a README that maps them. |

- **Copy, don't share.** A new piece starts from a copy of `kit/pencil.js`
  (or of the newest piece's renderer, if that has moved on) under its own data
  global, and changes it freely. Never edit a shipped piece's files to suit a
  new one: a finished gift should not change because a later piece needed
  something. The tools in `kit/tools/` are copied the same way, or run in
  place.
- **Commit the work folder, minus what regenerates:** the Python environment,
  extraction intermediates, exported stills. If the repo is a published site,
  keep the folder out of what is served (in Jekyll, `exclude` in
  `_config.yml`).
- **Strip photo metadata before anything is committed**
  (`references/strokes.md`).

## When you finish

Push back what generalizes: process into this file, the rest into the
reference file it belongs to, and any improvement to the renderer or a tool
that isn't specific to the piece into `kit/`. Corrections from the user matter
most. Leave the piece's work folder readable; it is the next worked example.
