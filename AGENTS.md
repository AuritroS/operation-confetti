# Working in this repository

All three levels live on `main` in this single checkout. The parallel-worktree
arrangement that built Level 3 is finished and removed; `docs/COLLABORATION.md`
is kept as the record of how it ran and merged, not as live instruction.

Read `design.md`, `design-level2.md` and `design-level3.md` for each level's
build order, decisions and evidence.

## Architecture

- **Data** declares lane geometry, timings, attack sequences and stable IDs —
  `src/levels/boss/config.ts` and `patterns.ts` are the pattern to follow.
- **Simulation** owns HP, cooldowns, phase, projectiles, contact and terminal
  outcomes. No DOM and no three.js imports in a runner.
- **Presentation** reads snapshots and events. Decorative geometry never
  changes a collision, and an animation ending must never apply damage, open a
  shield or award a point. Telegraph visuals use the same committed target and
  the same time bounds as the damage they predict.
- **Composition** (`src/level2.ts`, `src/level3.ts`) wires input, loop,
  simulation, scoring, scene and UI together. Combat rules do not live there,
  and they never live in CSS.

## Things that bite

- `src/core/scoring.ts` is shared with the Worker, which recomputes every run
  authoritatively. A client-side score that disagrees with `scoreRun` is a bug,
  and the reducer's clamps — gift caps, overkill, events after an outcome —
  are the contract, not suggestions.
- `public/models/`, `public/story/` and `.asset-index.json` are generated and
  gitignored, so they do not arrive with a clone. Build them before trusting a
  test run: a missing GLB fails as `ENOENT`, not as a useful message.
- Source packs under `assets/` are tracked and are the inputs to that build.
- Review tooling writes into `tools/shots/` and takes an explicit base URL.
  Check what a script does before running it; some rebuild assets.

## Looking at things

| URL | Shows |
| --- | --- |
| `/` | The campaign: all three levels in sequence |
| `/?tutorial=N` | The campaign opened at level N with its tutorial sheet up — the only way to review a sheet without playing the levels before it |
| `/?level=1`, `/?level=2` | A single level's standalone review page, skipping the rehearsal |
| `/level3.html` | The boss fight alone, with `?debug` for the cue harness |
| `/?layers=all`, `?layers=clutter` | Level 1 environment layers; the default omits layers that are review-only |
| `/?start=400` | Fast-forward level 1's standalone page, for looking at its ending |

Captures: `tools/shots/campaign/` for gameplay framing, `story-reference/` for
asset plates.

## Habits

- Inspect the changed-file list before every commit.
- Record evidence against a gate — what was checked, at what viewport, and what
  is still open — rather than asserting a layer is done.
- Automated browser capture is layout and legibility evidence. It is never
  performance evidence and never a substitute for a real device.
