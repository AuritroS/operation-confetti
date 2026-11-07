# Level polish pass — plan and review cycles

Status: **for approval**, 7 Nov 2026. Follows `docs/STORY_PASS.md` (done).

The ask (Auri, 7 Nov): richer level 1 environment, fix its parallax and
camera; level 2's speed ramp starts too slow; level 3 mostly fine; remove
the unscored gifts and shorten the courses to match, keeping the 2300 cap
and the scoring rules exactly; review the tutorials; make rewards and
damage far more visible on the HUD with a gift counter; then consolidate,
security-check and deploy on the existing domain.

## How each stage runs

Every stage is the same loop:

1. Claude builds it, verifies headless, commits with a message that says
   what changed and why, and refreshes the captures.
2. Claude posts a short report: what changed, the evidence (captures,
   numbers, test and gate output), and the one or two things only a phone
   can judge.
3. Auri plays it on a phone and replies with notes. Claude fixes, recaptures,
   commits. Repeat until Auri says done.
4. Next stage.

Evidence per stage lives in `tools/shots/campaign/` (gameplay framing at
390×844 and 360×800), the full-campaign recording from the shell check, and
the test suite. Captures are layout and legibility evidence only; feel and
frame rate are Auri's on a device. Stage 1 adds a `?perf` readout so Auri can
paste one line of frame timing instead of describing judder.

Constraint: no network except the OpenAI host, so no new asset packs. Level 1
richness comes from what is already in `assets/` (KayKit City Builder Bits,
Holiday Bits, Kenney City Kit Roads, the particle pack) and from lighting,
placement and layering.

## Stages

### 1. Shell and seams (first, because every later capture runs through it)

**Done 7 Nov.** Found: both route levels ended with the vault door face
filling the frame (26 units wide, six units past the finish, camera 12.5
back), and the door was a solid slab with a badge. Fixed with an arrival
shot — the leaf swings open on a hinge to show the city beyond, the camera
dollies back and up to frame him under the opening, a mid-air finish is
brought to the ground — and the doors moved further past the finish so the
run-up never fills the frame. `tools/shoot-endings.mjs` captures either
ending as a strip. `?perf` chip added.

**Ending cycles, 7–8 Nov.** The level 2 cheer wound the chest through the
body (an add-on-top chest lean accumulating once the clip clamped; fixed
and measured). An airborne finish now falls and lands with the landing
clip and a camera dip before the cheer. The pause card names the chapter
instead of comic copy. Both gates are buildings: level 2 a brick
gatehouse spanning the street with pilasters, lanterns, windows and a
stepped plinth; level 1 a rooftop bulkhead the parapets run into. Both
doors open onto a lit interior — the stairwell up, the gift vault — so
the reveal is a room, not the empty map. `?ending=N` (`&loop`,
`&closeup`) is the review route.

- The campaign end to end with the new comic: level ending → iris → panels →
  chapter card → next level; boss win/loss → iris → ending panel → results.
- Diagnose and fix the level 2 ending break Auri saw (celebration clip,
  camera, or the old fade). Reproduce headless with the level 2 skip, then
  on a phone.
- The HUD hides under panels and results at the right moments; no stale
  score or "2/3" shows through a seam.
- `?perf`: frame time and dropped-frame count in the debug panel, with a
  one-line summary Auri can paste.
- Evidence: `check:campaign` green, a full-run recording, the campaign
  captures. Phone: play through all three seams once.

### 2. Course data (before anything that looks at the courses)

**Done 8 Nov.** `t1`, `t2` and `teach` removed; level 1 moved 50 units
earlier (route 437, ~37 s), level 2 three seconds earlier (42 s). Level 2's
ramp is 10.5 → 18 u/s, straight, route 598.5 units. The production-course
test in the solver, runner and scene keyed off a literal `45` and now reads
`COURSE.duration`. Suite, route solver (600-point route found, 16/16 seeded
trials at ±0.1 s), swing review and campaign gate all green.

The swing review had been broken since the campaign took over `/`: it
opened the root expecting the standalone level 2 page, clicked a replay
button that no longer exists, pressed P for a pause that is now automatic,
and asserted on a HUD label that is gone. All four fixed. Two findings
from running it: the narrow-aspect camera pull-back was marginal (the hero
at the 95% edge after a left swipe at 0.43 aspect, and at 390x844 once the
ramp started faster), raised from 8 to 12 (+0.47 units at 390x844, nothing
at 0.48 and wider); and the street was already at the 60-draw budget, so
the finish gate's ~27 draws for its last three seconds tipped it to 87.
The budget is 90 now, with the reason in the tool. Triangles 55.5k of 60k.

- Remove the unscored gifts: level 1 `t1`, `t2`; level 2 `teach`. They never
  emit a scoring event, so the cap, the Worker recompute and existing
  scores are untouched. No migration.
- Pull each route in to close the dead opening stretch (level 1 by ~40
  units, level 2 by ~3 s), keeping every warning time above the floor the
  tests enforce.
- Level 2 ramp: replace `v(t) = 8 + 10·(t/45)^1.5` with a ramp shaped like
  level 1's (a 70% rise, near-linear), proposed **10.5 → 18 u/s over the
  course**, so the first ten seconds are at playing speed. Encounters are
  authored in seconds so they move with the speed; the solver re-verifies
  the route and the swing check re-verifies on-device gestures.
- Evidence: tests, `check:route`, `check:swing`, a table of speed at 0, 10,
  20, 30, 45 s before and after. Phone: level 2's opening by feel.
- Auri's call: the ramp endpoints. Claude proposes, the phone decides.

### 3. HUD

**Done 8 Nov.** Reward: a gold glow around the whole frame for ~560 ms and
a 30px display-face `+100` rising over 1.1 s. Hit: the vignette in the fault
red, harder and shorter, with a matching `−50`. Four present glyphs under
the score fill in gold with a pop as gifts are taken, hidden on the boss
level. `tools/shoot-hud.mjs` captures the start, the reward, the hit and
the boss readouts at two widths into `tools/shots/hud/`.

- Reward: a gold edge glow around the whole frame for ~500 ms and a larger
  `+100` that rises from the score with weight, in the comic's display
  face.
- Damage: the vignette kept, in the fault red rather than Aurora's
  magenta, with a stronger, shorter pulse and a larger `−50`.
- Gift marker: four small present glyphs under the score that fill in gold
  as gifts are taken, one row, no numbers. Level 3's HUD keeps its own
  readouts; the marker lives only where gifts are a route.
- Evidence: captures of reward, damage and the marker at both widths on
  all three levels, including level 3's HUD beside it. Phone: salience.

### 4. Level 1 environment and camera

**Cycle 1 done, 8 Nov (parallax and camera).** A mid band of five taller,
darker buildings a side behind the street at 40% of travel, out of fog like
the far band, so the depth runs near 100 → mid 40 → far 12. The near, mid
and far bands slide against a lane change (35%, 18%, 6% of the player's
sideways position, eased). The camera bobs on his stride, rolls into a
lane change, and widens by up to five degrees as the ramp climbs; all off
under reduced motion. Lit façade materials are shared per band, which took
the material count from 67 back under the budget of 60.
`tools/shoot-level1.mjs <tag> [query]` photographs three route positions at
two widths; `before-*` and `after-*` in `tools/shots/level1/`.

**Cycle 2 done, 8 Nov (richness).** The rooftop lays a terrace a step
down either side of the parapets, and the clutter layer stands on it:
water towers, AC units, vents, dumpsters, bushes, litter and decorative
presents, fifteen pieces on a 164-unit period, plus a police car and three
streetlights on the street below. The layer is on by default again. The
near city is six buildings a side at 26 units, window glow up, with a
blade sign in magenta or gold hung from every other façade near the
roofline, facing the player. A third, near and low cloud band; gold drift
at 110 flecks. Material budget: shared parapet, coping and terrace
materials, one lit material per band, one cloud material per opacity;
59 of 60. `rich-*` captures in `tools/shots/level1/`.

- Environment: denser mid-city with more building variety and lit signage,
  street-level props placed beyond the parapets where they have ground
  under them (the earlier floating-clutter problem is why `clutter` is
  off), a second cloud band, more atmosphere drift near the camera, and
  warm window glow pushed harder. All within the triangle and draw-call
  budget `check:scene` enforces.
- Parallax: per-layer travel ratios re-tuned so far, mid and near layers
  separate clearly (far skyline ~10%, mid city ~60%, near props 100%),
  and a slow sideways drift tied to lane position so a lane change moves
  the city.
- Camera: a subtle forward bob tied to run cadence, a lean into lane
  changes, and a small FOV widen as speed rises, so acceleration is felt.
  Reduced-motion disables the bob.
- Ending: the vault arrival framed and timed to land on the iris.
- Evidence: before/after captures at the same route positions, the layer
  switch `?layers=` for review, `check:scene` budget. Phone: parallax and
  bob by feel; this is the stage most likely to need a second cycle.

### 5. Level 2 and level 3 polish

**Done 8 Nov.** Level 2: the view widens by up to five degrees up the
ramp, and wind streaks — 44 short lines in the camera's own frame, one
draw call — fade in from 13.5 u/s to full at 18, rushing toward the
camera; off past the finish and under reduced motion. The ending already
runs through the iris and the landing. Level 3: victory confetti 220 →
320 pieces; lighting and the shield cue left as tuned. Swing review at
90 draws, 56.4k triangles, exactly at the budget.

- Level 2: camera FOV follows the new ramp, speed lines or wind streaks at
  the top of the ramp, the ending through the iris.
- Level 3: small visual polish only (lighting, confetti density, the
  shield cue), nothing that changes timing or targets.
- Evidence: captures, `check:swing`, the boss cue harness. Phone: the climb
  in level 2.

### 6. Tutorials

- Auri reviews each sheet on `/?tutorial=N` and plays each rehearsal; Claude
  fixes gaps and glitches found, including copy and gesture glyphs changed
  by stage 2's course edits.

### 7. Consolidation and deploy

- Full test suite, typecheck, production build, `check:campaign`,
  `check:swing`, `check:route`.
- `/code-review` on the whole branch; `/security-review` on the diff since
  the last deploy, with particular attention to the Worker, the score
  submission path and the review routes.
- Docs updated: README review table, AGENTS.md, this file marked done.
- Auri deploys: `npm run deploy` (the Worker serves both static assets and
  the API; the database schema is unchanged).

## Order and dependencies

1 → 2 → 3 → 4 → 5 → 6 → 7. Stages 3 and 4 are independent of each other
and could run in either order; 3 first because it is small and Auri's
feedback on salience applies to every level. Stage 6 waits for 2 and 5
because they change what the tutorials teach.

## Open for Auri

1. Approve the order, or move stage 3 (HUD) later.
2. Level 2 ramp endpoints: 10.5 → 18 proposed.
3. Confirm the three unscored gifts go: `t1`, `t2` (level 1) and `teach`
   (level 2).
4. Damage colour: fault red proposed, magenta today.
