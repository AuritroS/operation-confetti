# Parallel collaboration: Level 2 and Level 3

Recorded 5 November 2026. This is the coordination contract for parallel work,
not a claim that both agents have acknowledged it.

## Current state and setup

- Original checkout: `/Users/auritrosami/Downloads/matthew-game`, branch `main`.
- Claude is working on Level 2 with uncommitted changes. Leave that checkout in place.
- Level 3 baseline selected for setup: `0081761`. No uncommitted Level 2 changes
  should be copied into the Level 3 checkout.
- **Worktree verified:** `.worktrees/level3`, branch `codex/level3`, at `0081761`.
  The user created it after this session's Git metadata writes were blocked.
  `git worktree list` confirms both checkouts; the Level 3 checkout was clean
  before adding the collaboration documents. Claude's uncommitted changes are
  absent from it. Ports 5303 and 5403 were free at verification.
- No Level 3 gameplay or dev server has been started yet.
- Dependencies are prepared independently. Registry access blocked `npm ci`, so
  setup verified identical lockfiles and made a filesystem copy of the existing
  installed dependencies into the new worktree. No dependency symlink points
  outside that directory; copied Vite/tool caches were cleared. Future installs
  should use `npm ci` when registry access is available.
- **Baseline check:** `npm run typecheck` fails at unchanged commit `0081761`
  with 13 diagnostics in `src/level2.ts` and `src/render/skyline-scene.ts`
  (narrowed entity types, unused imports and removed scene properties). These
  predate Level 3 work. Track them separately; their repair belongs to the
  Level 2 stream/integration, not a silent Level 3 edit.

From the original checkout:

```sh
git worktree add .worktrees/level3 -b codex/level3 0081761
```

The nested location stays inside this workspace's writable root. `.worktrees/`
is ignored so the parent checkout cannot accidentally stage the second checkout.
Do not switch the branch of the original checkout.

Planning docs are uncommitted and do not automatically appear in new worktrees.
`AGENTS.md`, `docs/COLLABORATION.md` and `design-level3.md` are copied into the
Level 3 checkout during setup. The original copies stay available to Claude;
consolidate duplicate docs when integrating. Track future Level 3 design progress
in the Level 3 worktree's `design-level3.md`.

## Ownership

| Stream | Owned paths | Development origin |
| --- | --- | --- |
| Claude / Level 2 | `src/level2.ts`, `src/level2.css`, `src/levels/skyline/**`, `src/render/skyline-*.ts`, `src/core/skyline-swipe-input.ts`, Level 2 tests/tools and `design-level2.md` | Existing servers on 5173 and 5200 are occupied; ownership was not independently verified. Leave both alone. |
| Codex / Level 3 | `level3.html`, `src/level3.ts`, `src/level3.css`, `src/levels/boss/**`, `src/render/boss/**`, `src/assets/boss/**`, `tests/boss-*.test.ts`, `tools/boss-*.mjs`, `public/models/level3/**`, `design-level3.md` | Proposed Vite 5303; preview 5403 |
| Coordinated integration | `src/entry.ts`, `src/main.ts`, shared `src/core/**`, shared assets/loaders, global styles, package files, Vite config, shared asset builders, Worker/backend and campaign UI | One named owner per change |

Claude already has changes in shared asset tooling (`tools/build-assets.mjs`
and `tools/recolour.mjs` were dirty during inspection). Codex must not modify
those during parallel Level 3 work. Extend assets through Level 3 tooling with
Level 3 output paths, then consolidate the pipeline at integration.

Level 2 later committed its new Matthew export and cannon attachment in
`4b5d989`. At the user's request, Level 3 copied **the exact committed**
`tools/recolour.mjs` into its older worktree so its asset builder regenerates
the same unhooded Matthew with curls. The generated `matthew.glb` hashes match.
Level 3 did not edit the copied tool. The mount values are recorded in its own
asset catalog; the shared manifest remains on the older baseline in this
worktree. Integration should recognize the recolour-tool change as the same
Level 2 change, not an independent divergence.

## Isolation beyond Git

Each worktree needs its own `node_modules`, generated assets, Vite cache,
`dist`, screenshots and temporary files. Do not symlink writable build outputs
or dependencies between checkouts. Run `npm ci` inside the new worktree.

Source packs are tracked and arrive with the checkout. `public/models/`,
`public/story/` and `.asset-index.json` are ignored and do not. Generate assets
inside the worktree using its committed pipeline, then add Level 3 exports via
its own builder. Do not treat Claude's live generated files as stable inputs.
Record source paths, versions and build commands so exports are reproducible.

Inspect tooling before execution: some review utilities may assume port 5173,
write fixed screenshot locations or update assets. Level 3 review tooling must
receive an explicit base URL and write only in its own checkout.

## Ports and service boundaries

At inspection, 5173 and 5200 were listening. 5303 and 5403 were not shown as
occupied; this is an observation, not an OS reservation. Check again at launch:

```sh
lsof -nP -iTCP:5303 -sTCP:LISTEN
npm run dev -- --host 127.0.0.1 --port 5303 --strictPort
```

Run these from `.worktrees/level3`. Strict binding must fail if occupied; stop
and choose/document another free port rather than killing a process. Preview,
when needed, uses `npm run preview -- --host 127.0.0.1 --port 5403 --strictPort`.

Level 3 will use `/level3.html`, importing its own controller. **The page does
not exist yet.** Do not edit shared entry routing merely to view the prototype.
The existing production Vite input list excludes this page; adding it to the
campaign/production build is a later integration change.

Existing Vite config proxies `/api` to port 8787. A separate Vite port does not
isolate the backend. Keep the Level 3 prototype local-only: no score submission,
database writes, migrations, deployment or tunnel reconfiguration. If backend
testing becomes necessary, give it a separate test instance and explicit ports.

## Structural adherence

1. **Data:** `src/levels/boss/config.ts`, `types.ts`, and `patterns.ts` define
   lane geometry, timings, attack sequences and stable entity IDs.
2. **Simulation:** `runner.ts` owns HP, cooldowns, phase, projectiles, contact,
   gift resolution and terminal outcomes. No DOM, Three.js or render imports.
3. **Presentation:** `src/render/boss/**` reads snapshots and events. Decorative
   geometry never changes collisions. Telegraph visuals use the same committed
   targets and time bounds as damage resolution.
4. **Assets:** `src/assets/boss/**` maps approved roles to exact sources,
   transforms, bounds, materials, clip substitutions and runtime exports.
5. **Composition:** `src/level3.ts` connects input, fixed loop, simulation,
   scoring, scene and UI. Keep combat rules out of this file and out of CSS.

Reuse stable shared input, lane and scoring APIs without edits. If a mismatch
appears, record it and use a Level 3 adapter where appropriate. Avoid importing
Level 2 internals or cloning large shared modules. A necessary shared API change
gets one owner, a narrow commit and both callers checked before adoption.

For every slice, inspect `git diff --name-status 0081761` plus untracked files
against the ownership table. Inspect imports for simulation/presentation boundary
violations. During implementation add focused checks for meaningful invariants:
gesture separation, fair escape paths, collision/telegraph agreement, once-only
events, pause/replay and terminal outcomes. A clean build alone is insufficient.

Record the commit, changed paths, completed gate, relevant automated checks,
viewport/device evidence, known issues and next gate in the Level 3 handoff.
Do not label automated browser performance as real-phone performance.

## Integration

- Each stream commits only its owned work. Do not stage the original checkout
  wholesale. No cross-stream stash, reset, clean, force push or process cleanup.
- Keep the branch based on the pinned commit while developing; do not repeatedly
  absorb Claude's in-progress changes. Coordinate any needed stable dependency.
- After both streams have stable commits, integrate in a separate checkout.
  Resolve shared changes deliberately; never use blanket “ours/theirs”.
- Integrate entry routing, Level 2 → 3 transition, campaign score events, asset
  build and production inputs as one reviewed follow-up. Standalone boss attempts
  must not be submitted as completed campaign runs.
- Run typecheck, relevant and full tests, production build, both level entry
  smoke checks and the full campaign flow. Verify production asset URLs, both
  boss outcomes, replay, score maximums and mobile interaction before merging.

## Cross-stream handoff

Before relying on shared edits, record: owner, affected paths/API, purpose,
commit or patch, checks performed, and when the other stream can consume it.
The user can point Claude to this document; Codex has not messaged Claude or
assumed acknowledgment.
