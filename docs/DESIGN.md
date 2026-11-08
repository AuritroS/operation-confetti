# Matthew Birthday Game: Design and Phased Build Plan

Version: 0.1, review draft | 3 November 2026

Title: Operation Confetti

## 1. Scope and decision status

Build a short, single-player birthday game for Matthew's friends. Guests scan a QR code, open a website, enter a display name, play three levels, and receive a score and leaderboard position. No installation or account setup.

**Locked requirements**

- Three.js, TypeScript, browser delivery; portrait-only gameplay.
- Stylised 3D presentation with constrained movement and fixed cameras.
- Level 1: swipe left/right; 3–5 gifts, 3–5 enemies, 3–5 obstacles. Collisions affect points only, with no restart or level failure.
- Level 2: press/hold and release to use authored grapple anchors; gifts and obstacles, visually varied from level 1.
- Level 3: swipe left/right and tap to shoot; gifts, magic attacks, player HP and Aurora HP. Player HP reaching zero means loss and Aurora escapes with the cake. Aurora HP reaching zero means victory.
- No visible countdown, overt time pressure, or timeout-based boss defeat. Roughly 3–5 minutes is a pacing target, not a hard runtime guarantee.
- Matthew uses KayKit's hooded Rogue, blue/gold colours and a bandit eye mask, without glasses. Aurora uses KayKit's Mage with purple/gold colour adjustments.
- KayKit-style environment, blaster prop, supplied PNGs for illustrated story moments. Minimise custom asset work.
- Audio deferred. Essential feedback must work visually.
- Build simplified complete gameplay first, then scoring/leaderboard, then final presentation; test a representative real asset early to expose integration risks.

**Proposed implementation defaults**

The counts, timings, HP, scoring, camera details, backend and story text below are reviewable defaults, not previously approved exact values. Tune through playtesting while preserving the locked controls and outcomes. This document authorises no implementation or publication by itself.

## 2. Story and player journey

Aurora has stolen Matthew's birthday cake. Matthew raids her gift vault for a clue, follows her across Toronto, and confronts her on a rooftop with a confetti blaster.

Sequence: landing/name entry → asset loading → comic intro → level 1 → vault reveal → level 2 → rooftop arrival → level 3 → win/loss ending → results/leaderboard.

| Moment | Presentation | Proposed copy |
|---|---|---|
| Intro | Aurora PNG, then Matthew PNG | Aurora: “Looking for your cake? You'll have to catch me.” Matthew: “You can keep the candles. I'm taking the cake.” |
| Level 1 | Rooftop heist | “The Gift Vault” |
| Vault reveal | Door opens onto a purple clue | “Nice try. Look up.” |
| Level 2 | Toronto skyline pursuit | “Skyline Chase” |
| Boss arrival | Mage and floating cake | “One last party trick.” |
| Win | Cake returns; Matthew celebrates | “Cake recovered!” |
| Loss | Aurora departs with the cake | “Aurora escaped. The cake remains at large.” |

Use supplied flattened PNGs as comic panels with restrained pan/zoom, dialogue overlays and colour wipes. Do not require cutout reconstruction, independent limb animation or generated cinematic footage. Keep dialogue as HTML text. Retain the Mage hat initially; a crown is optional polish, not a baseline requirement.

## 3. Pacing, HUD and completion

Budget a typical first run at approximately 3–5 minutes after Start, excluding loading and deliberate pauses. Proposed pacing: intro/tutorials/transitions/ending combined 30–45 seconds; level 1 around 55–65 seconds; level 2 around 65–80 seconds; boss around 45–80 seconds for an engaged novice. Validate actual distributions rather than forcing this duration with a hidden loss timer.

Levels 1 and 2 finish by reaching authored route endpoints. Level 3 finishes only on an HP outcome. No automatic cake recovery, secret HP drain or timer-based escape. An inactive or unusually cautious run can exceed five minutes. Predictable boss attacks should make indefinite survival without engagement unlikely, but duration cannot be guaranteed.

HUD:

- Levels 1–2: score, gifts collected, route progress, pause.
- Level 3: clearly labelled Matthew HP and Aurora HP, score, gifts collected, pause.
- No displayed timer. A discrete stage indicator may show 1/3, 2/3, 3/3.
- No player HP in levels 1–2; begin the boss at full HP regardless of earlier collisions.

## 4. Shared controls and simulation rules

- Full play surface accepts pointer input, except explicit UI controls.
- A horizontal swipe moves exactly one lane, clamped to available lanes. Holding or extending the same gesture cannot cross multiple lanes.
- Initial recogniser values: swipe threshold about 24 CSS pixels, horizontal displacement at least 1.5× vertical displacement; tap below about 12 pixels of movement and under 250 ms. Values are tunable for real phones.
- Recognise swipes as soon as the threshold is crossed; recognise taps on release. A swipe cancels the tap for that gesture. Intermediate ambiguous gestures do nothing.
- One active gameplay pointer initially. Secondary touches do not cause extra shots or unexpected movement. Boss design supports alternating one-finger dodges and shots, without requiring multitouch.
- Level 2 attaches on pointer-down and releases on pointer-up; pointer cancellation clears held state.
- Desktop equivalents: left/right arrows or A/D; Space hold/release for level 2; Space press for a boss shot. Ignore keyboard repeat for one-shot actions.
- Prevent scroll, text selection and browser gesture interference on the game surface only. Respect safe areas and preserve usable page controls outside it.
- Fixed 60 Hz simulation with bounded catch-up, separate render updates. Use swept collision checks or equivalent protection against fast projectiles passing through targets.
- Gameplay owns position, collisions, HP and score events. Animations illustrate state and never determine travel distance or scoring.

## 5. Level 1: The Gift Vault

**Layout:** three lanes on a straight rooftop route; camera behind and above Matthew; automatic forward travel. Swipe is the only required action. No jumps or manual camera.

**Initial content:** four gifts, four guard encounters and four static obstacles. Keep each category configurable within the requested 3–5 range. Each guard encounter means one distinct guard, not repeated respawns.

- Gifts occupy optional lanes. A safe route exists through every encounter; collecting a gift can require a riskier lane choice.
- Obstacles are clearly visible crates, vents or barriers, with separate simple colliders.
- Guards have fixed patrols or lane changes with a visible wind-up. No chasing AI, stealth meter or combat. Their styling and patrol timing provide the heist theme.
- Avoid overlapping patterns that require contradictory swipes or leave no reachable safe lane. Start with at least roughly 1.2 seconds of visible reaction time, then test.
- A collision emits one penalty event, briefly flashes the character and applies approximately one second of invulnerability. Forward progress continues; no death, reset, knockback into a previous encounter or forced detour.
- Mark a contacted hazard so remaining in its overlap cannot repeatedly penalise the player.
- A missed gift stays missed. Reach the vault to finish regardless of score or gift count.

**Teaching:** first adjacent-lane gift is an unscored demonstration; hazards begin afterwards. Keep tutorial objects outside the four scored gifts. A bounded demonstration can assist after a short delay so progression does not stall.

## 6. Level 2: Skyline Chase

**Layout:** constrained vertical movement plane with a side-on/slightly oblique camera. Matthew stays left of centre; the next anchor and upcoming hazard must remain visible in portrait. Automatic forward assistance keeps the route moving.

**Initial content:** four scored gifts, four obstacle encounters, and approximately eight authored anchor opportunities. One or two moving hazards can supply enemy-like variation without adding another AI system.

**Grappling rules**

1. Highlight the next eligible anchor within the attachment window.
2. Press and hold to attach to that anchor, regardless of tap location. No precision aiming.
3. Follow a controlled swing trajectory around the anchor. Render a cable from the gadget to the anchor.
4. Release to launch along a bounded trajectory. Preserve forward assistance and cap speeds.
5. A new press is needed for the next anchor. Holding does not chain automatically.
6. If no anchor is eligible, give a small visual cue; a held press may latch when the next eligible window opens. After a completed attachment, release is required before another latch.
7. At the authored maximum arc, safely release automatically if the player continues holding. This prevents an indefinite orbit. Require release/repress to rearm.

These are assisted arcade arcs, not a full rope physics simulation. No cable wrapping, simulated chain links or uncontrolled pendulum states.

**Hazards:** rooftop signs, antenna structures and slow moving drones or magic orbs. Prefer one simple reused moving-hazard model. Gifts sit on reachable arcs with optional timing precision.

**Collision/fall handling:** points penalty and brief visual interruption; no level restart. If Matthew falls below the playable envelope, rescue him quickly to the next safe route point and give temporary protection. Count a collision and its resulting rescue as one incident, not two penalties. Missed gifts remain missed. Reach the destination rooftop to complete the level.

**Teaching:** first attachment is over a safe area. Show “Hold to grapple. Release to fly.” Confirm attachment visibly through cable and anchor feedback. Tutorial gift, if used, is unscored.

## 7. Level 3: The Cake Thief

**Layout:** three lanes, fixed camera behind Matthew facing Aurora. Matthew swipes between lanes; Aurora is always the aim target. Tap fires one confetti shot. No ammo, reload, hold-to-autofire or manual aiming.

**Initial tuning proposal**

| Parameter | Starting value |
|---|---|
| Matthew HP | 5 hearts |
| Aurora HP | 100 |
| Player hit | Lose 1 heart |
| Confetti hit | 5 boss damage |
| Shot cooldown | 300 ms; taps during cooldown ignored |
| Hit protection | About 1 second |
| Boss cycle | About 8 seconds, around 3 seconds visibly vulnerable |
| Gifts | Four once-only scripted opportunities |

Start both characters at full HP. Intro/tutorial is protected and does not permanently damage either character. First real attack has a generous warning.

**Attack patterns:**

- Lane strike: mark one lane with a visible warning shape for around 1–1.2 seconds, then strike it.
- Slow magic projectile: clearly show origin and direction, leaving a reachable escape lane.
- After each attack sequence, Aurora visibly lowers her shield for a firing window. Confetti hitting the raised shield gives a blocked cue and no damage or points.
- At 50% HP, increase cadence modestly. Keep the same patterns and avoid adding controls or unavoidable combinations.
- Do not target lanes based on hidden last-millisecond input. Telegraphs commit to a lane before impact.

Auto-aim shots from every lane at Aurora. Gifts travel toward the player in selected lanes between attack beats; they are optional score opportunities, not healing or mandatory objectives. Spawn them once at scripted fight progression points; no repeat-wave gift farming. They expire if missed. A faster victory may leave gifts uncollected; there is no time bonus to pressure players into rushing.

**Outcomes:** Aurora HP ≤0 produces victory and cake recovery. Matthew HP ≤0 produces loss and cake escape. Proposed simultaneous-hit rule: resolve player projectile damage first; if it defeats Aurora, award victory and cancel remaining damage for that tick. Document this deterministic rule in code.

On outcome, stop collision/damage/score processing immediately, disable gameplay input, clear projectiles and play the appropriate ending. Submit both win and loss runs as completed attempts.

## 8. Scoring and leaderboard

Keep scoring understandable and independent of frame rate. Proposed initial model:

| Event | Points |
|---|---:|
| Scored gift collected | +100 |
| Level 1 or 2 collision/rescue incident | −50 |
| Level 1 or 2 route completed | +200 |
| Boss HP removed | +5 per actual HP removed |
| Victory | +200 |

Each level has a score floor of zero; clamp after each penalty event. No direct boss-hit score penalty: lost HP already threatens the outcome. Cap credited damage at remaining boss HP; never score shield hits or overkill. With four gifts in each level, level maxima are 600, 600 and 1,100; overall maximum is 2,300. Boss weighting is intentional in this draft and reviewable. Earlier suggested 4,500-point scoring is superseded.

No time bonuses, hidden speed ranking or penalties for pausing. No combined-best-level total masquerading as one run.

Leaderboard defaults:

- Overall board: best complete-run score per anonymous player ID. Both outcomes eligible; show a win/loss badge. Rank by score only, so a high-scoring loss can outrank a low-scoring win.
- Level tabs: best score for each level from completed runs. Mark these as personal level bests, distinct from the overall run.
- Equal scores share a rank using competition ranking (1, 2, 2, 4). Stable row ordering does not break the tie.
- Unlimited replays; preserve display name and player ID locally. Duplicate names allowed; a display name is not authentication.
- Suggested name limit: 2–20 characters after trimming, with length enforced consistently; render as plain text, never HTML. No email or password.
- Show total, three level scores, current rank and nearby rows with the player's row highlighted. Allow full leaderboard browsing.

**Backend proposal:** Supabase Postgres plus a server-side submission function, with static site hosting. This remains a stack default to confirm during implementation.

Issue a unique run ID; validate event counts, level order, allowed values, damage limits and scoring version; recompute scores server-side. Make final submission idempotent. Restrict public table writes, rate-limit submissions and keep privileged credentials server-side. Browser-reported events are not authoritative anti-cheat evidence; accept this limitation for a party game.

If connectivity fails, allow local play, persist a pending result, and retry submission with the same run identifier. Do not show a confirmed rank until accepted. Anonymous/offline identifiers and session registration require an explicit backend path; do not pretend offline runs have a server-verified start time. No timing-based cheat validation.

## 9. Loading, tutorials and interruption behaviour

- Landing screen appears quickly with title, name entry and lightweight art. Load assets while the name is entered.
- Enable Start only after essential assets are available. Preload the small complete game and prepare representative materials/scenes before transitions.
- Use real byte progress when known; otherwise named loading stages. Retry preserves the name and successful cached downloads.
- Initial intro 6–8 seconds, short 2–4 second transitions, endings 6–8 seconds. Provide a skip control for story panels; do not let a panel-skip tap leak into gameplay.
- Tutorials are unscored, safe and bounded, with a gesture icon and one sentence. Replays skip the opening story by default and shorten instruction overlays.
- Backgrounding, focus loss or landscape orientation pauses simulation, clears held inputs and freezes cooldowns/telegraphs. Resume explicitly with a brief countdown; level 2 resumes with its rope state intact but requires a fresh hold, avoiding an accidental release penalty.
- No catch-up simulation for time spent away. Show a portrait request in landscape.
- End screen immediately exposes the outcome and score. Score-count animation is skippable. Submission status remains separate from score presentation.
- Replay preserves identity, resets all run state and reuses loaded assets. Pending results retain distinct run IDs across replays.

## 10. Art, source assets and animation mapping

### Selected direction

Use KayKit's hooded Rogue, Mage and Knight; KayKit City Builder Bits; a compact Kenney Blaster Kit model. Original reference images: `matthew.png`, `aurora.png`, and `assets.jpeg`. Treat them as visual references and story art, not 3D-ready source meshes.

Minimum custom work: rigid bandit mask, one hanging-pose adjustment, palette edits, simple grappling cable/hook. Use free gift props if suitable; simple cake, vault door and CN Tower geometry are fallbacks. Retain Mage hat initially. No custom hair, cloth simulation, facial animation or photorealistic likeness work.

### Verified character baseline

Official repository: https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0

Inspected commit: `672074b73ba276876a19e8816ecdc5241817ab47`.

Files under `addons/kaykit_character_pack_adventures/Characters/gltf/`:

| File | Original bytes | Triangles across all meshes | Clips |
|---|---:|---:|---:|
| Rogue_Hooded.glb | 3,597,652 | 6,035 | 76 |
| Mage.glb | 3,589,240 | 5,683 | 76 |
| Knight.glb | 3,659,532 | 6,952 | 76 |

These measurements include accessories and unneeded animations. They are metadata inspection results, not rendered performance validation. Each file has one material but multiple primitives. Embedded PNG textures do not require duplicate standalone copies at runtime. This repository predates the newer itch.io release; pin this baseline or explicitly re-audit a newer version, never silently mix them.

| Actor | Initial animation selection |
|---|---|
| Matthew | Idle, Running_A, Jump_Idle, 1H_Ranged_Aiming, 1H_Ranged_Shoot, Hit_A, Cheer; optional Dodge_Left/Right |
| Aurora | Idle, Spellcast_Raise, Spellcast_Shoot, Hit_A, Death_A |
| Guards | Idle, Walking_A; optional reaction |

No hanging clip was verified. Adapt Jump_Idle or a small static pose; verify arm and cable alignment. Use character-owned embedded clips before adding a separate library. Rogue/Mage contain `handslot.r`, `handslot.l` and `head` attachment nodes. Preserve necessary nodes through pruning.

Source links:

- Current character pack: https://kaylousberg.itch.io/kaykit-adventurers
- Current optional animation pack: https://kaylousberg.itch.io/kaykit-character-animations
- City: https://kaylousberg.itch.io/city-builder-bits
- Blaster: https://kenney.nl/assets/blaster-kit
- Gifts candidate: https://kaylousberg.itch.io/holiday-bits

The selected pack pages describe free CC0 offerings; retain downloaded license files and version records. Exact city, blaster and gift filenames still require inventory selection. Do not claim all paid extras are part of the free tiers.

### Visual consistency

Muted blue/slate environment; Matthew saturated blue/gold; Aurora purple/gold. Matte broad colour areas, restrained metal highlights and readable hazard silhouettes. Recolour selected texture-atlas regions rather than globally tinting skin and clothing together. Shared UV regions may require small UV edits. Keep separate character palettes.

Import GLB/glTF sources; export runtime `matthew.glb`, `aurora.glb`, `guard.glb`, `city.glb`, `props.glb` and resized story images. These are proposed output names. Store asset versions, clip mappings and attachment offsets in a manifest.

## 11. Technical architecture and budgets

Vite + TypeScript + Three.js; plain HTML/CSS overlays. No physics engine or React requirement. Use WebGLRenderer, GLTFLoader, AnimationMixer and SkeletonUtils.clone for independent skinned characters. Use instancing for repeated static meshes where practical, not ordinary InstancedMesh for independently animated guard skeletons.

Small modules: input recogniser, run/state machine, level controllers, collision helpers, scoring reducer, presentation adapters, asset loader, UI and score API client. Avoid an elaborate custom engine or ECS. Level content lives in editable configuration.

States: landing/loading → intro → level tutorial/playing/transition → boss resolution → ending → results. Pause is an overlay state preserving the current simulation. Own scene resources and event subscriptions explicitly; replay must not accumulate handlers, meshes or mixers.

Build pipeline: select → prune accessories/clips → recolour → resize textures → export → validate → measure → optionally compress. Start without Draco/KTX2; add Meshopt only if net savings justify decoder cost. GLB is packaging, not automatic compression. Use glTF Transform for pruning, deduplication and animation resampling; preserve attachments and verify deformation after optimisation.

| Initial engineering budget | Target, not a guarantee |
|---|---|
| Complete cold transfer | ≤5 MB preferred; reconsider after measurement |
| Production JS/CSS, compressed | ≤500 KB |
| Characters, combined transferred bytes | ≤2 MB after optimisation |
| City/props, transferred bytes | ≤2 MB |
| Story/UI images | ≤500 KB |
| Character palette resolution | Start at 256×256 and inspect |
| Visible geometry | Aim below 150k triangles |
| Draw calls | Aim below 100 in busiest scene |
| Pixel ratio | Cap at 1.5 initially; reduce on weaker devices |
| Frame rate | Aim 60 FPS; stable playable 30 FPS on weakest supported phone |

Transferred bytes differ from decoded CPU/GPU memory. Measure load/parse time and texture residency as well as file size. Reuse character and environment resources across levels; dispose truly unused resources without destroying shared assets.

Start with hemisphere + directional light, simple grounding shadows and no bloom/postprocessing. Cap particles; confetti is decorative, never a set of physical damage objects. Keep debug inspection tools out of production bundles.

## 12. Phased delivery and acceptance gates

### Phase 0: Repository and minimal device baseline

Create Vite/TypeScript/Three.js project, portrait frame, pointer input, fixed-step loop, simple HUD and deployable static build. Verify on real iPhone Safari and Android Chrome. Add keyboard controls for development.

Gate: correct sizing/safe areas, no game-surface scrolling, pause/resume works, primitive scene responds correctly at different frame rates.

### Phase 1: Early asset feasibility check

Import one pinned Rogue and Mage outside the main gameplay build. Play selected clips, attach a blaster, test palette edits and hanging pose at gameplay camera distance. Inspect city/blaster/gift inventories and freeze exact source filenames. Keep most gameplay work on primitives.

Gate: correct animation, skinning, orientation, attachments and readable phone-scale silhouette. Record source licenses/version and real asset metrics. Resolve failures before investing in final presentation.

### Phase 2: Full primitive game

Implement all three levels using capsules/boxes/coloured primitives. Include fixed encounters, anchor selection, assisted swing/recovery, boss shields/attacks, gifts, HP outcomes and transitions. Use stub story/result panels. Emit gameplay events now; full score UI and backend can follow.

Gate: complete first-time playthrough and both boss outcomes; no level 1/2 reset; no visible timer; no deadlocks; no unavoidable authored hazard sequence. Informal novice playtests establish pacing and controls. Do not polish level 1 while levels 2/3 are still absent.

### Phase 3: Scoring, persistence and leaderboard

Implement pure score rules, display-name/player identity, run IDs, backend validation and idempotent submission. Add overall/level boards, ties, best-run selection, offline pending state and retry. Confirm deployment/backend choices.

Gate: correct maximums and penalties, no duplicate collectibles/overkill credit, retry produces one result, loss runs submit, refresh/replay preserves identity and pending scores, no client secret exposure.

### Phase 4: Approved assets and presentation

Replace primitives through visual adapters without changing colliders or gameplay timings. Add comic PNG intro, bounded tutorials, vault reveal, skyline, boss telegraphs, distinct endings and results presentation. Select a minimal set of static meshes; prune and optimise exports.

Gate: controls remain readable under thumbs; both HP displays are clear; shots, shield blocks and damage are distinguishable without sound; transitions do not stall; presentation stays within measured device budgets.

### Phase 5: Balance and release readiness

Test novice and repeat play, repeated runs, mobile data/cold load, network loss, app switching, rotation, focus loss and small/tall portrait screens. Tune actual first-run duration and boss difficulty; accept that idle/paused runs can exceed the duration target. Add reduced-motion behaviour for shake/zoom/confetti.

Gate: complete runs on target iPhone/Android devices, no accumulating resources after replays, submission recovery works, both endings reproducible, QR opens the stable HTTPS URL. Freeze gameplay/scoring version for party rankings; keep test scores separate and explicitly reset only the test event. Smoke-test the deployed build, not just localhost.

## 13. Focused validation and debug tools

Developer panel: jump to level, restart level, reset run, show colliders/anchor windows, set HP, force win/loss, log score events, toggle invulnerability and view frame timing/draw calls. Ensure debug results cannot enter the party leaderboard.

Focused automated checks: gesture tap/swipe separation and cancellation; scoring caps and incident deduplication; boss terminal-state/tie rule; valid state transitions; submission idempotency and best-score ranking. Browser automation can smoke-test load/name/start/results; real-device touch and first-player usability require manual testing.

Key risks: portrait swing look-ahead, gesture misclassification, repeated collision penalties, late asset incompatibility, atlas recolouring affecting skin, first-use rendering stalls, hidden difficulty changes between frame rates, and replay resource leaks. Each has an explicit gate above.

## 14. Items requiring review, not blockers to this draft

- Working title and dialogue; any personal jokes.
- Confirm proposed 4/4/4 level 1 content, level 2 four gifts/four hazards/eight anchors, and four boss gifts.
- Approve or tune the proposed scoring weights, HP/damage/cooldown and vulnerability cycle.
- Confirm score-only ranking across wins and losses, unlimited retries and best-run identity per browser.
- Confirm KayKit City Builder Bits as the city pack, exact prop variants and Mage hat retention.
- Confirm Supabase/static hosting, party date, expected player count and weakest supported phone before release sizing.

No hard five-minute cutoff, healing pickups, audio, multiplayer synchronisation, open-world exploration, free camera, advanced rope physics or custom character rigging is included in this scope.
