import { describe, expect, it } from 'vitest';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import { HALF_DEPTH, type LevelConfig, type RouteEntity } from '../src/levels/types';
import { scoreRun, POINTS } from '../src/core/scoring';
import { STEP_S } from '../src/core/loop';

/** Minimal level for isolating one behaviour at a time. */
function level(entities: RouteEntity[], over: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 1,
    laneCount: 3,
    laneWidth: 1.6,
    routeLength: 100,
    forwardSpeed: 7.5,
    invulnerabilitySeconds: 1,
    entities,
    ...over,
  };
}

const gift = (z: number, lane: number, scored = true): RouteEntity => ({
  id: `g${z}`,
  kind: 'gift',
  z,
  lane,
  scored,
});
const crate = (z: number, lane: number): RouteEntity => ({
  id: `o${z}`,
  kind: 'obstacle',
  z,
  lane,
  scored: false,
});

/** Run until complete, or until a step budget is exhausted. */
function runToEnd(r: LevelRunner, maxSteps = 20_000): number {
  let steps = 0;
  while (!r.isComplete && steps < maxSteps) {
    r.update(STEP_S);
    steps++;
  }
  return steps;
}

describe('travel and completion', () => {
  it('completes by reaching the route end and emits routeComplete once', () => {
    const r = new LevelRunner(level([]));
    runToEnd(r);
    expect(r.isComplete).toBe(true);
    expect(r.events.filter((e) => e.t === 'routeComplete')).toHaveLength(1);
  });

  it('takes the distance divided by the speed, in seconds', () => {
    const r = new LevelRunner(level([], { routeLength: 75, forwardSpeed: 7.5 }));
    const steps = runToEnd(r);
    // 75 / 7.5 = 10 seconds = 600 steps, give or take the final partial step.
    expect(steps).toBeGreaterThanOrEqual(599);
    expect(steps).toBeLessThanOrEqual(601);
  });

  it('stops advancing and ignores swipes once complete', () => {
    const r = new LevelRunner(level([]));
    runToEnd(r);
    const before = r.snapshot.travelled;
    expect(r.swipe(1)).toBe(false);
    r.update(STEP_S);
    expect(r.snapshot.travelled).toBe(before);
  });

  it('reports progress from zero to one', () => {
    const r = new LevelRunner(level([]));
    expect(r.snapshot.progress).toBe(0);
    runToEnd(r);
    expect(r.snapshot.progress).toBe(1);
  });
});

describe('gift collection', () => {
  it('collects a gift in the occupied lane and scores it once', () => {
    const r = new LevelRunner(level([gift(40, 1)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'gift')).toHaveLength(1);
    expect(r.snapshot.giftsCollected).toBe(1);
  });

  it('misses a gift in another lane, and a missed gift stays missed', () => {
    const r = new LevelRunner(level([gift(40, 0)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'gift')).toHaveLength(0);
    expect(r.tracked[0]?.state).toBe('missed');
  });

  it('cannot award the same gift twice while inside the overlap', () => {
    // A very slow route keeps the player inside the window for many steps.
    const r = new LevelRunner(level([gift(10, 1)], { forwardSpeed: 0.5, routeLength: 20 }));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'gift')).toHaveLength(1);
  });

  it('does not score an unscored tutorial gift, but still collects it', () => {
    const r = new LevelRunner(level([gift(40, 1, false)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'gift')).toHaveLength(0);
    expect(r.tracked[0]?.state).toBe('collected');
    expect(r.snapshot.giftsTotal).toBe(0);
  });
});

describe('obstacle penalties', () => {
  it('emits exactly one incident per hazard struck', () => {
    const r = new LevelRunner(level([crate(40, 1)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(1);
    expect(r.snapshot.incidents).toBe(1);
  });

  it('cannot bill twice for one hazard while still overlapping it', () => {
    const r = new LevelRunner(level([crate(10, 1)], { forwardSpeed: 0.5, routeLength: 20 }));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(1);
  });

  it('passes an obstacle in another lane with no penalty', () => {
    const r = new LevelRunner(level([crate(40, 2)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(0);
  });

  it('never fails the level or stops forward progress on a hit', () => {
    const r = new LevelRunner(level([crate(40, 1)]));
    runToEnd(r);
    expect(r.isComplete).toBe(true);
    expect(r.snapshot.progress).toBe(1);
  });
});

describe('invulnerability', () => {
  it('suppresses a second penalty inside the protection window', () => {
    // 7.5 u/s means 7.5 units per second; two crates 3 units apart are struck
    // 0.4s apart, inside the 1s window.
    const r = new LevelRunner(level([crate(40, 1), crate(43, 1)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(1);
    // Both are still marked struck, so neither can be billed later.
    expect(r.tracked.every((t) => t.state === 'hit')).toBe(true);
  });

  it('penalises again once the window has expired', () => {
    // 15 units apart is 2 seconds, past the 1s window.
    const r = new LevelRunner(level([crate(40, 1), crate(55, 1)]));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(2);
  });

  it('opens on a hit and closes after the configured duration', () => {
    const r = new LevelRunner(level([crate(40, 1)], { routeLength: 200 }));
    while (!r.isInvulnerable) r.update(STEP_S);
    expect(r.isInvulnerable).toBe(true);
    // One second of steps, plus one to cross the boundary.
    for (let i = 0; i <= 60; i++) r.update(STEP_S);
    expect(r.isInvulnerable).toBe(false);
  });
});

describe('lane authority', () => {
  it('decides contact by the logical lane, not the mid-slide visual', () => {
    const r = new LevelRunner(level([gift(40, 2)]));
    // Swipe right once, then immediately run through. The visual is still
    // sliding when the gift arrives, but the committed lane is 2.
    r.swipe(1);
    runToEnd(r);
    expect(r.snapshot.giftsCollected).toBe(1);
  });

  it('clamps lane movement at the route edges', () => {
    const r = new LevelRunner(level([]));
    expect(r.swipe(1)).toBe(true);
    expect(r.swipe(1)).toBe(false);
    expect(r.snapshot.laneIndex).toBe(2);
  });
});

describe('no tunnelling at the configured speed', () => {
  it('registers contact on every lane-matched entity along a dense route', () => {
    // One entity every 2 units for 100 units: far denser than authored content.
    const dense: RouteEntity[] = [];
    for (let z = 4; z < 96; z += 2) dense.push(gift(z, 1));
    const r = new LevelRunner(level(dense));
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'gift')).toHaveLength(dense.length);
  });

  it('keeps the step advance well inside the contact window', () => {
    const advancePerStep = LEVEL_1.forwardSpeed * STEP_S;
    const window = HALF_DEPTH.player + HALF_DEPTH.obstacle;
    // The margin is what makes a 1D test sufficient instead of a swept one.
    expect(advancePerStep).toBeLessThan(window / 4);
  });
});

describe('the authored level 1 route', () => {
  it('offers four scored gifts, four obstacles and four guard encounters', () => {
    const gifts = LEVEL_1.entities.filter((e) => e.kind === 'gift' && e.scored);
    const crates = LEVEL_1.entities.filter((e) => e.kind === 'obstacle');
    const guards = LEVEL_1.entities.filter((e) => e.kind === 'guard');
    expect(gifts, 'scored gifts').toHaveLength(4);
    expect(crates, 'obstacles').toHaveLength(4);
    expect(guards, 'guard encounters').toHaveLength(4);
  });

  it('teaches before it threatens', () => {
    // The doc requires an unscored demonstration first, with hazards only
    // afterwards (section 5), so a first-time player meets the swipe before
    // it can cost them anything.
    const sorted = [...LEVEL_1.entities].sort((a, b) => a.z - b.z);
    const firstHazard = sorted.findIndex((e) => e.kind !== 'gift');
    const before = sorted.slice(0, firstHazard);

    expect(before.length, 'something must come before the first hazard').toBeGreaterThan(0);
    expect(before.every((e) => e.kind === 'gift')).toBe(true);
    expect(before.some((e) => !e.scored), 'at least one must be unscored').toBe(true);
  });

  it('keeps tutorial gifts outside the four scored ones', () => {
    const tutorial = LEVEL_1.entities.filter((e) => e.kind === 'gift' && !e.scored);
    expect(tutorial.length).toBeGreaterThan(0);
    const scored = LEVEL_1.entities.filter((e) => e.kind === 'gift' && e.scored);
    expect(scored).toHaveLength(4);
  });

  it('always leaves at least one safe lane at every hazard', () => {
    // Guards count as hazards here: a guard and an obstacle overlapping
    // could close two lanes between them, and three would be unavoidable.
    const hazards = LEVEL_1.entities.filter((e) => e.kind !== 'gift');
    for (const e of hazards) {
      const overlapping = hazards.filter((x) => Math.abs(x.z - e.z) < 2 * HALF_DEPTH.guard);
      const lanes = new Set(overlapping.map((x) => x.lane));
      expect(lanes.size, `hazards near z=${e.z} close ${lanes.size} lanes`).toBeLessThan(
        LEVEL_1.laneCount,
      );
    }
  });

  it('leaves time to react between encounters', () => {
    const zs = [...LEVEL_1.entities.map((e) => e.z)].sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) {
      const seconds = ((zs[i] as number) - (zs[i - 1] as number)) / LEVEL_1.forwardSpeed;
      expect(seconds).toBeGreaterThan(1.2);
    }
  });

  it('runs for roughly a minute, matching the pacing target', () => {
    const seconds = LEVEL_1.routeLength / LEVEL_1.forwardSpeed;
    expect(seconds).toBeGreaterThanOrEqual(55);
    expect(seconds).toBeLessThanOrEqual(65);
  });

  it('awards the documented level maximum on the intended racing line', () => {
    // The intended line through the authored route, as (travelled, lane).
    // Documenting it here proves a perfect run is actually reachable, which
    // a naive gift-chasing bot cannot establish.
    const line = [
      { at: 30, lane: 2 }, //  after t1, over for the t2 teaching gift
      { at: 58, lane: 1 }, //  back for g1 (lane 1) at 83
      { at: 125, lane: 2 }, // past h1 (lane 0), over for g2 at 153
      { at: 158, lane: 0 }, // clear of guard d1 (lane 2) and h2 (lane 1)
      { at: 256, lane: 1 }, // after g3, clear of guard d2 (lane 0)
      { at: 320, lane: 2 }, // past h3, clear of guard d3 (lane 1)
      { at: 385, lane: 1 }, // past h4 (lane 0), on for g4 at 411
    ];

    const r = new LevelRunner(LEVEL_1);
    let next = 0;
    while (!r.isComplete) {
      const wp = line[next];
      if (wp && r.snapshot.travelled >= wp.at) {
        const delta = wp.lane - r.snapshot.laneIndex;
        if (delta === 0) next++;
        else r.swipe(delta > 0 ? 1 : -1);
      }
      r.update(STEP_S);
    }

    const result = scoreRun(r.events);
    expect(r.snapshot.giftsCollected).toBe(4);
    expect(r.snapshot.incidents).toBe(0);
    expect(result.levelScores[0]).toBe(4 * POINTS.gift + POINTS.routeComplete);
    expect(result.levelScores[0]).toBe(600);
    expect(result.violations).toEqual([]);
  });

  it('makes at least one gift cost a real lane decision', () => {
    // A bot that walks straight to the next gift and ignores hazards must get
    // hit somewhere, otherwise the gifts are decoration rather than choices
    // (design doc §5: collecting a gift can require a riskier lane choice).
    const r = new LevelRunner(LEVEL_1);
    const gifts = LEVEL_1.entities.filter((e) => e.kind === 'gift' && e.scored);
    let next = 0;
    while (!r.isComplete) {
      const target = gifts[next];
      if (target) {
        const delta = target.lane - r.snapshot.laneIndex;
        if (delta !== 0) r.swipe(delta > 0 ? 1 : -1);
        if (r.snapshot.travelled > target.z) next++;
      }
      r.update(STEP_S);
    }
    expect(r.snapshot.giftsCollected).toBe(4);
    expect(r.snapshot.incidents).toBeGreaterThan(0);
  });
});
