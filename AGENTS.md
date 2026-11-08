# Working in this repository

All three levels live on `main` in this single checkout. The parallel-worktree
arrangement that built Level 3 is finished and removed; `docs/COLLABORATION.md`
is kept as the record of how it ran and merged, not as live instruction.

Read `docs/DESIGN.md`, `docs/DESIGN_LEVEL2.md` and `docs/DESIGN_LEVEL3.md` for each level's
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
| `/?story=<id>` | One comic panel, held up for review. Ids: `title`, `intro`, `vault`, `chase`, `rooftop`, `win`, `loss` |
| `/?review=story` | The whole comic in order with the real page turns and iris, a stand-in card where each level would play, then the results card. Skip is ignored |
| `/?review=chrome` | Every non-level screen in order: loader, cover and name, tutorial sheet, pause, results (win, loss), board, rotate prompt. Each is left by its own button |
| `/?results=win`, `/?results=loss` | The end-of-run card with a sample score, and the leaderboard behind it. Presentational only: no level is mounted and nothing is submitted |
| `/?level=1`, `/?level=2` | A single level's standalone review page, skipping the rehearsal |
| `/?ending=1`, `/?ending=2` | The campaign dropped into that level five seconds before its finish: run-up, arrival, door, iris, chapter card. `&loop` replays the ending each time it finishes; `&closeup` (level 2) keeps the camera tight on Matthew. `tools/shoot-endings.mjs` captures the same route as a frame strip |
| `/?perf` | Any route, with a chip at the bottom: fps, the lowest second so far, dropped simulation steps. Logged every ten seconds too |
| `/level3.html` | The boss fight alone, with `?debug` for the cue harness |
| `/?layers=all`, `?layers=clutter` | Level 1 environment layers; the default omits layers that are review-only |
| `/?start=400` | Fast-forward level 1's standalone page, for looking at its ending |

Captures: `tools/shots/campaign/` for gameplay framing, `story-reference/` for
asset plates. `node tools/shoot-story-pass.mjs` photographs both review routes
at two phone widths into `tools/shots/story-pass/` (ignored; regenerate it)
and records the story route as `story-review.mp4`.

Other captures: `tools/shoot-endings.mjs <1|2>` (a level's last seconds as
a frame strip), `tools/shoot-hud.mjs` (reward, hit, present row, boss
readouts), `tools/shoot-level1.mjs <tag> [query]` (three route positions,
two widths). All write under `tools/shots/`, which is ignored.

The comic's script, storyboard, image prompts and budget are in
`docs/STORY_PASS.md`; the level polish pass and its evidence are in
`docs/POLISH_PASS.md`. `src/story/script.ts` maps each panel to its image and
marks which are still placeholders.

## CI

`.github/workflows/checks.yml` runs on every pull request and push to
`main`: install from the lockfile, build the runtime assets, typecheck, unit
tests, route solver, scene audit, production build, then Chromium for the
campaign gate and the swing review. `deploy.yml` runs on `main` after the
checks pass and waits for approval in the `production` environment before
`wrangler deploy`. The Worker's secrets live in Cloudflare; CI holds only
the account id and an API token. Open pull requests rather than pushing to
`main`; the branch is protected.

## Habits

- Inspect the changed-file list before every commit.
- Record evidence against a gate — what was checked, at what viewport, and what
  is still open — rather than asserting a layer is done.
- Automated browser capture is layout and legibility evidence. It is never
  performance evidence and never a substitute for a real device.
