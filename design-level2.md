# Level 2 — Skyline Chase: mechanics and playthrough

Recovered on 4 November 2026 from the final planning discussion in the Claude
project log `d9b85a8e-61cc-4e20-b98e-fbbdea18b275.jsonl`.

Source: assistant message at `2026-11-03T20:36:02.984Z` (line 2917).
The user's final request, at `2026-11-03T21:03:58.745Z`, was:
“yeah drop it into a md file please”. Claude hit its session limit before
creating the file.

**Status:** the active build is the four-direction swipe version described below,
with the real character, street and props integrated (see the asset pass).
`/` and `?level=2` open it; `?level=1` opens the frozen first level. Earlier
prototype sections and the recovered Claude plan are retained as history.

## Environment and game-zone pass — Kenney street, 45s route (4 November 2026)

Two passes in one build: the environment rebuilt around the Kenney City Kit
Roads set, then the game zone rebuilt on top of it. Controls, motion model and
the swing/run state machine are unchanged; rope physics stays deferred.

### What was wrong, and why

| Reported | Root cause |
|---|---|
| "4 and a half roads on either side" | A Kenney tile is a WHOLE street with its own kerbs, not one lane. Six were tiled across at one-per-lane. |
| "cars sink into floor" | The road has thickness. Tiles were base-seated so the surface sat at y=0.3, and everything placed at y=0 — cars, towers, **Matthew** — was buried to the ankle by the road it stood on. |
| "custom obstacles don't fit" | They were fabricated from boxes because the KayKit packs had no bridge, cone or hanging sign. The Kenney set has all of them; the fabrication was the wrong answer to a solved problem. |
| "Matthew is too small" | At a 36-unit stand-off and 64° FOV he filled **5.3%** of the frame against level 1's **22.3%** — 4.2x smaller — which also made the same prop count cover four times the area and read as sparse. |

### Scale and framing

Lanes narrowed 6 → **3.2** so the camera could come in 36 → **18**, taking
Matthew to **10.6%** of frame: half of level 1's apparent scale, twice what it
was. Forward speed scaled with it (16 → 8.5) so apparent speed is unchanged.
Vertical did **not** scale — `groundY` is pinned by the character's own foot
drop, and compressing the swing band would collapse the gap between the high
road and the low road.

Every camera and framing constant now lives in `skyline-view.ts`, and the
street layer asks the camera where it is rather than assuming a stand-off, so
an oblique variant later is a config edit plus a retune.

### The 45-second route

Four acts. Scored gifts are capped at four by the scoring rules, so the extra
nine seconds bought hazard variety and spacing, not more collectibles — 13
hazards against the old 8.

| t | Entity | Lane | Span y | Archetype → asset | Points | Player state |
|---|---|---|---|---|---|---|
| 3.5 | `teach` | mid | 10.0–11.6 | gift → `present_A_yellow` | 0 | collect, "Nice catch" |
| 7.0 | `gift-left` | left | 8.3–9.9 | gift | **+100** | collect while swinging |
| 7.0 | `first-middle` | mid | 0–12 | pillar → tiled `construction-barrier` | −50 | `Hit_A`, 1 s protection |
| 11.0 | `cone-right` | right | 0–3 | lowBlock → barrier + 2 `construction-cone` | −50 | clears if swinging |
| 13.5 | `gift-ground` | mid | 0.4–2.0 | gift | **+100** | collect while running |
| 15.5 | `bridge` | **all** | 5–13 | bridgeSpan → `road-bridge` + `bridge-pillar-wide` | −50 | **only answer: ↓ run** |
| 19.5 | `sign-left` | left | 5–13 | overhead → `road-sign-empty-hanging` + hanger | −50 | clears if running |
| 22.0 | `barricade` | **all** | 0–3 | wallSpan → barriers + 5 cones + 2 beacons | −50 | **only answer: ↑ swing** |
| 25.0 | `gift-right` | right | 4.4–6.0 | gift | **+100** | collect while swinging |
| 25.0 | `upper-left` | left | 5–13 | overhead | −50 | lane choice |
| 29.0 | `centre-tower` | mid | 0–12 | pillar | −50 | lane choice only |
| 31.5 | `fence-right` | right | 0–3 | lowBlock | −50 | clears if swinging |
| 34.0 | `gift-low-left` | left | 0.4–2.0 | gift | **+100** | collect while running |
| 34.0 | `low-right` | right | 0–3 | lowBlock | −50 | |
| 38.0 | `mid-high` | mid | 5–13 | overhead | −50 | |
| 41.0 | `final-ground` | mid | 0–3 | lowBlock | −50 | paired height choice |
| 41.0 | `final-high` | right | 5–13 | overhead | −50 | paired height choice |
| 43.5 | `last-left` | left | 0–12 | pillar | −50 | |
| 45.0 | route complete | — | — | — | **+200** | |
| — | upper anchor, every 3.2 s | all 3 | y 19 | `electricity-side-wide` gantry + cable | — | grip pose, cable to hands |
| — | lower anchor | all 3 | y 0.6 | road surface only (transient) | — | `Jump_Land` → `Running_A` |

Maximum 600: 4 × 100 + 200. `scoreRun` needed no change.

**Player animation states:** `swing` / `flight` / `transfer` → `Jump_Idle`
plus procedural arm aim · `launch` → `Jump_Start` · `descend` → `Jump_Idle` ·
`land` → `Jump_Land` · `run` → `Running_A` · incident → `Hit_A` + 1 s
protection.

### Zone separation

`GAME_ZONE_HALF = 4.4` is the contract. Lanes, anchors, gifts and hazards live
inside it; nothing decorative may enter. Street dressing sits at 5.4 and the
facades at 6.9. `tests/skyline-zone.test.ts` fails if either closes up, which
is level 2's equivalent of level 1's `isClearOfCorridor`.

### Two packs, two ways of scaling

KayKit props are authored at inconsistent sizes, so each is scaled from the
real-world size it represents (`metres`) against a measured native height.
Kenney's set is internally consistent — a streetlight is already right against
its own road tile — so one factor preserves the relationships the pack gets
right. Those entries carry `metres: 0` and say so. The road is the one
deliberate exception at 17 rather than 13: a Kenney tile gives roughly half
its width to pavement, so at the pack factor the carriageway was narrower than
the outer lanes and the side lanes ran along the kerb.

The whole Kenney set shares one 11 KB colormap, so it is **copied rather than
embedded** (one request, one texture) and put on **one shared material**,
toned 55% toward the project navy. Dropped in untouched it read as pale
lavender against level 1's night.

### Continuity with level 1

`SkyLayer` is reused unchanged, and `buildCnTower` — already built for level
1's skyline — now stands ahead down the street as both a continuity motif and
a destination the chase is running toward. Clouds are still excluded: their
low band sits at y −5.5 for a rooftop, which in a canyon is below the road.

### Measured

- **27,430 triangles / 40 draw calls** peak across the full 45 s, against a
  60,000 / 60 ceiling set before the work started.
- Draws went 63 → 40 by sharing one Kenney material and **baking each obstacle
  into a single merged mesh** — a barricade was twelve draws for one object
  that never moves relative to itself.
- 177 tests across 17 files, production build clean, all 14 viewports correct,
  level 1 untouched.

### Bugs the tests caught that the eye did not

- **Pool ratchet.** `mesh.count` was serving as both capacity and per-frame
  draw count, so anything placed intermittently fell to zero and never
  returned.
- **Ground seating destroyed by positioning.** `assets.prop()` returns a clone
  whose own position carries the seating correction; writing `prop.position`
  threw it away. Invisible while the error was a fraction of a unit, and
  glaring once a prop was stretched twelve-fold. Props are wrapped now.
- **Single-lane overheads hung from nothing.** Caught by the support
  assertion; they now carry a hanger up to the same cable line the anchors
  use.

### Known

- A stale Vite dev-server cache can serve a 404 page for an asset that exists
  on disk, if `assets:build` deleted the directory while the server was
  running. Restarting the server fixes it; the symptom is a GLB arriving as
  `text/html` and Matthew silently falling back to the box stand-in.
- Physical-device performance remains a hands-on item.

## Asset pass — real street, real Matthew (4 November 2026)

Swapped the prototype art for the pack assets. **Camera, controls, course,
collider bounds and transition timings are unchanged**; the art was fitted to
them, never the reverse. Depth was the complaint this pass answers.

### Pipeline

`tools/build-assets.mjs` gained 14 files that existed in the packs but had
never been staged — the road, three more vehicles, traffic lights, a hydrant,
a bench, two more silhouettes, and four `_withoutBase` building variants.
The base-less ones matter: the A–F exports carry their own plinth, correct
standing in a skyline band and wrong on a street, where it holds the facade
off the tarmac and the building reads as floating.

### A second scale space

Level 1 is 1.45 units of character in 1.6-unit lanes; level 2 is 2.385 in
6-unit lanes — a factor of 1.645. The same source file therefore needs two
scales (`streetlight` is 4.34 there and 8.52 here, and both are right), so
level 2 has its own registry in `src/render/skyline-props.ts` at
**1.363 units per metre**, leaving level 1 untouched.

`tests/skyline-props.test.ts` loads every staged GLB, applies the registered
scale, measures the result and fails if it misses its declared range — and
separately reconciles each scale against the real-world metres it claims to
come from, within 2%. Level 1's registry comments promise this check; it was
never written there.

### What is real and what is deliberately not

| Element | Now |
|---|---|
| Hero | `matthew.glb`, fitted to 2.385 with the stand-in's exact foot drop |
| Street | Tiled `road_straight`, one 6-unit tile per lane, crossing every 8th |
| Canyon | Four base-less towers, placed by inner FACE at x = ±19 |
| Dressing | Streetlights, traffic lights, hydrants, benches, bushes, 4 vehicles |
| Gifts | `present_A_yellow`, scaled to fill its 1.6-unit collider |
| Hazards | Steel structure plus magenta hazard striping, clutter dressed on top |
| Sky | Level 1's `SkyLayer`, reused unchanged |

Clouds and the skyline band were **not** reused: clouds author a low band at
y −5.5 for a rooftop, which in a canyon is below the road, and the skyline
band would drag level 1's unit scale across. Girders, deck plates, kerbs and
barrier rails stay primitive because a box is the correct shape for them, not
a placeholder — and the pack has no bridge, gantry or hoarding.

### The swing pose is procedural

The two libraries hold 26 clips and not one is a hang, reach or swing.
`Jump_Idle` would have been on screen for most of 36 seconds. So the clip
supplies the body and the arms are posed afterwards, aimed at the anchor the
player is actually attached to, blended in and out by a grip weight. The
cable starts at the hands.

The bone axis is **derived from the rig**, not assumed: the child joint's
position in its parent's space is the direction the bone points at rest, so
aiming is one `setFromUnitVectors` and the code is correct for any rig. A
first attempt that rotated `upperarm.*` about a hand-picked local X did
nothing visible. Aiming only the shoulder also failed — the clip's bent elbow
left the hands at mid-torso — so both `upperarm` and `lowerarm` are aimed.

`Jump_Start` and `Jump_Land` now cover the launch and landing, which were
previously a procedural crouch.

### Structural rule, with a test

**A gap in the art must never be secretly solid.** A row of dumpsters with
daylight between them says "aim for the gap" while the collider says
otherwise. Every hazard therefore carries continuous geometry across the full
width and height of its own collider, with loose props dressed *on* that
barrier rather than substituting for it. `tests/skyline-hazards.test.ts`
builds each hazard with no assets loaded and asserts the coverage, plus that
no overhead deck hangs in mid-air without either reaching the road or bracing
to a building.

### Measured

- Peak **40,657 triangles / 52 draw calls** at t=15.4 s, against a ceiling of
  60,000 / 60 set before the work started. Anchor markers were 18 separate
  draws and are now three instanced pools.
- Fog thinned 0.012 → 0.0085 and the far plane moved 160 → 230. Both of level
  1's values assume its over-the-shoulder camera; at 36 units back the hero
  was 35% fogged before anything else and the clip edge fell inside the fog.
- A camera-side fill light was added locally. The shared rig aims its key and
  rim from in front of a character who runs away from the lens, so the side
  the player sees had only the hemisphere term and Matthew read as a cut-out.
- 172 tests across 15 files, production build clean, all 14 viewports correct,
  level 1 unchanged.
- `?closeup` added as a review affordance alongside `?clean` and `?debug`.

### Known, and deliberately left

- From directly behind, the hood and cape dominate the silhouette and the
  arms read weakly even when correctly aimed. This is the camera's problem,
  and camera work is the next pass by agreement.
- Physical-device performance is still a hands-on item; SwiftShader numbers
  bound the geometry, not the phone.

### The chase gap

The level is called Skyline Chase and §2 frames it as a pursuit, but nothing
pursues — mechanically it is a solo obstacle course. **Decision: this is
resolved in the STORY, not in level 2 gameplay.** Aurora's lead and the
reason Matthew is racing the rooftops are established in the intro and the
level 1 → 2 transition, so the pursuit is motivation rather than an on-screen
chaser. No second AI character, no extra draw budget, and the swipe
vocabulary stays as reviewed.

## Current review — swipe, swing and run (4 November 2026)

Approved controls: horizontal swipes move one lane, up selects swinging and
down selects running. Two quick sideways swipes redirect across both lanes
without waiting at the middle. The chosen mode persists in every lane; the
course no longer chooses the middle lane's running/swinging state. There are
no tap-to-select or hold/release actions. Keyboard arrows and WASD mirror swipes.

- `skyline-swipe-input.ts` replaces the tap recogniser. A stroke fires once
  after 28 CSS pixels on an axis at least 1.25 times the perpendicular distance.
  Extra fingers, small jitter, holds, taps and key repeats do not add actions.
  Cancellation, pointer capture loss and pause clear the stroke.
- `Motion` now has independent lane and travel mode. Both routes exist in all
  three lanes. Quintic connections preserve current position/velocity/acceleration
  during changes of mind. Down uses a low anchor in the selected lane; landing
  has its own time, independent of where it happens along the course.
- `SkylineRunner` stores requested mode separately from the current movement
  target. An up-swipe under an overhead obstruction waits for clearance and
  then launches without another gesture. Down cancels it; lateral swipes are
  still accepted. This assists clearance, not retroactive collision avoidance.
- The 36-second course keeps one teaching gift, four scored gifts (+100 each),
  completion (+200) and incidents (−50). It introduces horizontal choices,
  then a broad bridge at 13.8s, a street barricade at 18.5s, and mixed high/low
  encounters. Neither permanent running nor permanent swinging avoids all hazards.
- HUD shows selected lane and requested mode, including pending launch feedback.
  Lane and mode indicators no longer intercept swipes. Street markings follow
  the selected ground route. Level 1 and its shared input remain unchanged.
- Validation: 162 tests across 13 files, production build, real four-direction
  touch gestures, two quick lane swipes, persistent modes, launch clearance,
  six viewport sizes, a 600-point no-hit run and at least two seconds of visible
  warning. Peak browser workload: 50 draw calls / 5,012 triangles. Physical
  phone performance remains a hands-on review item.

## Previous review — three-lane tap rebuild (4 November 2026)

Approved pivot: the player chooses left, middle or right. Swinging is automatic.
Middle uses predetermined upper or lower anchors; lower anchors lead to a
landing, ground run under overhead obstacles, and an automatic launch. Direct
left↔right transitions and redirection midway are supported, including during
landing approaches and running exits. There are no hold/release mechanics.

Implementation:
- `src/levels/skyline/types.ts`: shared lane, course and snapshot definitions.
- `course.ts`: a 33-second course at 16 route units/second, lane centres ±6/0,
  upper swings every 3.2 seconds, middle descent from 10–12s, landing/run from
  12–16.2s and launch from 16.2–18s. One teaching gift, four scored gifts,
  six obstacles including a bridge over the running route.
- `motion.ts`: authored route samples and quintic transfer curves preserving
  position, velocity and acceleration. Replanning immediately uses the current
  kinematics. Horizontal transfers take about .45–.85s; large vertical changes
  take longer. The planner checks floor/corridor bounds when reversing.
- `runner.ts`: pure 60Hz gameplay with 120Hz swept collision substeps. Actual
  position determines hits and pickups. Hits deduct 50 once, grant one second
  of protection and never stop travel/input. Four gifts plus completion = 600.
- `src/core/lane-tap-input.ts`: absolute three-third selections on press,
  no hold/release actions, keyboard A/S/D or left/down/right. First tap starts.
- `src/render/skyline-scene.ts`: instanced primitive city, attached ropes,
  articulated character with swing/run/landing/launch poses, low-route markings.
- `src/render/skyline-camera.ts`: centred chase camera with damped vertical
  tracking, stable horizon and portrait framing.
- `src/level2.ts` / `.css`: three-part lane indicator and accessible buttons,
  instructions, score, damage feedback, pause/resume and replay.

Verification targets: six directed lane changes; mid-transfer reversals;
enter/exit ground during descent, landing, run and launch; continuous motion;
no floor penetration; swept contacts; a complete 600-point safe route; real
browser taps, hold inertness, pause/replay, narrow portrait framing, two seconds
of obstacle warning, under 60 draw calls / 15,000 triangles, and level 1 intact.
Results: 158 tests pass across 13 files; production build passes. Browser checks
pass all six viewport sizes, a 600-point run without damage, ground exit and
mid-leap redirection, and at least two seconds of visible obstacle warning.
Peak measured workload: 49 draw calls / 5,068 triangles. Level 1 file hashes
match the pre-pivot values. Physical phone frame rate still requires on-device review.

Checkpoint: Git could not create `.git/index.lock` in this environment. The
old playable version passed 174 tests and its build, then 19 files were archived
and byte-verified in `checkpoints/level2-hold-2026-11-04.tar.gz`; its manifest
records hashes and the base commit `4be7b94`. The old code was then removed.
No checkpoint commit was created, and no deployment was performed.

## Previous review — 3D left/right controls (4 November 2026)

User requested a Spider-Man-inspired following camera, genuine 3D motion,
anchors on both sides, and rope/attachment timing as the skill. They approved
a simple left/right tap-and-hold trial first. Automatic anchor-side selection
is a possible follow-up after gameplay review, not part of this trial.

- Pure 3D tether simulation: gravity, fixed attachment-distance rope,
  tangent release, modest launch assistance, forward assistance and corridor
  steering. Runs at 60 Hz with 240 Hz collision/constraint substeps.
- Hold either half of the playfield; release to fly. Desktop A/D or arrows.
  One active pointer/key, latched side, no drag-to-switch. First input starts
  the course. A held rope eventually auto releases and requires a new press.
- Chase camera behind the character, damped vertical/lateral follow, with
  extra distance on long arcs to retain the attached anchor in portrait.
- Short 360-unit course: paired anchors every 26 units, x ±8, height 15–17;
  floor −16, corridor boundary ±12. One unscored gift, four scored gifts at
  low and high positions, two magenta obstacles. Existing score rules apply.
- Failure freezes travel and scoring. A fresh hold on either side creates
  an overhead recovery rope, lifts continuously, then returns to swinging.
- Primitive blue/gold character and instanced city blocks/window strips.
  No new external assets or physics dependency. Level 1/shared input unchanged.
- Input side selection is independent of the rope simulation, allowing an
  automatic-side option without rebuilding the camera or physics.
- Verification: real Chromium touch/keyboard, cancel, pause/regrip, replay,
  freeze/recovery, six viewport sizes and a complete route. An alternating
  run scores 400 with no recovery; simulation checks also reach the higher
  gifts using later releases. All gift positions have a tested reachable path.
  Measured peak 37 draw calls / 5,488 triangles; phone FPS remains unmeasured.

## Build context at recovery, before the level 2 prototype

- **Operation Confetti:** a portrait browser birthday game. Aurora stole
  Matthew's cake; the intended journey is Gift Vault → Skyline Chase →
  rooftop boss → results/leaderboard. Guests eventually enter through a QR
  code and display name.
- **Stack:** Vite, strict TypeScript, Three.js, plain HTML/CSS UI. A Cloudflare
  Worker hosts static assets and the score API; Supabase stores runs. The
  deployment configuration targets `operation-confetti.auritro.com`.
- **Current playable slice:** level 1 only. Three lanes, a 487-unit rooftop
  route, speed ramping 9 → 15.3 u/s, roughly 41 seconds. Two unscored teaching
  gifts, four scored gifts, and eleven hazards across three acts. Hazards are
  lasers, fences and spotlights; guards, turret and snowman were removed from
  gameplay. Late encounters close two lanes while leaving one open.
- **Readability:** gold gifts/sparkles mean collect; magenta hazards mean
  avoid. Matthew is a recoloured hooded Rogue in blue/gold. Aurora's
  purple/gold model and crown, custom cake, vault, emblem and grapple assets
  are available through the asset tooling; availability is separate from
  gameplay integration.
- **Level 1 controls and feedback:** swipe or arrows/A/D to change lane;
  0.14-second visual lane slide with a stronger bank and eased release;
  collision reaction, time-based invulnerability blink, reduced-motion dim,
  edge pulse and floating −50. HUD shows score and pause; other measurements
  live in the debug panel.
- **Architecture:** fixed 60 Hz simulation; pure level/scoring logic separate
  from rendering; editable route data; swept collision checks; seven
  independently reviewable environment layers. Art conforms to gameplay
  positions and collider sizes. Repeated props/effects use batching or pools.
- **Scoring:** +100 per scored gift, −50 per route incident, +200 per route
  completion, floor at zero per level. Planned maxima: 600 / 600 / 1100 =
  2300. Shared browser/Worker scoring, submission client, offline retry and
  database schema exist; the current game entry only calls API health.
  Submission and leaderboard are not wired into a complete player journey.
- **Still ahead:** levels 2 and 3, level transitions, story/tutorial flow,
  name entry, endings, results/leaderboard UI, final device/balance/release
  checks.
- **Working agreement:** keep each gameplay slice small and independently
  reviewable. Build the core mechanic, let the user play on browser and phone,
  then iterate before adding content or presentation. Enforce important rules
  through types, module boundaries and meaningful checks.
- **Budgets:** aim below 100 draws and 150k visible triangles, prefer ≤5 MB
  cold transfer, ≤500 KB compressed JS/CSS, pixel ratio capped at 1.5.
  Earlier Claude measurements reported about 71–80 draws, 31–37k triangles
  and a 4.3 MB build; these are historical, not new device measurements.

## Recovered level 2 plan

### 1. The simulation

Genuinely 2D in `(z, y)`. `x` is fixed. Both `vz` and `vy` are real velocities — this is what makes momentum mean something.

**Forward assistance is one line, not a system:** `vz = clamp(vz, FORWARD_FLOOR, FORWARD_CEILING)` every step. A struggling player always progresses (§6 requires it); a good player genuinely goes faster; neither needs a separate scroll clock. `travelled = z`, so the whole level-1 mental model carries over.

### 2. States

```
Detached  ──holdStart, anchor eligible───▶ Swinging
Detached  ──holdStart, none eligible────▶ Armed
Armed     ──anchor becomes eligible─────▶ Swinging
Armed     ──holdEnd─────────────────────▶ Detached
Swinging  ──holdEnd─────────────────────▶ Ballistic  (launch on tangent)
Swinging  ──sweep >= MAX_ARC────────────▶ Ballistic  (auto-release, rule 7)
Ballistic ──holdEnd seen────────────────▶ Detached   (rearm, rule 6)
Ballistic ──y < 0───────────────────────▶ Rescue
```

**Swinging is a 1-DOF pendulum.** Only `θ` and `θ̇`, with `θ̇ = speed / radius` and gravity doing work along the arc. No rope wrapping, no 2D constraint solve. Speed persists across swings — that *is* the Spider-Man feel.

Three structural safety properties, not tuning values:

- **Auto-release is always safe by construction.** Attach sits around −60°, `MAX_ARC` is 150°, so the sweep terminates near +90° — level with the anchor, moving upward. Auto-release physically cannot fire you at the floor.
- **No uncontrolled orbit.** The arc cap ends every swing; the speed cap bounds every exit.
- **No stall.** `speed = max(speed, MIN_SWING_SPEED)` on attach. Attaching slow near the top of an arc is the one way a conserving pendulum dies, so it's closed at the source.

### 3. Starting numbers

All proposals — the point of slice 1 is to tune them against your hands.

| | Value | Why |
|---|---|---|
| Gravity | 24 u/s² | A 5-unit rise gives ~1.3 s airtime — one readable beat |
| Vertical envelope | 0 – 12 u | `y = 0` is the fall floor |
| Rope radius | 3 – 6 u | Above 6 the arc's horizontal extent leaves a portrait frame |
| Swing speed | 12 – 26 u/s | |
| `MIN_SWING_SPEED` | 12 u/s | Stall fix |
| `MAX_ARC` | 150° | Also the auto-release trigger |
| Forward floor / ceiling | 13 / 20 u/s | Reaction floor computed at **20** |
| Attach window | +6 to +26 u ahead | 0.3 – 1.6 s of lead |
| Route length | ~1150 u | ≈ 72 s at a nominal 16 u/s |
| Camera | ~22 u out, 25–35° oblique | ~23 u vertical visible, ~10.6 u horizontal |

Expected cycle: swing ≈ 0.75 s, ballistic ≈ 1.2 s, so **~2 s and ~32 units per swing — roughly 35 swings in a run.** That matches the real games' cadence.

### 4. Anchors

Anchors every **~18–20 units** — about twice the cycle length, so at any moment there are two or three you could take and *when you press picks which*. That's the decision that stops hold/release being a prompt.

The bed is patterned data; the **8 authored set-pieces** from §6 are the ones gating a gift or threading a hazard, layered on top. Authoring 50-odd anchors by hand is not the plan.

**Anchor position is gameplay truth; the building prop is placed to match it** — never the reverse. Same authority direction as lanes.

### 5. Entities

A separate `SwingEntity` type with a `y` field and **no expressible `lane`**, so a level-1-shaped entity cannot be authored here and silently ignored.

Collision is **swept segment-vs-AABB** — slab test on the Minkowski-expanded box, exact at any speed. Level 1's 1D interval test doesn't generalise now that `y` is continuous.

| | Count | Notes |
|---|---|---|
| Scored gifts | 4 | 100 each — the scoring cap is fixed at 600 |
| Tutorial gift | 1 | Unscored, act 1 |
| **Trail sparkles** | many | **Unscored.** Trace the ideal arc, the way coin trails do in the real games — pure guidance, zero score impact |
| Static hazards | sign, antenna | Block a height band |
| Moving hazard | 1 reused model | Vertical oscillation — one model, per §6 |

Five collectibles across 72 seconds would read as empty; the trail sparkles are what fill the route without touching the score ceiling.

### 6. Playthrough

| Act | Time | `z` | Content |
|---|---|---|---|
| **1 — Teach** | 0–18 s | 0–280 | Safe area, no hazards, no floor risk. First anchor over flat ground, very wide window. *"Hold to grapple. Release to fly."* Unscored gift on the natural arc. 3 anchors. |
| **2 — Rhythm** | 18–38 s | 280–620 | Anchors dense enough to chain. Sign and antenna placed so the natural arc clears them but a late release does not. **2 scored gifts**, set slightly above the natural line, so reaching them costs a later release. |
| **3 — Pressure** | 38–58 s | 620–940 | Drone introduced. Two deliberate anchor gaps force long ballistic stretches with nothing to grab — dodge while falling. **2 scored gifts.** Speed near ceiling if playing well. |
| **4 — Run-in** | 58–72 s | 940–1150 | Densest anchors, fastest section, one final gauntlet, then the destination rooftop. No gifts — pure flow finish. |

**Rescue:** `y < 0` → teleport to the next safe route point, grant invulnerability, emit `incident` **only if not already invulnerable**. A collision-caused fall is inside its own protection window, so it bills once by construction — §6's "one incident, not two penalties" with no "was this caused by a hit" flag to get wrong. Missed gifts stay missed.

### 7. Build order

**Slice 1 — the verb.** Ships at `?level=2`, standalone, **`main.ts` untouched** so level 1 carries zero regression risk.

- `src/levels/swing.ts` — pure sim, no three.js import.
- Ugly debug renderer: capsule, line cable, box anchors, oblique camera.
- **Uniform anchor route** — no gifts, no hazards. Its only job is to let you ride the swing and give us a measured cycle time.
- Tests: pendulum integration, state machine, auto-release never reaches the floor, swept collision at 40 and 120 u/s, speed caps.
- **Viewport check across the 14 sizes in this slice**, not at polish — framing sets envelope height, which sets gravity, which sets everything.

Also folded in here: `runner.ts` emits hard-coded `level: 1` at lines 148/182/195 — should read `this.config.id`.

> **Review gate: does the swing carry speed and feel good to ride?** Nothing downstream is worth building until that's yes.

**Slice 2** — author the route against the measured cycle time; difficulty ramp; reaction-floor tests.
**Slice 3** — `GrappleCable`, anchor highlight, near-pass buildings, hazard meshes, swing clips, HUD.
**Slice 4** — level 1 → 2 transition; `main.ts` learns to pick a level. Last, because it's the only slice that can break level 1.

### Two risks I'm not pretending are solved

**Momentum tuning is guesswork until it's in your thumb.** Every number in §3 is a starting point. The gravity/radius/speed triangle is interdependent — changing one moves the cycle time and invalidates the anchor spacing.

**Portrait horizontal room is tight** (~10.6 u). A radius-6 swing sweeping 150° has roughly 8.6 u of horizontal extent, which only fits because the camera follows `z` with a lag and lets the player drift rather than holding them pinned. If that reads badly, radius comes down and arcs get taller — which is why I want the viewport check inside slice 1.

## Review notes before implementation

These notes come from comparing the recovered discussion with the checkout.
They qualify implementation claims without changing the agreed gameplay
direction.

1. **Rope reach and anchor eligibility need one consistent rule.** A +6 to +26
   forward attachment window cannot generally fit a 3–6 unit rope: the actual
   distance to the anchor also includes height. Slice 1 must reconcile reach,
   spacing and camera framing, and attach without teleporting the player.
2. **Forward assistance must respect the swing constraint.** Independently
   clamping `vz` while attached can break the pendulum's circular path and
   change its energy. The constraint, tangent velocity, assistance and exit
   caps need to be defined together. Initial speed on attach alone does not
   prove a swing can never stall; verify the full arc and auto-release.
3. **The route numbers are hypotheses.** An 18–20 unit anchor spacing is
   shorter than the estimated 32-unit cycle, not twice that cycle length.
   Three anchors over the teaching act also do not match a uniform dense
   bed. Use measured prototype cadence to settle those figures before
   authoring the final route.
4. **One incident per collision/rescue needs a guarantee.** An invulnerability
   timer alone only prevents double scoring if the ensuing fall always ends
   inside that timer. Verify that bound or explicitly keep the originating
   incident associated with its rescue.
5. **A separate entry still needs URL routing.** The plan's `?level=2`
   prototype URL does not currently exist. Reaching a separate prototype
   there requires a small bootstrap/HTML routing change, or an explicitly
   separate development page. Preserve the level 1 entry while doing so.
6. **Shared route events are currently hard-coded to level 1.** The three
   emissions in `src/levels/runner.ts` are still `level: 1`. If this runner
   is reused, narrow its config to route levels 1/2 and emit the configured
   route level. The new swing simulation must emit level 2 events.
7. **Some earlier completion claims differ from the code.**
   `src/render/rogue.ts` still uses a 0.45-second one-shot window with
   `clampWhenFinished: false`, despite the discussion claiming a 0.67-second
   clamped reaction. Also, `celebrate()` immediately sets its one-shot timer
   to zero, allowing the following idle update to replace the celebration.
   Record these as existing animation follow-ups; no gameplay was changed
   during this recovery.
8. **Older documents contain superseded decisions.**
   `docs/TECH_SPEC.md` still describes Phase 0 and Kenney assets.
   `src/assets/plan.ts` and some palette/manifest comments still describe
   blue gifts or removed guards/props. For the current build, use the latest
   user decisions and actual runtime configuration. The present runtime packs
   are KayKit Adventurers, City Builder Bits and Holiday Bits.

## Verification during recovery

- `npm run typecheck`: passed.
- Existing Vitest suite: all 11 test files passed. The sandbox's default
  temporary directory was unavailable, so Vitest was run with `TMPDIR`
  pointed to an ignored directory inside `node_modules/.cache/`.
- No new browser, phone or deployment verification was performed.
- Only this Markdown handoff was added; game code was not changed.

## Initial slice 1 (historical tuning, superseded by the next pass)

- `src/entry.ts` chooses an independent level 2 entry by default and imports
  the existing `main.ts` only for `?level=1`. Level 1's simulation, visuals,
  styles and shared input modules remain unchanged. No level transitions yet.
- `src/levels/swing.ts` is the pure `(z,y)` simulation. `swing-types.ts`
  separates height-based entities from lane entities. `level2.ts` holds
  editable practice configuration: 1150 units, a uniform 12-unit anchor bed,
  anchor height 12, gravity 24, detached forward assistance 13–20 u/s,
  tangent speed 9–26 u/s, attachment minimum speed 12 u/s.
- Actual rope length is measured from the player's position on attachment,
  with no position snap. Eligibility requires 1–10.5 units of forward lead,
  at least 1 unit of height above the player, and a radius within 3–13 units
  whose whole lower arc stays at least 1.2 units above the fall floor.
  This replaces the incompatible original +6–26 lead / 3–6 radius proposal.
- Gravity acts along the swing tangent. A minimum tangent speed prevents
  stalling; detached forward assistance ramps toward its floor rather than
  overwriting the attached trajectory. Auto-release happens at +60 degrees
  or a 150-degree sweep, whichever comes first, and requires a physical
  release before rearming. Released velocity is the current tangent.
- The first 72 units have a safe deck; a fall later rescues the player forward
  without restarting. Incident attribution persists through a collision's
  ensuing fall, so protection expiring cannot bill that rescue twice.
- Presentation uses a capsule, line cable, box anchors and simple reference
  blocks. Reachable anchors are cyan, attached anchors gold. An oblique
  camera follows the midpoint of a live cable and eases forward when released.
  Player and anchor stay framed through the arc on the narrowest test phone.
- Pause freezes the simulation and preserves the rope; a fresh hold re-grips
  it. Replay resets the runner and camera. Debug is opt-in with `?debug` or
  the I key. It shows height, velocity, anchor/radius, swing count/cycle,
  rescues and rendering cost. No gifts or hazards are on the practice route.
- Existing +200 route completion scoring is emitted as level 2. The current
  practice route has no gift points; it is not the final 600-point level.
- Automated verification: 153 Vitest tests passed, including 17 new swing
  checks; TypeScript/production build passed; Chromium checks passed for
  keyboard/touch input, cancellation, pause/re-grip, replay, 14 viewports,
  arc framing and the separate level 1 entry. Browser capture measured 6
  draw calls and about 800 triangles for the prototype. SwiftShader checks
  establish correctness and framing; swing feel still needs real play.

## Wider swing and content review pass

The user's feedback accepted the basic swing, but requested more space
between anchors, a lower floor, recovery that waits for input, and gifts and
obstacles to judge release timing.

- Anchor gaps now repeat 24, 26 and 28 units. Rope radius is 8–20 units,
  forward eligibility 3–18 units; anchors remain at height 12. Radius is
  always measured from the current player position, and floor clearance is
  evaluated relative to the new −12 boundary. Ceiling is 24.
- The 1150-unit route is retained. The continuous starter rooftop is removed;
  reference buildings sit below the new floor. The camera is farther back
  and more oblique to show longer cables and upcoming encounters. It frames
  player/anchor height together as they move through the larger envelope.
- Falls stop exactly at the lower boundary; obstacle hits stop at contact.
  Both enter a recovery state with zero velocity, one −50 incident and no
  progress, elapsed-time, protection-timer or scoring-contact advancement.
  Previously held input must be released before re-gripping.
- A cyan recovery anchor is guaranteed directly overhead, even when no
  ordinary anchors remain reachable. A fresh hold attaches without moving
  the player, then reels upward at 22 units/s to an 8-unit rope before
  handing back to the pendulum. This safety lift resolves no gifts/hazards.
  Releasing during the lift gives an assisted upward launch. Completed
  contact states plus brief protection prevent charging the same hit again.
- Five gifts and four collider-sized static obstacles are drawn in pooled
  batches. Gold gifts have light ribbons and pickup feedback; magenta frames
  and a translucent fill show each obstacle's occupied height. A collected
  gift pops away, and a hit obstacle disappears. All positions are authored
  in the same data used by collision checks.

| z | Entity | Height / occupied band | Points |
|---:|---|---|---:|
| 20 | Teaching gift | −3.5 | 0 |
| 80 | Gift 1 | 1 | +100 |
| 125 | Low obstacle | −10.8 to −6.2 | −50 |
| 260 | High obstacle | 3.5 to 8.5 | −50 |
| 360 | Gift 2 | 2 | +100 |
| 560 | Low obstacle | −10.8 to −6.2 | −50 |
| 620 | Gift 3 | −2 | +100 |
| 880 | High obstacle | 1 to 6 | −50 |
| 980 | Gift 4 | −1 | +100 |
| 1150 | Destination | Route endpoint | +200 |

Automated checks prove a path through every gift and obstacle for 600 points
without a recovery, and cover freezing, fresh-press reattachment, continuous
lifting, scoring isolation and collision checks. The full suite has 158
passing tests. Level 1's controller, content, input, visuals and shared CSS
retain their original hashes.

The production build and Chromium review checks passed. The browser completed
the authored route for 600 points, with 45 swings, no recoveries and 74.6
seconds of active simulation. All four obstacles became visible 1.38–2.25
seconds before crossing on that tested path. Keyboard/touch, cancellation,
pause/re-grip, frozen recovery, replay, 14 viewports and the separate level 1
entry were checked. These are automated viewport checks, not new phone
playtests.

Next review: spacing, cable length, room beneath the swing, recovery feel,
and how release timing reads against the gifts and height-band obstacles.

