# Level 3 — Aurora's Christmas birthday showdown

Status: the arena is the CN Tower's SkyPod. Levels 1 and 2 run toward the
tower; level 3 stands on it. A low confrontation camera sits below Aurora's
eyeline, she takes her height from a raised dais and hovers clear of it, and
the backdrop is open night with the tower shaft rising behind her and Toronto
far below under a cloud layer. Stage 4 combat is implemented locally and awaits
browser and real touch review before its visual gate can be signed off.

The branch started at `0081761`; `6d024f1` and `fccb2f0` were Codex's control
and first environment slices. Claude continued the arena and left an uncommitted
Stage 4 cue prototype; Codex continued that prototype on 6 November 2026 at
the user's request. The stream merged to `main` on 6 November 2026; the
isolated worktree it was built in is gone, and paths below are repository-relative.

Measured at 390x844: 98 draw calls, 60,360 triangles, Aurora 1.64x Matthew's
screen height. Software-rasterised in CI, so these are geometry counts and
framing, never a performance result.

Read `docs/COLLABORATION.md` for isolation and ownership before implementation.
This plan follows the user's build order. Current user decisions override older
design text; existing runtime manifests and code establish what actually exists.

## Direction

A birthday gala on a rooftop terrace: dry slate, velvet, gold, candles,
wrapped presents, balloon columns and a cake on Aurora's raised stage. Three
clear lanes face Aurora from a fixed camera behind Matthew. The setting provides
continuity from the city levels while making the final confrontation celebratory.
The user has accepted this rooftop-party setting.

Keep decorative presents outside the playable lane envelope. Reserve
distinct silhouettes and animation for collectible gifts so scenery cannot look
collectible. Cool night sky and restrained gold lighting frame purple/gold Aurora;
attack markings need a distinct shape and high contrast against all decorations.

Matthew dodges committed magic attacks, then fires confetti during Aurora's
exposed windows. Victory recovers the cake and starts the birthday celebration;
loss lets Aurora escape with it. The boss fight stays stationary: no automatic
forward run, jump, grapple, manual aim, ammo or reload controls.

## 1. Select and establish the verbs

- Horizontal swipe moves exactly one of three lanes; clamp at the edges.
- A short tap fires one auto-aimed confetti shot at Aurora from any lane.
- A swipe consumes its gesture and cannot also fire. Hold is inert; no autofire.
- Desktop equivalents: arrows/A/D for lanes, a short Space press for firing.
- Reuse the existing input recogniser and lane model read-only. Document that
  the existing lane model commits its logical lane immediately while the visual
  slide settles; collision must follow one explicit policy, not alternate between
  logical lane and mesh position. Start with its existing logical-lane policy
  and verify that the short slide looks fair at impact.
- Validate with a minimal practice strip, target and debug hit markers. This is
  a control harness, not the final environment or combat arena.

**Gate:** touch and keyboard feel predictable; swipe never shoots; edges clamp;
cancellation, secondary touches, pause and focus loss cannot fire stale input.
Check portrait framing early. Tune the verbs before choosing final lane spacing.

### Implemented control practice

Open `/level3.html` from the dev server. The page shows three
numbered lanes, a movable player marker, Aurora as a fixed aim target, animated
confetti shots, accepted-shot and target-hit counters, pause/resume and reset.
The practice target has no HP or attacks; hits measure aim and firing response.
It uses the shared input recogniser and lane tween without modifying either.
The playable logic and drawing live in separate Level 3 modules.

Run locally:

```sh
npm run dev
```

Visit `/level3.html` on the dev server. For repeatable local checks:

```sh
./node_modules/.bin/tsc --project tools/boss-tsconfig.json
TMPDIR="$PWD/.local-tmp" ./node_modules/.bin/vitest run tests/boss-practice.test.ts tests/input.test.ts tests/lanes.test.ts
node tools/boss-build.mjs
TMPDIR="$PWD/.local-tmp" node tools/boss-review.mjs
```

The isolated typecheck passed. All 32 focused tests passed; the standalone page
built (10.48 kB JS before gzip). The browser review script covers movement,
edge clamp, short Space firing, arrival, pause/resume and three viewports, but
could not run in this session: local server bind returned EPERM and Chromium's
Mach port setup was denied. Real touch/feel and visual framing remain the open
part of this gate. The full project typecheck still reports unchanged Level 2
baseline diagnostics; Level 3's isolated typecheck passed.

## 2. Select all assets before building the environment

The Level 3-only source catalog is `src/assets/boss/catalog.json`; the typed actor,
clip and procedural-role catalog is `src/assets/boss/catalog.ts`. Exact paths and
provisional heights live there. The source pack's own `contents.png` and
`sample_A.png` were inspected for art direction, and source model dimensions,
triangles and exported bytes were measured. No new licence is needed: the pinned
Holiday Bits and Adventurers packs are CC0 in the repo.

| Role | Selection | Measured source/export | Proposed use |
| --- | --- | --- | --- |
| Matthew | Recoloured unhooded KayKit `Rogue` with Level 2's custom curls | 6,420 triangles; 468 KB GLB | Same generated model hash as Level 2 commit `4b5d989`; cape hidden |
| Aurora | Recoloured KayKit `Mage` | 6,668 triangles; 369 KB GLB | 4.15-unit visual boss on raised stage; hide hat, use existing crown |
| Gun | Holiday Bits `snowball_cannon` | 1,354 triangles; 68 KB export | Level 2 already mounts it on `handslot.r` with 0.5 scale and rotation `(-π/2, 0, π)` |
| Main tree | `christmas_tree_decorated` | 13,236 triangles; 552 KB | One lit landmark at arena edge, 3.1-unit height |
| Repeat tree | `christmas_tree_withoutLights` | 6,886 triangles; 288 KB | At most one second tree, 2.6-unit height |
| Scored gift | `present_A_blue` | 678 triangles; 46 KB | Plain blue collectible for now; cross-level treatment pending |
| Scenery presents | `present_C_red`, `present_D_green` | 678 triangles each; 46 KB each | Off-lane decoration only |
| Side lights | `lantern_decorated` | 1,451 triangles; 69 KB | Two warm fixtures outside playfield |
| Backdrop accent | `wreath` | 2,454 triangles; 112 KB | Behind Aurora; keep attack cues distinct |
| Stage accent | `bell_decorated` | 1,416 triangles; 64 KB | One bell on the boss backdrop |
| Skyline flanks | KayKit City Builder buildings A/C/G without base | 435 / 666 / 1,053 triangles; 49 / 63 / 88 KB exports | Four subdued detailed towers behind the gala arch |

The cake and crown reuse existing procedural builders in `src/render/custom.ts`.
Bunting, balloons, roof trim, magical shield, lane strike, orb and confetti
are Level 3 procedural roles: the pack contains no birthday cake or balloon,
and a physical shield/wand would obscure the reference's open-handed magic.
Confetti remains decorative; a shot owns damage. Reuse distant city silhouettes
only after the environment camera establishes visibility and budget.

The snowball cannon has a carriage/wheels in the pack's sample image, but Level
2 already attaches it to Matthew's right hand as the grapple launcher. Level 3
reuses that model and the committed mount from `src/assets/manifest.ts`, including
the muzzle point `(0.08, 0.11, 0.78)` for the shot origin. The Level 3 viewer
shows the standalone model; the first arena review must also inspect it held by
Matthew from the game camera. The previous hooded Matthew choice was wrong and
has been removed from the Level 3 catalog.

The previous gingerbread house pick had a white winter roof and is removed to
keep the setting snow-free. The twelve selected prop exports total about
**1,491 KB on disk**. The two actors add 837 KB;
two stripped animation libraries add about 569 KB. These are file sizes, not
compressed transfer or decoded GPU memory. Each prop GLB embeds an atlas, so
repeated textures are a transfer-cost risk to measure when the scene is built.
One decorated tree alone is 13,236 triangles; instance counts must stay bounded.

Build the selected GLBs with `node tools/boss-assets.mjs`.
It shares the Level 2 recolour tool, from stable commit
`4b5d989`; it produces the same `matthew.glb` hash as that checkout. The builder
reuses the animation-strip tool, converts the nine curated Holiday props to
`public/models/level3/`, and copies only selected transparent particle sprites
as 256px runtime textures. Generated outputs are ignored; source catalogs,
selected source sprites and builder are tracked. The new Kenney Particle Pack
1.1 is CC0 and its license is retained in `assets/level3-particles/`.

Particle picks: `magic_01` for Aurora's backdrop sigil, `magic_03` for charged
spellcraft, `circle_03` for the shield's block flash, `muzzle_02` for the cannon,
`star_06` reserved for possible cross-level gift treatment, and `smoke_03` for
spell dissipate. The six scaled
runtime textures total about 192 KB on disk. Tint the grayscale sprites to the
role colour; keep the lane warning a solid geometric shape and confetti as
coloured paper, so neither depends on a soft particle image for readability.
Pool and cap sprites. The source pack's full 15 MB is not copied into runtime.

Open `/boss-assets.html` from the dev
server. The model viewer lets us rotate both actors, the selected props, and
the **existing procedural cake and crown** at proposed sizes. Its TypeScript
check and Vite compilation passed here; this session
could not launch a browser because Chromium's Mach port setup was denied.

The runtime manifest currently uses substitute free-tier clips: Matthew's shot
uses `Throw`, Aurora's raise uses `Use_Item`, and her cast uses `Throw`. Preferred
ranged/spellcast clips in the old design are not available in those free libraries.
Inspect substitutions before authoring combat cues; do not promise missing clips.
The current manifest also hides the Mage hat in favour of a crown.

Source packs arrive in Git, generated GLBs do not. Build reproducible exports
under `public/models/level3/` with a Level 3 builder; preserve original packs and
Claude's shared pipeline. Check actual exported assets rather than stale comments.

**Gate:** every environment and actor role now has a selected source or
procedural specification, and source/output costs are measured. Visual review
of the gun attachment, Aurora's crown/pose, exact scales and portrait framing
remains before claiming the selection gate is fully closed. The free-tier clip
substitutions have been verified to exist in the generated libraries.

## 3. Build the environment

### Implemented environment review

`/level3.html` renders the SkyPod arena behind the working swipe/tap practice.
`src/levels/boss/layout.ts` owns lane centres and the player, boss and cake
anchors. `camera.ts` holds the fixed low camera. `tower.ts` builds the pod
deck, parapet, shaft, upper pod and spire. `environment.ts` builds the terrace,
dais, gala arch, candle stands, balloons, cake display and the distant city.
`sky.ts` provides the gradient, the high cloud band and the low band that lies
over the city. `magic.ts` animates Aurora's halo, glyphs, motes and cake
tether. `actors.ts` loads both characters, the right-hand cannon and her
floating crown.

Findings that constrain any further work on this frame:

- **You cannot see "down" from this camera.** The deck occludes everything
  steeper than about 10 degrees below horizontal at the frame edge, so the
  only visible air is between screen y 437 and y 549 in the outer slivers —
  13% of frame height. Narrowing the terrace to a half-width of 3.8 buys 38
  pixels. Altitude is therefore carried by what sits *in* that band: the city
  near the horizon, the cloud layer over it, and the tower itself.
- **Camera eye height is the lever for the gap between the two actors.**
  Matthew reads below the eye line and Aurora's feet above it, so raising the
  lens pushes them apart. Pitching up moves both down together and changes
  the gap by about 1%.
- **Perspective eats height ratios.** The lens is roughly twice as far from
  Aurora as from Matthew, so her 3x world-height advantage reads as 1.64x on
  screen. Moving either actor trades directly against that ratio.
- **The backdrop is painter-ordered, not depth-sorted.** The sky plane sits
  nearer than the skyline yet must appear behind it, and nothing in it writes
  depth. Anything added to that stack has to be reasoned about in draw order.

Review the render at `/level3.html`; `?debug` prints draw
and triangle counts, and exposes the scene graph on `window.level3` so capture
tooling can measure real bounds instead of assumed coordinates. Shoot the
viewport matrix with `node tools/boss-capture.mjs --query debug`.

Colour discipline is done. Magenta now appears only where it means something
— Aurora herself, her magic, and the tower's neon — and the signal colours are
out of the decor: lane dividers are warm stone, fallen paper is gold and cream
and sits on the shoulders rather than across the corridor, and the gifts are
plum and gold.

An earlier Level 1 treatment used gold sparkles, which is not what
`src/render/palette.ts` says in its header. `src/render/entities.ts` records
the later decision: the collectible was blue on a navy world and read as
camouflage, so level 1's gift sparkle became gold. Level 3 now uses the plain
blue gift at the user's request; one cross-level collectible treatment will be
chosen after Levels 1 and 2 settle. Static gold dressing stays without shimmer.

The scenery gifts are procedural. The Holiday Bits presents are Christmas red
and green and cannot be tinted out of it: their colour is in a texture atlas
and a material tint multiplies, so red only becomes darker red. It also keeps
the pack's blue present unique to the scored collectible.

Still open for the next stage: the telegraph vocabulary — lane warning and
impact states, Aurora's shield, her strike shape, the magic orb — plus the
cake's recovery and escape poses.

### Spatial contract

Create one Level 3 layout config for three lane centres, playable width, player
anchor, Aurora anchor, cake pedestal, stage, and allowed decoration zones.
The practice scene's 2.2-unit lane spacing is the current starting value:
lane centres at `x = -2.2, 0, +2.2`. Reserve roughly `x = -3.3…+3.3` as the
playable corridor and place decorative props beyond a small visual buffer. The
boss stage sits across the far end of this corridor. Keep the shot travel and
magic approach area between Matthew and the stage visually open.

The simulation owns these positions and collision widths. The renderer reads
them to draw lane floor inlays and attack shapes. A tree, lantern or cake mesh
cannot redefine a lane or contact box. Decoration belongs to a separate set
of allowed positions, so new props can be added without silently blocking play.

The review camera stays fixed behind Matthew at (0, 5.5, 13), pitched toward
Aurora. Matthew occupies the lower half; Aurora and the cake sit above him;
the middle remains clear for incoming magic and confetti travel.
The initial view should show all three lane centres, his full silhouette and
held cannon, the full boss silhouette, the cake, and an entire lane warning on
a narrow portrait viewport. The base field of view is 60° on a wide portrait
phone and increases on taller phones to preserve horizontal lane room. Camera
coordinates are not a gameplay input. Avoid camera follow or strong shake,
which would make lane reading and swipe decisions less stable. Use a short,
bounded reaction only after the base view is approved.

Reserve the top safe area for both HP displays and pause, and the bottom edge
for the player's thumb and any brief control prompt. Place no critical target,
warning or cake detail behind either overlay. Desktop uses the same portrait
frame rather than a wider combat view. Only after this frame is measured should
we lock actor and prop visual heights.
Level 2's world-unit hero height is 2.385; Level 3 currently uses 1.55 for
Matthew and 4.15 for Aurora as visual presentation sizes.
These are different world scales, so a seamless transition must compare their
screen-space size rather than assuming equal numerical heights.

### Scene layers and owners

| Layer | Build | Rule |
| --- | --- | --- |
| Far | Gradient night sky, moon, high clouds, Toronto silhouettes and prominent CN Tower | Lower contrast than Aurora and warnings |
| Middle | Gold gala arch, velvet folds, parapet, real City Builder flanks, low clouds and lit windows | Fixed geometry; preserve a clear horizon behind the boss |
| Play deck | Three subtly distinct slate floor panels and a visible stage boundary | Flat enough for colored attack marks to read; no scenery in colliders |
| Boss stage | Aurora, oversized cake display, candelabras and magical halo | Cake visible through the fight and movable for both endings |
| Side dressing | Muted balloon clusters, rooftop banners, lanterns and grouped presents | Outside playable width; frame as landmarks, not repeated clutter |
| Atmosphere | Cake tether, Aurora halo, glyphs and charged motes | Confined to boss stage; never hide a warning or collectible |

The dry rooftop, oval dais, gold arch, velvet drapes, side banners, muted
balloons and floating cake display are now built. The shared cake and crown remain in
`src/render/custom.ts`; Level 3 adds a platter, piped cream and berries around
the cake without editing the shared builder. Game area assets still needed:
lane warning and impact states, Aurora's shield and strike shape, a magic orb,
and brief cake recovery/escape poses.

Keep this in Level 3 paths: `src/levels/boss/config.ts` for coordinates and
combat timing; `src/render/boss/scene.ts` to compose the view;
`src/render/boss/arena.ts` for floor and stage; `environment.ts` for skyline,
roof and dressing; `actors.ts` for Matthew/Aurora and held cannon;
`magic.ts` for ambient spellcraft; `sky.ts` for sky/clouds;
`effects.ts` for bounded attack particles/cues; `camera.ts` for framing.
The static environment is built once. Each frame updates only actors, the
active cues, projectiles, cake state and particles. Level 2 rendering stays
untouched. The asset builder stays Level 3-owned except for consuming the exact
stable recolour-tool update already committed on `main`.

Build in review slices: **(1)** camera and bare rooftop with real actors/cannon/
cake, **(2)** skyline and Christmas/birthday dressing, **(3)** safe-area and
performance check, then **(4)** attach game elements. Put the scene behind the
existing `/level3.html` URL for the user's visual inspection after each slice.
Record narrow, standard and tall portrait captures. Treat early camera/layout
review as a structural gate, not final polish.

**Gate:** the rooftop reads immediately as Christmas and birthday; the actors,
cake, all lanes and attack display area fit; side props do not intrude; selected
asset load URLs work; the scene leaves measurable triangle/draw headroom for
Aurora's attacks and confetti. Aim below the project's 150k-triangle / 100-draw
initial ceiling and refine the Level 3 slice budget from measured worst-case
devices.

## 4. Build the game area and interactive elements

Build in separate stable slices, each with simulation checks and visible review:

1. **Arena and practice:** connect lane input, confetti shots, health displays,
   cooldown and protected tutorial. Practice cannot permanently damage either actor.
2. **One full attack loop:** shielded warning → lane strike → recovery/exposed
   window → shield restored. Committed target and timing drive both simulation
   and telegraph. Every lane can auto-aim at Aurora.
3. **Magic projectile:** slow visible orb with a committed path and a reachable
   escape lane. Use deterministic stepping/swept contact where appropriate so
   frame rate cannot let a projectile skip contact.
4. **Fight progression:** alternate the established attacks; modest cadence
   increase at 50% HP; introduce four once-only optional gifts between beats.
   Gifts are neither healing nor a requirement to win and expire when missed.
5. **Outcomes and lifecycle:** victory/loss, local score, pause/focus loss,
   restart, disposal and consistent simultaneous-hit handling.

Starting values inherit the existing design and scoring contract:

| Rule | Starting value |
| --- | --- |
| Matthew / Aurora HP | 5 / 100 |
| Player hit | Lose 1 heart; about 1 second protection |
| Confetti hit | 5 damage |
| Shot cooldown | 300 ms; early taps ignored |
| Boss cycle / exposed window | About 8 seconds / 3 seconds; tune after playable review |
| Warning floor | Start at least 1.2 seconds; extend if lane reachability requires it |
| Scoring | Four gifts × 100 + actual boss HP removed × 5 + victory 200 |
| Maximum | Level 3: 1,100; campaign: 2,300 |

Shield hits give visible blocked feedback and no damage/points. Resolve shield
status at projectile impact, with that timing made readable. Resolve player
projectile damage first within a simulation tick; if it defeats Aurora, stop the
tick's remaining damage and award victory. Otherwise resolve attacks on Matthew.
Clamp credited damage to remaining boss HP. Outcome immediately stops further
collision/scoring, disables gameplay input and clears active projectiles.

Keep patterns, lane geometry and attack durations in plain data. The simulation
owns HP, projectiles, cooldowns, resolved IDs and phase; the renderer reads it.
Animation endings must never open shields or apply damage. Intro, playing,
victory and defeat are explicit states; pause freezes simulation time.

**Gate:** a full fight can end both ways; every pattern has a reachable safe
response from every permitted entry state; warnings match actual contact; no
late retargeting, duplicate gift credit, shield damage, overkill points or events
after outcome. Replay restores state and does not accumulate listeners/resources.
Debug/standalone attempts never submit campaign scores.

### Stage 4 implementation and handoff, 6 November 2026

The standalone `/level3.html` now opens in a protected practice state. Swipes
and shots work there without health or scoring. **Begin fight** resets the
practice counters, commits the first lane strike and starts local combat. Aurora
alternates a 1.35-second warned lane strike and a 2.1-second lane-committed orb;
each attack opens a 3-second shield-down window. Her cadence tightens modestly
below 50 HP. A shot resolves after its 0.38-second flight, checking the shield
at arrival. Shielded shots visibly block and score zero. A hit to Matthew costs
one heart and starts one second of protection. The logical lane selected by a
swipe is the collision lane throughout the visual slide.

Four optional gifts enter on fixed lanes at 0, 4, 8 and 12 seconds; each crosses
Matthew's line after two seconds and awards 100 points only if he occupies its
committed lane then. They cannot heal or score twice. Victory and defeat stop
gameplay collisions and scoring, clear projectiles, and animate the cake toward
Matthew or away with Aurora. The result panel appears after that motion so it
does not cover the ending. Restart returns to practice and clears renderer
effect IDs as well as simulation state. The run is local-only and never calls
campaign submission. `?debug` retains the cue review keys 1–9 while in
practice; normal play does not expose them.

Evidence: the isolated Level 3 typecheck and standalone Vite build pass. All
27 `tests/boss-*.test.ts` checks pass, including both outcomes, shielded and
exposed shots, committed targets, once-only gifts, replay, valid score events,
and an ideal run reaching the 1,100-point Level 3 maximum. The full project
typecheck still reports the 13 unchanged Level 2 baseline diagnostics logged
in `docs/COLLABORATION.md`; no Level 2 path was edited.

Automated visual review now works inside the sandbox. `tools/boss-browser.mjs`
routes the standalone build into Playwright without opening a local socket and
launches Chromium with the required single-process flags. `tools/boss-review.mjs`
passes at 375×667, 390×844 and 1280×800; `tools/boss-capture.mjs` captures the
five-viewport matrix without console or asset errors. Software-rendered draw
counts and images are visual evidence, not phone performance. Real touch,
several live fight restarts and target-phone performance remain open.

### Stage 4 visual refinement awaiting user review, 6 November 2026

After visual review, the blue-white faceted shield was replaced with the
earlier purple bubble. Its torus stays horizontal and now follows the bubble's
surface below Aurora's face; a filled lilac shield emblem sits over her torso.
The horizontal torus and its hit ripple use two side arcs with a central gap
matched to the emblem width, so neither crosses the emblem.
Blocked shots brighten the bubble, torus and emblem together, with a brief
larger glow behind the emblem. The cue capture holds an active blocked snapshot
so Playwright cannot miss the 0.34-second flash during WebGL readback.
The bubble disappears on the exact simulation frame she becomes exposed and
remains hidden during either cake ending. The plain blue gift has no sparkle or
floor marker. Its pickup and score timing remain two seconds; the debug cue
previously used six seconds and now matches live play. The gift begins farther
up the lane, descends as it travels, and uses the lane centre for its world x
coordinate. Its final appearance waits for the cross-level gift design. The
cake's three tori sit 0.14, 0.34 and 0.54 units below it, use 0.055-unit tubes
and lower opacity. They remain independent and release the cake during recovery.

The orb now launches from Aurora's torso and creates one 0.42-second expanding
ring and spark burst at Matthew's torso when its committed lane hits him. The
simulation supplies the once-only collision event; the renderer uses pooled
meshes and cannot determine damage. Confetti shots and their arrival burst now
target Aurora's torso. Practice shots show the burst; live shielded shots use
the shield block flash, and exposed shots show the torso burst.

Current 390×844 captures in `tools/shots/boss/` include `cue-shield-up.png`,
`cue-orb.png`, `cue-orb-impact.png`, `cue-confetti-impact.png`,
`cue-gift-early.png`, `cue-gift-late.png`, and `cue-cake-recovered.png`.
The orb-impact capture waits for its active simulation event, so software
rendering speed cannot miss the brief effect. These captures loaded without
browser errors. Shield up recorded 90 draws and 58,806 triangles; orb impact
recorded 92 draws and 59,718 triangles; gift travel recorded 91 draws and
59,484 triangles. The earlier worst-case cue frame predates these changes, so a
current worst-case capture remains for later review. The latest idle shield
passed captures at 360×800, 375×667, 390×844, 430×932 and 1280×800 without
layout overflow or browser errors.
Stop here for the user's visual review before game-logic, scoring, collision
and HUD planning.

### Ending animation review, 6 November 2026

At the user's request, ending choreography is the next visual review slice.
Victory runs for four seconds: Aurora recoils, the cake moves down beside
Matthew and reduces to a foreground presentation size, Matthew turns toward
the camera and plays his short jump, and a bounded shower of confetti rises
from both sides. Defeat runs for 3.4 seconds: Matthew reacts to the hit, then
Aurora, her magic and the cake travel together up and away. Both use the same
simulation-owned cake phase/progress in debug previews and live outcomes.
Result panels wait until the ending timeline completes. Reset restores poses,
actor positions, cake size and magic. The camera stays in its arena position.

Review with debug keys 7 (win), 8 (loss), and 9 (clear before replay).
`tools/boss-endings.mjs` captures live videos and three deterministic frames
for each ending under `tools/shots/boss/endings/`. The isolated typecheck,
standalone build and 27 boss tests pass; both previews load without application
or missing-clip warnings. The software renderer's ReadPixels warning is excluded
from capture errors because taking a screenshot causes that GPU stall.

Confirmed for the later logic slice: Aurora should take seven successful hits,
Matthew five hits, and landing hits early must not cost gift opportunities.
These combat/scoring changes and the fight sequence are deferred until the user
reviews the ending animations. Current combat values remain the prior prototype.

### Stage 4 balance and fight sequence, 6 November 2026 (Claude)

The combat plumbing was already correct; the fight was not. Measured on the
prior prototype by driving `BossRunner` directly:

- **It was eleven and a half seconds long.** A 3-second exposed window against
  a 300 ms cooldown is ten landed shots — 50 damage — so Aurora's 100 HP cost
  two windows. The whole finale was two attack beats and three swipes.
- **Playing well cost points.** Gifts ran on a wall clock at 0, 4, 8 and 12
  seconds, and efficient damage killed her at 11.48 s, so the fourth gift never
  spawned. Good play capped at 900–1,000 and the advertised 1,100 maximum was
  only reachable by deliberately withholding shots. This is the "landing hits
  early must not cost gift opportunities" item recorded on 6 November.
- **There was no decision in it.** Every attack committed to Matthew's current
  lane and never re-committed, so the answer was always "swipe once, either
  direction, immediately". Strike and orb were mechanically identical.
- **Doing nothing survived longer than playing well** — 28 s against 11.5 s.

#### What changed

Aurora's 100 HP and the 5 damage per confetti hit are fixed by the shared
scoring contract, so the exposed window is the only lever on fight length.

1. **`exposedSeconds` 3 → 1.5.** Four landed shots per window for a player who
   fires on the shield drop, so she now costs about five windows.
2. **New `src/levels/boss/patterns.ts`,** the data layer
   `docs/COLLABORATION.md` specifies and the branch was missing. Phases, beats
   and attack sequences are declarative; `runner.ts` owns every clock.
3. **A beat is now a sequence of attacks,** run strictly back to back, so two
   commitments are never live at once. Three phases, re-read at every beat:
   `opening` above 60 HP (one attack), `pressure` above 30 (two per beat),
   `finale` below (two per beat, 1 s gap). This replaces the old
   `lateCadence`, which only shortened the gap by 0.27 s and at two cycles
   almost never fired.
4. **New double strike.** Two lanes marked, exactly one safe. `patterns.ts`
   guarantees the safe lane is never Matthew's own and never more than one
   swipe away, so standing still is never correct and the answer is always
   reachable. This is the pattern that turns "move" into "move *there*".
5. **The orb commits late.** It leaves her with no lane, sweeps the deck for
   `ORB_LOCK_SECONDS` (0.8 s), then locks onto Matthew's lane with 1.3 s left
   to run — above the 1.2 s reaction floor, asserted in tests. Its flight is
   the warning, so it is no longer a reskinned strike. `commit` throws on a
   second call, so late *re*targeting stays structurally impossible, and the
   floor marker appears only once a lane exists to claim.
6. **Gifts are anchored to her exposed windows, not to a wall clock** — one
   each on the first four. Even a frame-perfect six-hit window takes four
   windows to remove 100 HP, so all four gifts appear in every winning run and
   1,100 is a reward for playing well rather than for stalling.
7. **Gifts are credited on contact,** the first tick Matthew's lane matches,
   rather than by comparing lanes once at expiry. Previously standing on one
   for 1.9 s earned nothing while arriving at 1.99 s earned 100. A gift is also
   never spawned in Matthew's own lane, so each one costs a deliberate move.

#### Measured after the change

Driving the simulation at 60 Hz with three firing profiles; every run collects
all four gifts when it chases them, and 20 landed hits with no overkill:

| Play | Outcome | Time | Windows | Dodges | Score with gifts |
| --- | --- | --- | --- | --- | --- |
| Expert, pre-fires into the opening | victory | 22.9 s | 4 | 6 | 1,100 |
| Competent, 0.12 s reaction | victory | 27.8 s | 5 | 7 | 1,100 |
| Sloppy, 0.35 s reaction | victory | 39.4 s | 7 | 10 | 1,100 |
| Never moves, never fires | defeat | 22.0 s | — | 0 | 0 |

Losing is now faster than winning badly, which was the wrong way round before.

#### Evidence

`npx tsc --noEmit` reports only the 13 unchanged Level 2 baseline diagnostics
logged in `docs/COLLABORATION.md`; no Level 2 path was edited. All 38
`tests/boss-*.test.ts` checks pass. New invariants under test: a safe lane
exists one swipe away on every tick an attack is live, across a whole fight and
all three phases; the double strike's reachability at every entry state; the
orb's single late commitment and its frame-rate-independent swing; gift credit
on contact; exactly four gifts however long the fight runs; and the window
count and duration, so a timing change cannot quietly restore the
sixteen-second fight. The 14 failing tests in the full suite are all `ENOENT`
on generated GLBs under `public/models/`, which is gitignored and must be built
before the suite can read them; they touch no Level 3 path.

Not done: browser and real-touch review of the new patterns, and target-phone
performance. Still open: the recorded "Aurora should take seven successful
hits" decision — see below.

#### Resolved: seven hits is superseded

The 6 November ending-animation review recorded "Aurora should take seven
successful hits". The user resolved this on 6 November in favour of the
current build: **twenty hits stands, and the balance pass overrides the
earlier note.** Her 100 HP at 5 damage a shot therefore stays as the shared
scoring contract defines it, `RULES.confettiDamage` is unchanged at 5, and no
further change to `src/core/scoring.ts` is needed for this.

### Hearts, trigger discipline and the combat HUD, 6 November 2026 (Claude)

Two gaps closed from the balance review: being hit cost nothing but survival,
and a blocked shot cost nothing at all, so mashing the fire button was strictly
optimal and pre-firing into the opening was the best strategy.

**Hearts now cost points.** Every hit emits `{ t: 'incident', level: 3 }` and
takes -50, the same currency as a level 1 or 2 incident, clamped at zero
exactly as `scoreRun` clamps so the local score and the Worker's recompute
cannot drift. A double strike still costs one heart and one incident, because
the existing invulnerability guard resolves both marked lanes as a single hit.
This needed `RunEvent`'s incident member widened from `level: 1 | 2` to
`level: Level` in the shared contract; logged as a handoff in
`docs/COLLABORATION.md`, type-only, with levels 1 and 2 scoring unchanged.

The 1,100 maximum now means **won, flawless, all four gifts**.

**A blocked shot jams the cannon** for `blockedLockoutSeconds` (0.75). A block
is only known when the shot arrives, 380 ms after firing, by which point the
ordinary 300 ms cooldown has already elapsed — so the lockout is applied at
the arrival, landing at the same instant as the visible block. Firing when the
shield actually drops is never punished.

Measured effect, dodging perfectly and chasing all four gifts:

| Play | Before the jam | After |
| --- | --- | --- |
| Expert, pre-fires into the opening | 4 windows, 22.9 s | 7 windows, 39.0 s |
| Competent, fires on the shield drop | 5 windows, 27.8 s | 5 windows, 27.8 s |
| Button masher, fires whenever ready | — | 7 windows, 39.0 s |

Trigger discipline is now the fastest route and mashing the slowest, which is
the opposite of the previous incentive. The disciplined profile is untouched.

**The HUD follows the fighters.** Each combatant's state sits at the end of the
frame that combatant occupies, so there is no mapping to learn: Aurora's health
is a bar across the top under her, Matthew's hearts and his cannon are along
the bottom under him. Nothing crosses the three lanes in the middle, where the
read actually happens. The old 2x2 pill grid is gone; `Lane` and the draw and
triangle counters moved behind `?debug`, and the instructional footer hides
once a fight starts so the player strip takes that space rather than sharing it.

- Hearts are drawn as inline SVG rather than the `♥` glyph, which renders as a
  colour emoji on some platforms and would ignore the lost-heart styling.
- The cannon has two readouts that cannot disagree, both reading the same
  `gun` cue: a precise bar in the strip, and a charge light on the muzzle
  placed from the cannon's own bounds so re-exporting the asset cannot strand
  it. A jam is a different colour and barely lit — a fault, not a slow reload
  — which is how the blocked-shot rule gets learned without being told.
- A hit reuses the level 1 and 2 penalty language: a floating `-50` and an edge
  vignette pulse. Level 3 carries its own elements for now; unifying them with
  `src/ui/hud.ts`, which binds fixed element IDs, is an integration job.

**Evidence.** Full typecheck shows only the 13 known Level 2 baseline
diagnostics. 42 boss tests pass, plus `scoring`, `runner` and `skyline`
unchanged. New tests cover the jam (and that a landed shot never jams), one
incident per hit including across a double strike, the score floor at zero, and
local score equalling `scoreRun` on every tick of a full fight. Standalone
build clean; `boss-review.mjs` passes at 375x667, 390x844 and 1280x800 with no
console or asset errors. `tools/boss-hud.mjs` drives a real fight and
photographs practice, jammed, hit-penalty and exposed states at two portrait
widths under `tools/shots/boss/hud/`; no horizontal overflow at 360 px.

Still open: real touch review and target-phone performance.

### HUD colour discipline, 6 November 2026 (Claude)

The HUD hand-picked its hexes, and they had drifted from the palette the
characters are actually built from. Matthew's hearts were `#ff6f8e` pink — a
colour from Aurora's magenta family — so his life bar wore his opponent's
identity, and his cannon was gold-on-gold with her trim.

`src/level3.css` now opens with custom properties mirroring
`src/render/palette.ts` by name, so a bar and the character it describes are
the same number and a palette change has one place to follow. Four roles, and
nothing borrows across them:

| Role | Colour | Used for |
| --- | --- | --- |
| Aurora | `purpleDeep` `#5c175c` → `magenta` `#cc29c3` | Her health bar only |
| Matthew | `gold` `#eaac5b`, `navy`/`blue` `#234ca8` | Hearts and cannon only |
| Exposed | `#9df6d4` | Her shield being down. The one "act now" colour |
| Fault | `#ff6a52` | Damage and jams. Nothing else |

`palette.ts` settles the ownership question directly: gold is documented as
"all trim... **gold is his**", and magenta as "every hazard and all of Aurora's
magic". `blueLight` was considered for the ready state and rejected — the
palette reserves it as the collectible "take it" signal, so the cannon lights
up to Matthew's gold and charges through his suit blue instead.

A spent heart hollows to an outline rather than dimming to a fill: a
low-contrast filled shape is hard to count at a glance, an outline is not.

Also in this pass: the muzzle glow is removed — the cooldown bar carries the
charging and jammed reads on its own, so the 3D light was redundant, and
`actors.update` no longer takes a `gun` argument. The `gun` cue itself stays,
since the HUD reads it. Aurora's bar moved down 20 px with the beat line and
message following so nothing collides.

Evidence: `tools/boss-hud.mjs` recaptured all four fight states at 360x800 and
390x844 with no console or asset errors and no horizontal overflow.

### Polish pass: motion, reactions and the gift rule, 6 November 2026 (Claude)

Six items from review. Five are presentation; the gift change is a rule.

**Gifts fall and settle before they can be taken.** Previously a gift was
collectible for its whole life while the renderer flew the model from Aurora's
end of the deck down to Matthew's line, so entering the lane scored instantly
and the still-travelling present read as being dragged towards him. A
`falling` phase now precedes `idle`: `giftFallSeconds` (0.7) of descent that
is **not** collectible, then it settles just ahead of his line and the 2-second
collectible window begins. Rule and picture share one clock, so "it lands
there, step across to take it" is what actually happens — and standing in the
lane during the descent becomes a read of where it will land rather than a
pickup. It is collectible from the very tick it settles: the falling branch
falls through rather than returning, so there is no dead frame where it looks
ready and does nothing.

Re-measured after the change — all four gifts still spawn and are still
collectible in every winning run, and nothing else moved:

| Play | Outcome | Time | Windows | Gifts | Score |
| --- | --- | --- | --- | --- | --- |
| Expert, pre-fires | victory | 39.0 s | 7 | 4 | 1,100 |
| Competent, 0.12 s reaction | victory | 27.8 s | 5 | 4 | 1,100 |
| Sloppy, 0.35 s reaction | victory | 39.4 s | 7 | 4 | 1,100 |

**Aurora performs her attacks.** She stood still for entire fights because
`actors.update` only ever received the cake phase. It now takes the whole cue
set and drives her from attack IDs: a new strike plays `raise` (`Use_Item`), a
new orb plays `cast` (`Throw`), and she returns to idle when the clip clamps.
On top of the clips she winds back through the warning and drives forward on
contact, taken from the cue's own progress so the lunge and the floor marker
cannot drift apart. Strictly reactive: a clip ending still opens no shield and
deals no damage. These are free-tier substitutes of unknown length, so they
start at the phase boundary and clamp — syncing a clip's apex to contact would
need a playback-rate control the shared `Actor` API does not expose, and Level
2 uses that API too.

**Hit reactions, split by how often each character is hit.** Matthew takes at
most five, so he plays the real `Hit_A` clip, and it outranks his firing pose
so a shot cannot cut the reaction short. Aurora takes twenty; retriggering a
clip every few hundred milliseconds through an exposed window would never let
it finish and would read as continuous flailing, so she gets a short
procedural recoil instead and the clip is saved for the ending. Both are
driven by new monotonic `playerHitId` / `bossHitId` counters on `BossCues`,
the same once-only pattern `OrbImpact` already uses.

**Matthew's lane change is visible.** It was always tweened, but at the shared
140 ms default with a 5-degree bank it read as a snap. `LaneRunner`'s
constructor already accepted a settle duration, so Level 3 passes 220 ms
without touching shared `lanes.ts`; the bank goes to ~15 degrees, with a yaw
into the direction of travel and a small hop. All three come off `lean`, which
is zero at rest and peaks mid-slide, so they settle exactly when the lane does.
The logical lane still commits instantly and collisions still read it — this
only widens the gap between where he looks and where he is, and 220 ms against
the 1.2 s warning floor cannot make a dodge unfair, which is why it stops there.

**The victory shower fills the screen.** It was 80 pieces from two fixed points
at the edges. It is now 220 falling across the full visible width for the whole
ending, recycling so it is continuous rather than one wave. Still one
`InstancedMesh` and one draw call. Two things keep it honest: the spread comes
from the camera's real frustum width at the shower's depth, recomputed on
resize, so "full width" holds at 360 px and on desktop rather than only where
it was tuned; and every piece is seeded from its index and placed from
`cake.progress` alone, never a wall clock, so it is pause-safe, identical on
replay, and reproducible in headless capture.

Evidence: 66 tests pass including the rewritten gift tests, which now assert
that entering the lane mid-descent scores nothing and that contact credits from
the settle tick. Typecheck clean apart from the 13 known Level 2 baseline
diagnostics. `tools/boss-hud.mjs` gained falling, settled and orb-locked
frames; `tools/boss-endings.mjs` re-captured the shower. 75 draws / 56,750
triangles during the victory ending, so the larger shower costs one draw call.

## 5. Polish only after the layers are stable

Tune lane lean, gun pose/recoil, muzzle pop, confetti arcs, spell anticipation,
shield feedback, hit reactions, HP transitions, gift feedback and cake endings.
Add restrained lighting/atmosphere and reduced-motion alternatives. Keep combat
cues readable beneath thumbs and without relying on colour alone.

Use the existing project's device viewport matrix; verify real touch separately.
Measure worst-case actors plus magic plus confetti, not just the empty terrace.
Pool effects and limit particles. Start with the established pixel-ratio cap of
1.5; set the Level 3 geometry/draw budget from measured headroom rather than
copying a historical Level 2 number. Record performance on an actual target phone.

**Gate:** readable fight, satisfying controls, both endings, stable repeated runs,
no console/asset errors, acceptable weakest-device performance, and completed
typecheck/tests/build. Then integrate campaign routing, production asset build,
Level 2 → 3 transition and backend submission in a coordinated follow-up.

## First discussion decisions

The mechanics and theme are specified by the user. Suggested remaining creative
decisions are the final game-camera framing of the already-held cannon and Aurora's
playful magical presentation. The rooftop-party setting is accepted. None requires changing
shared code before review. Begin implementation with the isolated verb harness
after discussion; do not jump ahead to the finished boss fight.
