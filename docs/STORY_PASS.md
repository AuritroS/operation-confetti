# Story and chrome pass — stage 1: script, storyboard, image prompts

Status: **for review**. Nothing here is built and no image has been paid for.
Stage 2 spends from the $1 image budget only after this page is approved.

Related: `design.md` §2 (story), `story-reference/README.md` (what panels must
match), `src/story/script.ts` (where the copy will live).

## 1. The spine

Aurora has stolen Matthew's birthday cake and locked the party's presents in
her vault. He takes the presents back (level 1), chases her across Toronto on
a grapple line (level 2), and gets the cake back on a rooftop with a confetti
cannon (level 3).

One "why" per level, said in the panel before it:

| Level | Why the player is doing this | Said by |
| --- | --- | --- |
| 1 Gift Vault | The presents are in her vault | Aurora, intro |
| 2 Skyline Chase | She is across town and dropping presents as she runs | Matthew, vault reveal |
| 3 Cake Showdown | She has the cake, he has a party popper | Both, rooftop |

Voices. **Aurora** is amused, never threatened, always one move ahead.
**Matthew** is deadpan and literal; he states facts and they land as jokes.
The running gag is "birthday equipment".

Rules: at most three lines per panel, each under twelve words. The whole comic
reads in about forty seconds. Skip stays on every panel but the cover.

## 2. Beats

Seven panels. Five need new images (marked **new**); the cover and the intro
reuse art that exists. The current rooftop two-shot is replaced because the
"party popper" line needs the actual confetti cannon in frame, and the
existing image shows no weapon at all. Framing is start → end over about six seconds, then a slow drift
holds. `origin` is the CSS transform origin the zoom closes on.

| # | Id | When | Image | Framing | Lines | Button |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `title` | boot | `matthew` (cover, letterboxed) | static, slow 1.00→1.04 drift | none; name entry | Start |
| 1 | `intro` | before L1 | `aurora` | 1.00 @ 50% 50% → 1.25 @ 62% 30% (in on her and the cake) | AURORA: Looking for your cake? · MATTHEW: That's my birthday cake. · AURORA: Your presents are in my vault. Come and get them. | Next |
| 2 | `vault` | after L1 | **new** `vault` | 1.30 @ 50% 45% → 1.00 (door opens on the city) | CAPTION: The vault opens on the whole city. · MATTHEW: Presents, check. She's already across town. · AURORA (off-panel): Keep up. | Next |
| 3 | `chase` | before L2 | **new** `chase` | 1.00 → 1.35 @ 40% 30% (in on him mid-swing) | CAPTION: She is dropping presents as she runs. · MATTHEW: Fine. I'll take those too. | Next |
| 4 | `rooftop` | before L3 | **new** `rooftop` | 1.15 @ 70% 25% (her, cake) → 1.15 @ 30% 55% (pan to him and the cannon) | AURORA: You brought a party popper? · MATTHEW: Birthday equipment. | Next |
| 5 | `win` | after L3 win | **new** `win` | 1.25 @ 50% 35% → 1.00 (reveal the confetti) | CAPTION: Cake recovered. · AURORA: Save me a slice? · MATTHEW: You're on cleanup. | Results |
| 6 | `loss` | after L3 loss | **new** `loss` | 1.00 → 1.30 @ 65% 30% (follow her off the edge) | CAPTION: The cake remains at large. · AURORA: I'll save you a slice. · MATTHEW: You'd better. | Results |

Notes on the seam after level 1: it carries two panels (vault, chase). It is
the midpoint of the story and the only place the player sees Matthew pick up
the blaster, which the level 2 tutorial then teaches. Two taps, both short.

The `chase` beat currently reuses the cover art cropped to hide its painted
title. The new image replaces that; the cover goes back to being only the
cover.

## 3. Motion and dialogue

- **Camera**: each beat has a start and end framing, eased out over ~6 s, then
  a continuous drift (scale 1.00→1.04 over 20 s) so no panel sits still.
- **Depth**: `chase`, `win` and `loss` get two layers, characters over
  background, moving at different rates on the drift and following device
  tilt where the browser allows it. The other panels are single plates.
- **Dialogue**: lines reveal one at a time on tap; the last tap enables Next.
  Speaker labels keep their colours, gold for Matthew and magenta for Aurora.
  A caption (no speaker) is set in italics, dimmer. A tap on a panel never
  reaches the gameplay surface because the panel owns the surface while up.
- **Transitions**: between panels, a colour wipe in whoever owns the next
  beat (magenta for Aurora's, gold for Matthew's). From a panel into a level,
  an iris that closes on the panel and opens on the 3D scene. This replaces
  the black curtain and is where the level 2 fade break gets fixed.
- **Reduced motion**: with `prefers-reduced-motion`, framing snaps to its end
  state, the drift is off, lines reveal without animation, wipes become
  cross-fades.

## 4. Image prompts

All four are **edits** on `gpt-image-2.6-sunburst`, portrait `1024x1536`,
with reference images for likeness and props. References are downscaled to
768 px on the long side before upload to cut input tokens. Every prompt ends
with the same guard block:

> Same illustration style, palette and lighting as image 1. No text, no title,
> no lettering, no logos. Keep the lower third of the frame quiet and dark so
> captions can sit over it. Faces and hands fully in frame.

Checklist every candidate is scored against (from `story-reference/README.md`):
no hood, no bandit mask, glasses on Matthew, navy-and-gold suit, Aurora wears
the crown not a hat, purple-and-gold, yellow present with gold ribbon, gold
blaster or gold confetti cannon, gift emblem on the gate, CN Tower present
where the skyline shows, no painted text, caption zone quiet.

### `vault` — after level 1

References: `public/story/matthew.webp` (1, likeness), `story-reference/gate-vault-door.png` (2),
`story-reference/grapple-blaster.png` (3), `story-reference/cn-tower.png` (4),
`story-reference/present.png` (5).

> The man in image 1, same face, glasses, hair and navy-and-gold suit, stands
> in the open doorway of a huge round vault door like image 2, its gift
> emblem catching gold light. He has just picked up the gold grapple blaster
> from image 3 and holds it loosely, looking out. Beyond the door: a rooftop
> edge and the Toronto skyline at night with the CN Tower from image 4 lit
> purple, and a full moon. A few yellow presents like image 5 are stacked at
> his feet. Low three-quarter angle from behind his shoulder, so the city is
> the subject. + guard block.

### `chase` — before level 2

References: `matthew.webp` (1), `grapple-blaster.png` (2), `present.png` (3), `cn-tower.png` (4).

> The man in image 1, same face, glasses, hair and suit, swinging on a
> glowing gold cable from the blaster in image 2, low over a Toronto night
> street between brick buildings with striped awnings and hanging street
> signs, CN Tower from image 4 and full moon behind. A yellow present like
> image 3 is tucked under his arm, and two more presents are falling ahead of
> him down the street, as if dropped by someone fleeing. Dynamic diagonal
> composition, motion lines on the cable. + guard block.

(The 7 Nov probe at low quality is the baseline for this one; it is in
`.local-tmp/story-probe/chase-probe-low.webp`.)

### `rooftop` — before level 3

References: `public/story/matthew-aurora.webp` (1, both likenesses),
`story-reference/confetti-cannon.png` (2), `story-reference/cake.png` (3),
`story-reference/cn-tower.png` (4).

> The two people in image 1, same faces, hair, crown and costumes, facing
> each other on a rooftop at night, a parapet between them. He holds up the
> confetti cannon from image 2 exactly: a chunky, short, wide-barrelled
> blaster in steel grey and blue with gold bands, a gold grip, and a grey
> bowl-shaped hopper on top, toy-like and clearly not a real gun. She holds
> the birthday cake from image 3 with candles lit, head tilted, unimpressed
> and amused. Toronto skyline with the CN Tower from image 4 and the full
> moon behind her. Three-quarter view with him nearer the camera, cannon
> fully visible. + guard block.

### `win` — after level 3, victory

References: `public/story/matthew-aurora.webp` (1, both likenesses),
`story-reference/cake.png` (2), `story-reference/confetti-cannon.png` (3).

> The two people in image 1, same faces, hair and costumes. On a rooftop at
> night under confetti falling everywhere in gold and purple. The man holds
> the birthday cake from image 2 with all its candles lit, grinning; the gold
> confetti cannon from image 3 is slung on his back, still smoking a little.
> The woman sits on the parapet behind him, arms crossed, smiling despite
> herself, her crown slightly askew. Toronto skyline and CN Tower behind.
> Warm, celebratory. + guard block.

### `loss` — after level 3, defeat

References: `aurora.webp` (1), `matthew.webp` (2), `cake.png` (3).

> The woman in image 1, same face, crown and purple-and-gold gown, leaping
> off a rooftop edge into the night with the birthday cake from image 3 held
> high, trailing a spiral of magenta magic, laughing back over her shoulder.
> In the near foreground, the gloved hand and arm of the man in image 2
> reaching after her, the cake just out of reach. Toronto skyline and moon
> beyond. Playful, not grim. + guard block.

### Depth layers (after a winner is chosen)

For each of `chase`, `win`, `loss`, two further low-quality edits of the
winning image, so composition is identical:

- **background**: "Remove every person and the cable/magic they carry. Fill in
  the street, buildings and sky behind them in the same style. No text."
- **characters**: "Keep only the people and what they hold. Transparent
  background." (`background: transparent`, `output_format: webp`)

## 5. Budget

Measured 7 Nov: a low-quality Sunburst edit with three references costs
about $0.045; with references downscaled, about $0.035. Spent so far: $0.07.

| Step | Calls | Est. cost |
| --- | --- | --- |
| Round 1: 2 candidates × 5 panels, low | 10 | $0.35 |
| Round 2: 1 revision × 5 panels, low | 5 | $0.18 |
| Depth layers: 2 × 3 panels, low | 6 | $0.21 |
| One medium render to measure the tier | 1 | ~$0.10 |
| Medium finals, only for what still fits under the cap | ≤1 | ≤$0.10 |
| **Total** | | **≤ $0.94** |

Five panels at $1 means the finals almost certainly ship at low quality,
which the 7 Nov probe suggests is fine at phone width. If a medium render is
visibly better, Auri can raise the cap for the remaining finals.

The generator writes every response's `usage` to `.local-tmp/story-art/ledger.json`
and refuses to run once cumulative spend reaches **$0.95**. If medium adds
nothing visible at phone width, finals are skipped and the low renders ship.

Review per round is one contact sheet per panel at `.local-tmp/story-art/<beat>/sheet.png`.
Auri picks the winner; Claude scores the checklist and flags likeness drift
but does not decide likeness.

## 6. Chrome, one system

Everything the player sees that is not a level, in one visual language: a
comic panel frame with an ink edge, the navy-and-gold family for Matthew's
states and purple-and-magenta for Aurora's, one button shape, one type stack.

| Screen | Now | After |
| --- | --- | --- |
| Loader | title, bar, "Loading…" | First panel of the issue: cover art dimmed behind the bar, "Issue #27" |
| Cover + name entry | letterboxed cover, plain field, text link to board | Same cover, field and Start in the panel frame, board link styled as a tab |
| Story panels | static image, caption strip, round Next | §3 above |
| Tutorial sheet | gradient strip, drawn gestures, "Let's go" | Same gestures in the panel frame, start button matching Next, chapter label as an issue header |
| Pause | "Paused" + default-styled button | Card in the panel frame, "Paused" as a caption, Resume as the primary button |
| Results + leaderboard | card, list | Final page of the issue, score stamped like a cover price, "Cake recovered" / "The cake remains at large"; leaderboard as the page behind it, headed "Hall of Heroes" |
| Rotate prompt | card | Same card in the frame |
| Transitions | black curtain | wipes and iris, §3 |

Type: a strong system stack unless Auri drops a `woff2` into `public/fonts/`.

## 7. Review routes

- `/?review=story` plays every panel in order with no levels between, with
  the real transitions.
- `/?review=chrome` walks loader → cover → tutorial → pause → results → board
  → rotate in order, one tap each.
- Both existing routes stay: `/?story=<id>` for one panel, `/?results=win|loss`.
- Each stage also leaves `tools/shots/story-pass/` with every screen at
  390×844 and 360×800, and a short headless recording of the motion.

## 8. Stages

| Stage | Output | Gate |
| --- | --- | --- |
| 1 | This document | Auri approves script and prompts |
| 2 | Story engine: camera, line reveal, layers, wipes, iris, `?review=story` | Auri taps through on a phone |
| 3 | Chrome screens, `?review=chrome` | Auri taps through on a phone |
| 4 | Images and layers in `assets/` → `public/story/`, ledger; swap in | Auri picks winners per round |
| 5 | Campaign seams, level 2 fade fix, full run captured, tests, commit | Auri plays the campaign |

Reordered on 7 Nov: the engine and chrome are built first against the
existing art (the chase panel uses the low-quality probe as a stand-in) so
the flow can be reviewed before any more of the budget is spent. New panels
that have no art yet point at the nearest existing image, marked as
placeholders in `src/story/script.ts`.

## 9. Open for Auri

1. Approve or edit the lines in §2.
2. Approve the prompts in §4, or add detail (any inside jokes go in §2).
3. Two panels at the level 1→2 seam: fine, or merge into one?
4. A font file, or system type.
5. Likeness: whoever Aurora is based on is fine with generated panels.
