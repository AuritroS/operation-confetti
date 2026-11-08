# Operation Confetti — settled tech spec

Companion to `docs/DESIGN.md`. That document proposes; this one records what is
**decided and implemented**, and what is still genuinely open.

Date: 3 November 2026 · Scaffold: Phase 0 complete, unverified on device

---

## 1. Stack — settled

| Area | Decision | Why |
|---|---|---|
| Build | Vite 6 + TypeScript 5.7 (strict) | Design doc §11 |
| Render | Three.js 0.180, WebGLRenderer | No physics engine, no React |
| Overlays | Plain HTML/CSS | Dialogue and HUD stay as text |
| Host | **Cloudflare Worker with static assets** | One origin for page + API |
| Data | Supabase Postgres via PostgREST | Reached only from the Worker |
| Domain | `operation-confetti.auritro.com` | Custom domain in `wrangler.toml` |
| Tests | Vitest (node + jsdom per file) | §13 focused checks |

### Why a Worker rather than Cloudflare Pages + Supabase Edge Functions

The design doc left this as "a stack default to confirm". Settled on a single
Worker because it:

- puts the page and `/api` on **one origin**, so there is no CORS surface and
  no preflight latency on submission;
- keeps the **service-role key server-side** as a Worker secret, satisfying the
  Phase 3 gate "no client secret exposure";
- needs **no Docker and no Supabase CLI** — Edge Functions would require both
  locally, for one endpoint;
- deploys the whole thing with one `npm run deploy`.

Supabase is used purely as a database. No Supabase client library ships to the
browser, and no anon key is needed at all.

### Security model

Row Level Security is **enabled with no permissive policies**, and `anon` /
`authenticated` are explicitly revoked from every table and view. A leaked anon
key therefore grants nothing. Every read and write goes through the Worker,
which holds the service-role key and bypasses RLS.

---

## 2. Scoring — settled and enforced

Implemented as a pure reducer in `src/core/scoring.ts`, imported by **both** the
browser (display) and the Worker (authoritative recompute). The client's claimed
totals are never stored; only its event stream is, and the Worker rejects a
stream whose invariants do not hold.

| Event | Points |
|---|---:|
| Scored gift | +100 |
| Level 1/2 collision or rescue incident | −50 |
| Level 1/2 route completed | +200 |
| Boss HP actually removed | +5 per HP |
| Victory | +200 |

Maxima: **600 / 600 / 1100**, total **2300** — asserted by a test, not assumed.

Invariants enforced in the reducer:

- each level clamps to a floor of zero **after every penalty**, so event order
  cannot produce a negative carry;
- gifts beyond four per level are ignored, so a duplicate pickup cannot inflate;
- boss damage is capped at remaining HP and at the per-shot maximum, so overkill
  and shield hits credit nothing;
- a route completes at most once;
- all scoring stops at the terminal state, and the §7 simultaneous-hit rule
  resolves in the player's favour (victory lands, the same-tick defeat is
  dropped);
- an unfinished stream reports `incomplete` and the Worker returns 422.

Submission is **idempotent on the client-issued run ID** — the run ID is the
primary key, inserted with `on_conflict=id` / `resolution=ignore-duplicates`, so
a retry resolves to exactly one row.

Ranking uses SQL `rank()` for competition ranking (1, 2, 2, 4), over the best
run per player, ordered by score only. A high-scoring loss can outrank a
low-scoring win, as specified. Test runs are segregated by an `is_test` flag
with their own board, and `reset_party_scores()` clears only real runs.

---

## 3. Assets — the pinned baseline changed

**This is the most important finding of setup.** The local pack is **KayKit
Adventurers 2.0 FREE**, not the 1.0 GitHub commit the design doc audited in
§10. They are materially different, and the doc warns against silently mixing
them. The 2.0 baseline is now pinned in `src/assets/manifest.ts`.

### Measured, not estimated (`npm run assets:inspect`)

| File | KB | Triangles | Clips | Attach nodes |
|---|---:|---:|---:|---:|
| Rogue_Hooded.glb | 372 | 7,185 | **0** | 3 |
| Mage.glb | 344 | 6,668 | **0** | 3 |
| Knight.glb | 334 | 5,800 | **0** | 3 |
| Rig_Medium_General.glb | 809 | 6,916 | 15 | 3 |
| Rig_Medium_MovementBasic.glb | 673 | 6,916 | 11 | 3 |
| blaster-f.glb | 71 | 768 | 0 | — |

Differences from the doc's §10 audit:

1. **Character GLBs are ~10x smaller** (372 KB vs 3.6 MB) because 2.0 strips the
   embedded animations.
2. **Characters contain zero animations.** The doc's instruction to "use
   character-owned embedded clips before adding a separate library" is not
   possible on this baseline. All clips come from the two `Rig_Medium` libraries.
3. **Only 26 clips exist**, not 76.

### De-risked: retargeting is a non-issue

All five skinned files share an **identical 23-joint `Rig_Medium` skeleton**,
verified by exact joint-name comparison. Clips therefore transplant onto any
character with no retargeting layer — three.js resolves animation tracks by node
name. `src/assets/characters.ts` merges both libraries into one shared clip map
and plays any clip on any actor.

`handslot.r`, `handslot.l` and `head` are present on every character, so the
blaster attaches as the doc assumed.

### Not de-risked: six clips do not exist in the free tier

The design doc's preferred clips are **absent** from 2.0 FREE. Substitutions are
in the manifest, each marked `SUBSTITUTE`, and all need a visual sign-off:

| Role | Doc wanted | Substitute | Confidence |
|---|---|---|---|
| Matthew shoot | `1H_Ranged_Shoot` | `Throw` | Medium — a throw, not a trigger pull |
| Matthew aim | `1H_Ranged_Aiming` | `Idle_B` | Low — no aiming pose at all |
| Matthew win | `Cheer` | `Jump_Full_Short` | Medium — reads as a celebratory hop |
| Matthew hang | (none verified) | `Jump_Idle` | Medium — doc already expected this |
| Aurora cast raise | `Spellcast_Raise` | `Use_Item` | Medium |
| Aurora cast shoot | `Spellcast_Shoot` | `Throw` | Medium |

Available clips in full — General: `Death_A`, `Death_A_Pose`, `Death_B`,
`Death_B_Pose`, `Hit_A`, `Hit_B`, `Idle_A`, `Idle_B`, `Interact`, `PickUp`,
`Spawn_Air`, `Spawn_Ground`, `T-Pose`, `Throw`, `Use_Item`. MovementBasic:
`Jump_Full_Long`, `Jump_Full_Short`, `Jump_Idle`, `Jump_Land`, `Jump_Start`,
`Running_A`, `Running_B`, `Walking_A`, `Walking_B`, `Walking_C`.

### Budget outlook

Staged unoptimised total is 7.9 MB, dominated by the two story PNGs (5.3 MB) and
the animation libraries' unused mannequin mesh (1.4 MB). Both are addressed by
`npm run assets:build`:

- story PNGs → 900px WebP, expected ~200 KB combined (vs a 500 KB budget);
- animation libraries → pruned of all meshes and textures, keeping only clips
  and the skeleton, expected ~200 KB combined.

Projected cold transfer lands around **1.5 MB before compression**, comfortably
inside the 5 MB preference. Draco and KTX2 stay off, as specified.

City pack: 41 glTF files are available and inventoried, but **no prop selection
has been made** and nothing from it is staged. It is OBJ/FBX/glTF with a single
shared 1024² atlas, which suits instancing well.

---

## 4. Phase 0 scaffold — what exists

`src/main.ts` is a deliberately primitive vertical slice that exercises every
piece of environment risk at once:

- portrait frame using `100dvh` and `env(safe-area-inset-*)`;
- a dedicated `#surface` element carrying `touch-action: none` so **only** the
  gameplay area suppresses browser gestures, leaving UI controls normal;
- `FixedLoop` — 60 Hz simulation, max 5 catch-up steps per frame, backlog
  discarded rather than drifting, accumulator cleared on stop so backgrounded
  time is never simulated;
- `InputRecogniser` — 24 px / 1.5× swipe, 12 px / 250 ms tap, swipe fires on
  threshold and cancels the tap, one active pointer, hold/release for grapple,
  keyboard parity with auto-repeat ignored;
- `LaneRunner` — one lane per swipe, clamped, with render-only smoothing so
  collisions read the logical lane;
- `Lifecycle` — pause on hide/blur/landscape, explicit resume, held inputs
  cleared;
- a live `/api/health` round trip shown in the HUD.

`probe.html` is the Phase 1 harness: loads Rogue_Hooded and Mage, transplants
every clip, attaches the blaster, and exposes a button per clip at gameplay
camera distance.

### Not yet built

Levels 1–3, story panels, name entry, leaderboard UI, tutorials, endings.
Phase 0's gate has **not** been verified on a real device yet — that is the
immediate next step and it needs `npm install` to have run.

---

## 5. Open decisions

| # | Decision | Default if unanswered |
|---|---|---|
| 1 | Accept the substitute clips, or source more animations? | Accept substitutes |
| 2 | Keep Aurora's Mage hat, or add a crown? | Keep the hat (doc baseline) |
| 3 | City prop selection for rooftops, skyline and vault | Pick during Phase 4 |
| 4 | Which blaster variant (18 available; `blaster-f` provisionally staged) | `blaster-f` |
| 5 | Party date, expected player count, weakest supported phone | Unset |
| 6 | Confirm 4/4/4 content counts and the proposed HP/damage tuning | Doc defaults |

Deferred as specified: audio, multiplayer, rope physics, custom rigging.
