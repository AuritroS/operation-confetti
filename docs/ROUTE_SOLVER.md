# Skyline route verification

The scene still owns encounter placement in `src/levels/skyline/scene.ts`.
`course.ts` derives the entities; `solve.ts` searches those entities and
replays candidate input schedules through the production `SkylineRunner`.
There is no hand-maintained review route.

```sh
npm run check:scene  # existing geometric audit
npm run check:route  # generate a route, replay it, report timing probes
npm run check:swing  # drive that generated route with real browser gestures
npm test
npm run build
```

`check:route` exits unsuccessfully if it cannot find a verified route.
`check:swing` solves before building, then checks that the bundled course is
identical to the solved course. Search runs offline, outside the player bundle.

## What a solved route establishes

- The runner completes the course and collects every scored gift.
- No hazard is touched, including contacts hidden by damage protection.
- Scoring produces no violations. The shared rules still cap scored gifts
  at four; changing that cap is a separate scoring decision.
- Replay succeeds at 120 Hz, at the game's 60 Hz cadence, and at 60 Hz with
  input delivery polled every 50 ms, matching the browser route driver.

The browser review additionally checks actual touch input, score display,
collected entity IDs, projected visibility, workload, pause/replay and Level 1.
Queued-launch and damage scenarios are located by simulation against the
current course. If a redesigned course offers no suitable scenario, the tool
prints an explicit skip; isolated runner tests continue to cover the mechanics.

## Search limits and timing reports

The planner models six settled states: three lanes times run/swing. It retains
eight paths per ending state per beat, considers both lane-first and mode-first
sequences, and tries four departure delays. Costs come from executing the same
swipe sequence through `Motion` at sixteen sampled start phases. Crossing two
lanes uses two strokes separated by 0.25 seconds, including the actual motion
redirection. Costs are cached only within a solve, so course edits cannot leave
a stale cache.

Transitions, deferred launches and swept collisions can invalidate a graph
path. The runner rejects those schedules and the search tries alternatives.
This is a bounded search: **unsolved does not mean impossible**. It may miss
routes that require different timing, a pruned path, or remaining in transition
at an encounter. A solved route also does not certify every possible input.

The graph slack is a planning estimate using the initial 0.4-second departure
allowance. It ranks candidates; it is not the amount by which a swipe can be
late, an analytic bound on movement duration, or a measure of human fairness.

`check:route` separately shifts each non-starting input earlier and later in
0.1-second increments, up to 0.5 seconds. It stops at the first failed replay
or an offset that would reorder inputs, and reports that stopping reason.
It also runs sixteen reproducible trials that perturb all non-starting inputs
by up to ±0.1 seconds. These sampled experiments do not certify untested
combinations or human play. Their results are diagnostic rather than a new
difficulty threshold.

## Boundary with course design

This completes route generation and its review integration against the existing
course. Asset selection, new placement, full-course design inspection and the
remaining rendered-art-versus-collider audit work are separate from the solver.
Geometry, readability, phone performance and fun still need their own checks
and play review after the redesign.
