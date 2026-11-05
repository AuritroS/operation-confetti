# Level 3 — Aurora's Christmas birthday showdown

Status: rooftop-party setting accepted by the user, 5 November 2026. The first
asset-free control practice slice is implemented on `codex/level3`; boss combat,
assets and environment remain future stages. The branch started at `0081761`.
The parent project typecheck has existing Level 2 errors, recorded in the
collaboration document.
This session cannot write the parent repository's `.git/worktrees/level3` lock,
so the requested commit remains pending despite finished files and checks.
Read `docs/COLLABORATION.md` for isolation and ownership before implementation.
This plan follows the user's build order. Current user decisions override older
design text; existing runtime manifests and code establish what actually exists.

## Direction

A Christmas-decorated rooftop party terrace: dry slate, warm lanterns, trees,
wrapped presents, birthday bunting and a cake on Aurora's raised stage. Three
clear lanes face Aurora from a fixed camera behind Matthew. The setting provides
continuity from the city levels while making the final confrontation celebratory.
The user has accepted this rooftop-party setting.

Keep trees and decorative presents outside the playable lane envelope. Reserve
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

Open `/level3.html` from the Level 3 worktree's Vite server. The page shows three
numbered lanes, a movable player marker, Aurora as a fixed aim target, animated
confetti shots, accepted-shot and target-hit counters, pause/resume and reset.
The practice target has no HP or attacks; hits measure aim and firing response.
It uses the shared input recogniser and lane tween without modifying either.
The playable logic and drawing live in separate Level 3 modules.

Run locally from `.worktrees/level3`:

```sh
npm run dev -- --host 127.0.0.1 --port 5303 --strictPort
```

Visit `http://127.0.0.1:5303/level3.html`. For repeatable local checks:

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
| Aurora | Recoloured KayKit `Mage` | 6,668 triangles; 369 KB GLB | 1.45-unit boss on raised stage; hide hat, use existing crown |
| Gun | Holiday Bits `snowball_cannon` | 1,354 triangles; 68 KB export | Level 2 already mounts it on `handslot.r` with 0.5 scale and rotation `(-π/2, 0, π)` |
| Main tree | `christmas_tree_decorated` | 13,236 triangles; 552 KB | One lit landmark at arena edge, 3.1-unit height |
| Repeat tree | `christmas_tree_withoutLights` | 6,886 triangles; 288 KB | At most one second tree, 2.6-unit height |
| Scored gift | `present_A_blue` | 678 triangles; 46 KB | Only collectible silhouette, with blue sparkle |
| Scenery presents | `present_C_red`, `present_D_green` | 678 triangles each; 46 KB each | Off-lane decoration only |
| Side lights | `lantern_decorated` | 1,451 triangles; 69 KB | Two warm fixtures outside playfield |
| Backdrop accent | `wreath` | 2,454 triangles; 112 KB | Behind Aurora; keep attack cues distinct |
| Stage accent | `bell_decorated` | 1,416 triangles; 64 KB | One bell on the boss backdrop |

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
keep the setting snow-free. The nine selected prop exports total about **1,291
KB on disk**. The two actors add 837 KB;
two stripped animation libraries add about 569 KB. These are file sizes, not
compressed transfer or decoded GPU memory. Each prop GLB embeds an atlas, so
repeated textures are a transfer-cost risk to measure when the scene is built.
One decorated tree alone is 13,236 triangles; instance counts must stay bounded.

Build the selected GLBs inside this worktree with `node tools/boss-assets.mjs`.
The worktree has an exact copy of the Level 2 recolour tool from stable commit
`4b5d989`; it produces the same `matthew.glb` hash as that checkout. The builder
reuses the animation-strip tool, converts the nine curated Holiday props to
`public/models/level3/`, and copies only selected transparent particle sprites
as 256px runtime textures. Generated outputs are ignored; source catalogs,
selected source sprites and builder are tracked. The new Kenney Particle Pack
1.1 is CC0 and its license is retained in `assets/level3-particles/`.

Particle picks: `magic_01` for a brief cast ring, `magic_03` for a charged
spell, `circle_03` for the shield rim, `muzzle_02` for the cannon flash,
`star_06` for a gift glint, and `smoke_03` for spell dissipate. The six scaled
runtime textures total about 192 KB on disk. Tint the grayscale sprites to the
role colour; keep the lane warning a solid geometric shape and confetti as
coloured paper, so neither depends on a soft particle image for readability.
Pool and cap sprites. The source pack's full 15 MB is not copied into runtime.

Open `http://127.0.0.1:5303/boss-assets.html` from the assigned Level 3 Vite
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

Make the setting feel like a **birthday party Aurora has taken over**: a dry
Toronto rooftop with warm Christmas lights, a visible cake display, and her
purple magic concentrated around the raised boss stage. Keep the centre deck
spacious. Richness should come from several readable depth layers and a few
large landmarks, not small props scattered across the attack lanes.
There is **no snow, snowfall, frost or white roof trim**. Christmas is conveyed
by lit trees, wrapped presents, wreaths, bells and warm lights. That keeps the
weather and surfaces consistent with Levels 1 and 2.

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

The review camera stays fixed behind Matthew, slightly raised and pitched toward
Aurora. Matthew occupies the lower third; Aurora and the cake sit in the upper
third; the middle third stays clear for incoming magic and confetti travel.
The initial view should show all three lane centres, his full silhouette and
held cannon, the full boss silhouette, the cake, and an entire lane warning on
a narrow portrait viewport. Start around a 55–60° vertical field of view,
then place the camera from measured phone framing; the exact coordinates are
not a gameplay input. Avoid camera follow or strong shake, which would make
lane reading and swipe decisions less stable. Use a short, bounded reaction
only after the base view is approved.

Reserve the top safe area for both HP displays and pause, and the bottom edge
for the player's thumb and any brief control prompt. Place no critical target,
warning or cake detail behind either overlay. Desktop uses the same portrait
frame rather than a wider combat view. Only after this frame is measured should
we lock actor and prop visual heights.
Level 2's world-unit hero height is 2.385; Level 3 currently proposes 1.45.
These are different world scales, so a seamless transition must compare their
screen-space size rather than assuming equal numerical heights.

### Scene layers and owners

| Layer | Build | Rule |
| --- | --- | --- |
| Far | Dark blue night sky, moon, limited Toronto building silhouettes and a CN Tower nod | Low contrast; no bright shape competes with Aurora or warnings |
| Middle | Rooftop wall/parapet, dry ledge, windows, warm string lights and birthday bunting | Fixed geometry; preserve a clear horizon behind the boss |
| Play deck | Three subtly distinct slate floor panels and a visible stage boundary | Flat enough for colored attack marks to read; no scenery in colliders |
| Boss stage | Aurora, cake pedestal/plate, one wreath and magical shield anchor | Cake visible through the fight and movable for both endings |
| Side dressing | One decorated tree, at most one plain tree, two lanterns and grouped presents | Outside playable width; frame as landmarks, not repeated clutter |
| Atmosphere | Warm lamp glints and occasional magic wisps | Bounded and pooled; never hide a warning or collectible |

Custom assets still needed: a rooftop/parapet kit with dry masonry trim; a low boss
dais and cake pedestal; birthday bunting and a small balloon cluster; lane-floor
inlays with warning/impact states; Aurora's magic shield and lane-strike shape;
a confetti shot with ribbon/paper pieces; and brief cake-recovery/escape poses.
The cake and crown already exist in `src/render/custom.ts` and are now shown in
the asset viewer. Improve the cake only after seeing it at the final camera size:
the current two-tier red velvet model has frosting, six candles and flames, but
no platter or richer icing detail.

Keep this in Level 3 paths: `src/levels/boss/config.ts` for coordinates and
combat timing; `src/render/boss/scene.ts` to compose the view;
`src/render/boss/arena.ts` for floor and stage; `environment.ts` for skyline,
roof and dressing; `actors.ts` for Matthew/Aurora and held cannon;
`effects.ts` for bounded particles and attack cues; `camera.ts` for framing.
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
after worktree setup and discussion; do not jump ahead to the finished boss fight.
