---
name: pencil-genga
description: Make something in the hand-drawn "pencil genga" look first built for jaden.html — graphite line on warm paper, blue construction marks, red shadow boundaries with hatching, flat marker colour that stops short, and, when it moves, held drawings at 8–12 a second instead of tweens. Use when asked for a hand-drawn, pencil, sketchbook or anime-key-drawing look, for something that must not read as "AI" or "SVG" art, for a card, gift page, illustration or animation in the style of the Jaden page, or to turn Jasper's own pen drawings (photos) into vector figures. Covers static pieces as well as animated ones. ALWAYS start by reading the most recent piece as the reference implementation (see "Find the reference piece"). REQUIRES review-agent passes on everything drawn, and Jasper's approval of the static look before any animation (references/review.md). Run one headless Chrome at a time.
---

# Pencil genga

A *genga* is an animator's key drawing: graphite line, blue construction marks
still showing, shadow shapes ringed in red pencil for whoever colours it next.
This skill keeps a look built on one of those that somebody started colouring
and didn't finish, along with the process that produced it. Both come from one
piece: `jaden.html`, a birthday present for Jasper's brother.

The look exists because the first version of that page (commit `8be42a8`)
worked well and still read as made by a machine: gradients where a painter
would lay a flat tone, lines that were too perfect, and motion that slid
smoothly between poses. Its recipient dislikes the "AI aesthetic". So the test
for every mark and every frame is whether it looks made by a hand. Where Jasper
has drawn something, those strokes are the line.

Later pieces won't all be birthday pages, start from a drawing, or move. What
carries over is in four files:

- `references/look.md`: the look, in Jasper's words, and the mistakes the
  first piece made on the way to it.
- `references/strokes.md`: where a figure's lines come from (Jasper's
  drawing, code, or an official mark) and how each is done.
- `references/motion.md`: how things move, for pieces that do.
- `references/review.md`: the review loop that got all of it right.

This file covers how a piece is put together and how the work is run.

## Find the reference piece (do this first, every time)

Every piece ships its own copy of the renderer, so this lists the pieces,
newest first, with any uncommitted one at the top:

```bash
for f in resources/*/pencil.js; do echo "$(git log -1 --format=%cs -- "$f" | grep . || echo uncommitted) $f"; done | sort -r
```

Read the newest finished piece before planning anything: `<piece>.html`,
`resources/<piece>/`, and its work folder `<piece>-work/`, starting from the
README there. Look at its stills and review pages. Prefer its practice over
anything here that contradicts it.

So far there is one piece, `jaden`, and `jaden-work/README.md` is its map.

## How a piece is built

A figure is authored as strokes and stays that way until the moment it is
drawn: centreline strokes in the order the pen made them, grouped into named
parts, plus style data (fill regions, shadow shapes, highlights, construction
marks, a palette). A renderer (`pencil.js`) turns that into pencil, paper
tooth, marker and hatching on a canvas, and the same options always give the
same pixels.

That is what lets colour be a dial Jasper sets by eye, lets a figure write
itself on and its parts move separately, and lets a reviewer ask for any
drawing and get exactly that drawing. The renderer's API and the data format
are in `<piece>-work/style/README.md`. Figure data ships as `.js` files that
assign onto a global, so pages run from `file://` with no server.

## The stages

A piece enters and leaves where it needs to; a static piece skips stage 4.
Scale the cast to the piece: one small figure might be one artist and one
reviewer. It is still reviewed by someone who didn't make it, and still seen
by Jasper before it ships.

**1. Direction.** Agree with Jasper what the piece is and where the hand in it
comes from before anyone draws in bulk. If you are restyling something that
exists, say specifically what reads as digital in it (`references/look.md` has
the diagnosis of the first Jaden page); the existing version is also the
animatic, and its staging and timing carry over. If the piece will sit inside
another page, settle how a sheet of paper meets that page: pencil and marker
are multiplied onto paper and need it underneath. When the direction is open,
a few still frames of one moment in different treatments settle it faster than
discussion.

**2. Strokes.** From Jasper's photographed drawing (one extraction agent per
figure), authored in code with a deliberately imperfect hand, or traced from
an official mark. `references/strokes.md` covers each.

**3. Style.** The renderer and each figure's style data are built or extended
against a style brief and shown on a review page: each figure at several
colour levels (beside its source, where it has one), on a live canvas with
dials, and all the figures together on one sheet to judge whether they match.
On jaden one styling agent owned the renderer and the style data for Jasper's
figures, while each artist of an authored figure wrote its strokes and style
together; a piece that doesn't change the renderer needs no renderer owner.
Run the review loop (`references/review.md`) until a round comes back as
polish. Then Jasper reviews the page. This is a decision point, not a
courtesy: on jaden it produced the colour level (0.64), the idea that the box
should draw itself from nothing, and the paper world. Don't start motion
before it.

**4. Motion**, if the piece moves. Write an animation brief that records what
Jasper decided, in Jasper's words. Then a small team works from it: the
renderer's owner, resumed, extends it; artists author any new figures; a
director builds the page. `references/motion.md` has the rules. The page
exposes a deterministic seek hook so that any drawing can be captured, and
reviewers go through it shot by shot.

**5. Ship.** Build beside any existing version (`<piece>-next.html`) and swap
when Jasper approves. A private gift page is `noindex`, unlinked, left out of
the sitemap, and its link-preview image shows nothing that spoils it. Commit
and push only when asked; pushing is what publishes.

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
- **A real hand is kept.** Jasper's geometry and wobble are the provenance of
  a piece. Authored strokes are held to the same irregularity.
- **Makers don't judge their own work.** Whoever wrote the coordinates cannot
  see them. Review-only agents look at pixels, and so do you before anything
  goes to Jasper.

## Running the agents

Brief agents the way you would want to be briefed: the background, Jasper's
words verbatim, pointers into the repo, and what the thing is for, leaving the
how to them. The Jaden briefs (`jaden-work/STYLE-BRIEF.md`,
`ANIMATION-BRIEF.md`) are worked examples of the two this process needs, not
templates; a new piece has its own subject, decisions and constraints.

- **Briefs are files in the work folder**, shared by every agent on a stage.
- **One owner per file.** Others treat the renderer as read-only and preview
  against a frozen snapshot while it is being changed. You carry API changes
  and mismatches between agents.
- **Resume, don't respawn.** An agent's context is most of what it is worth.
- **Keep the main thread thin**, and still look for yourself. A small contact
  sheet is enough to form your own view before each handoff.
- Subagents don't touch git.

## This machine

- **One headless Chrome at a time.** Five review agents each running their own
  crashed Jasper's 8 GB laptop mid-project. By default, capture the contact
  sheets yourself and hand reviewers the images; an agent that needs its own
  captures runs alone. Say so in every brief.
- **Disk is often tight.** Contact sheets, not frame dumps; clean up
  intermediates; reuse `jaden-work/venv` (327 MB) if it is there instead of
  making another.
- **Each reviewer writes only in its own folder.** One overwrote a capture
  script when this wasn't said.

## Where things live

| Path | What |
|---|---|
| `<piece>.html` | The page, at the repo root. A piece that is a figure inside another page has none; the host page is edited instead. |
| `resources/<piece>/` | What the page loads: its renderer, figure data, link-preview image. |
| `<piece>-work/` | Briefs, tools, review pages, QA findings, extracted strokes, source photos, and a README that maps them. |

- **Copy the renderer forward.** A new piece starts from a copy of the newest
  `pencil.js` and its README, under its own data global, and changes it
  freely. Never edit a shipped piece's files to suit a new one: a finished
  gift should not change because a later piece needed something.
- **The work folder is committed, minus what regenerates.** See
  `jaden-work/.gitignore`. Jekyll publishes everything at the repo root, so add
  the folder to `exclude` in `_config.yml`.

## When you finish

Push back what generalizes: process into this file, the rest into the
reference file it belongs to. Corrections from Jasper matter most. The new
piece then becomes the reference, so leave its work folder readable.
