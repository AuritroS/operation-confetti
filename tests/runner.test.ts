import { describe, expect, it } from 'vitest';
import { LevelRunner } from '../src/levels/runner';
import { LEVEL_1 } from '../src/levels/level1';
import {
  HALF_DEPTH,
  MIN_REACTION_SECONDS,
  secondsBetween,
  speedAt,
  type LevelConfig,
  type RouteEntity,
} from '../src/levels/types';
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
  kind: 'hazard',
  z,
  lane,
  scored: false,
  style: 'laser',
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

  it('catches every entity even at absurd speed', () => {
    // The real guarantee, replacing an earlier margin check.
    //
    // That check asserted a step advanced less than a quarter of the contact
    // window, which held only while the level was slow. Raising the ramp to
    // 15.3 u/s moved 0.255 units per step against a 1.0-unit window and broke
    // it. Rather than tune the speed down to suit the collision test, the
    // collision became swept — so this asserts the property that actually
    // matters, at a speed far beyond anything playable.
    const dense: RouteEntity[] = [];
    for (let z = 4; z < 96; z += 2) dense.push(gift(z, 1));

    for (const speed of [7.5, 15.3, 40, 120]) {
      const r = new LevelRunner(level(dense, { forwardSpeed: speed, endForwardSpeed: speed }));
      runToEnd(r);
      expect(
        r.events.filter((e) => e.t === 'gift'),
        `at ${speed} u/s`,
      ).toHaveLength(dense.length);
    }
  });

  it('sweeps across a whole step rather than sampling its end', () => {
    // One hazard, and a speed that steps clean over it. A point-overlap test
    // samples only where the step landed and would miss it entirely.
    const window = HALF_DEPTH.player + HALF_DEPTH.hazard;
    const speed = (window * 3) / STEP_S;
    const r = new LevelRunner(
      level([crate(30, 1)], { forwardSpeed: speed, endForwardSpeed: speed, routeLength: 60 }),
    );
    runToEnd(r);
    expect(r.events.filter((e) => e.t === 'incident')).toHaveLength(1);
  });
});

describe('the authored level 1 route', () => {
  it('offers four scored gifts and all three hazard styles', () => {
    const gifts = LEVEL_1.entities.filter((e) => e.kind === 'gift' && e.scored);
    const styles = new Set(
      LEVEL_1.entities.filter((e) => e.kind === 'hazard').map((e) => e.style),
    );
    expect(gifts, 'scored gifts').toHaveLength(4);
    expect(styles, 'every hazard style should appear').toEqual(
      new Set(['laser', 'fence', 'spotlight']),
    );
  });

  it('ramps: later acts pack encounters closer together', () => {
    // The difficulty curve is spacing, not new verbs. Compare the average
    // gap in the opening third against the closing third.
    const zs = [...LEVEL_1.entities.map((e) => e.z)].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < zs.length; i++) gaps.push((zs[i] as number) - (zs[i - 1] as number));
    const third = Math.floor(gaps.length / 3);
    const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / Math.max(xs.length, 1);

    const opening = mean(gaps.slice(0, third));
    const closing = mean(gaps.slice(-third));
    expect(closing, `opening ${opening.toFixed(1)}u vs closing ${closing.toFixed(1)}u`).toBeLessThan(
      opening,
    );
  });

  it('never closes all three lanes at once', () => {
    const hazards = LEVEL_1.entities.filter((e) => e.kind === 'hazard');
    for (const e of hazards) {
      const together = hazards.filter((x) => Math.abs(x.z - e.z) < 2 * HALF_DEPTH.hazard);
      const lanes = new Set(together.map((x) => x.lane));
      expect(lanes.size, `hazards at z=${e.z} close ${lanes.size} lanes`).toBeLessThan(
        LEVEL_1.laneCount,
      );
    }
  });

  it('keeps every gap and every telegraph above the reaction floor', () => {
    // Measured at the LOCAL speed, not the starting speed. Act three is both
    // tighter and faster, so dividing by forwardSpeed would understate its
    // difficulty by about a third and the floor would not actually be
    // guarded where it matters most.
    const zs = [...LEVEL_1.entities.map((e) => e.z)].sort((a, b) => a - b);
    for (let i = 1; i < zs.length; i++) {
      const from = zs[i - 1] as number;
      const to = zs[i] as number;
      // Simultaneous hazards legitimately share a z; they are one encounter.
      if (to === from) continue;
      const seconds = secondsBetween(LEVEL_1, from, to);
      expect(seconds, `gap before z=${to} is ${seconds.toFixed(2)}s`).toBeGreaterThan(
        MIN_REACTION_SECONDS,
      );
    }

    for (const e of LEVEL_1.entities.filter((x) => x.style === 'spotlight')) {
      const lead = (e.lockLead ?? 30) / speedAt(LEVEL_1, e.z);
      expect(lead, `spotlight at z=${e.z} commits ${lead.toFixed(2)}s ahead`).toBeGreaterThan(
        MIN_REACTION_SECONDS,
      );
    }
  });

  it('keeps the safe lane reachable from the previous encounter', () => {
    // A pinch that closes two lanes has exactly one answer, and the test for
    // "a safe lane exists" cannot tell whether the player could get there.
    // Every encounter's safe set must be within one swipe of the last one's.
    const byZ = new Map<number, number[]>();
    for (const e of LEVEL_1.entities.filter((x) => x.kind === 'hazard')) {
      byZ.set(e.z, [...(byZ.get(e.z) ?? []), e.lane]);
    }
    const encounters = [...byZ.entries()].sort((a, b) => a[0] - b[0]);
    const all = [0, 1, 2];
    let reachable = all;

    for (const [z, blocked] of encounters) {
      const safe = all.filter((lane) => !blocked.includes(lane));
      // One swipe from anywhere currently reachable.
      const canReach = new Set<number>();
      for (const from of reachable) {
        for (const to of [from - 1, from, from + 1]) {
          if (safe.includes(to)) canReach.add(to);
        }
      }
      expect(canReach.size, `no safe lane reachable at z=${z}`).toBeGreaterThan(0);
      reachable = [...canReach];
    }
  });

  it('gives before it threatens', () => {
    // The route opens with a gift in the starting lane, so a first-time
    // player meets the reward before anything can cost them. The rehearsal
    // teaches the swipe itself; the unscored demonstration gifts are gone.
    const sorted = [...LEVEL_1.entities].sort((a, b) => a.z - b.z);
    const firstHazard = sorted.findIndex((e) => e.kind !== 'gift');
    const before = sorted.slice(0, firstHazard);

    expect(before.length, 'something must come before the first hazard').toBeGreaterThan(0);
    expect(before.every((e) => e.kind === 'gift')).toBe(true);
  });

  it('has exactly the four scored gifts and nothing unscored', () => {
    const tutorial = LEVEL_1.entities.filter((e) => e.kind === 'gift' && !e.scored);
    expect(tutorial).toHaveLength(0);
    const scored = LEVEL_1.entities.filter((e) => e.kind === 'gift' && e.scored);
    expect(scored).toHaveLength(4);
  });

  it('always leaves at least one safe lane at every hazard', () => {
    // Guards count as hazards here: a guard and an obstacle overlapping
    // could close two lanes between them, and three would be unavoidable.
    const hazards = LEVEL_1.entities.filter((e) => e.kind !== 'gift');
    for (const e of hazards) {
      const overlapping = hazards.filter((x) => Math.abs(x.z - e.z) < 2 * HALF_DEPTH.hazard);
      const lanes = new Set(overlapping.map((x) => x.lane));
      expect(lanes.size, `hazards near z=${e.z} close ${lanes.size} lanes`).toBeLessThan(
        LEVEL_1.laneCount,
      );
    }
  });

  it('runs for about forty seconds, the chosen pacing', () => {
    // Measured by simulating, not computed from a formula: speed ramps with
    // distance, so length divided by the starting speed overstates the run.
    //
    // This is deliberately under the doc's proposed 55-65s window. That
    // window is a pacing proposal and §14 lists it as reviewable; the level
    // played too easy at 55s, so a shorter faster run was chosen over a
    // longer gentle one. The bounds still exist so the figure cannot drift
    // unnoticed.
    const r = new LevelRunner(LEVEL_1);
    const seconds = runToEnd(r) * STEP_S;
    expect(seconds, `${seconds.toFixed(1)}s`).toBeGreaterThanOrEqual(35);
    expect(seconds, `${seconds.toFixed(1)}s`).toBeLessThanOrEqual(50);
  });

  it('ramps the speed by about seventy percent', () => {
    const start = LEVEL_1.forwardSpeed;
    const end = LEVEL_1.endForwardSpeed ?? start;
    expect(end / start).toBeCloseTo(1.7, 1);
  });

  it('ramps the forward speed across the route', () => {
    const r = new LevelRunner(LEVEL_1);
    const atStart = r.speed;
    runToEnd(r);
    const atEnd = r.speed;
    expect(atStart).toBeCloseTo(LEVEL_1.forwardSpeed, 1);
    expect(atEnd).toBeGreaterThan(atStart);
    expect(atEnd).toBeCloseTo(LEVEL_1.endForwardSpeed ?? 0, 1);
  });

  it('awards the documented level maximum on the intended racing line', () => {
    // The intended line through the authored route, as (travelled, lane).
    // Documenting it here proves a perfect run is actually reachable, which
    // a naive gift-chasing bot cannot establish.
    const line = [
      // g1 (lane 1) at 33 is in the starting lane: nothing to do.
      { at: 75, lane: 2 }, //  past h1 laser (lane 0), on for g2 at 103
      { at: 108, lane: 0 }, // clear of h2 spotlight (lane 2) and h3 fence (lane 1)
      { at: 202, lane: 1 }, // after g3, clear of h4 spotlight (lane 0)
      { at: 260, lane: 2 }, // clear of the pinch
      { at: 290, lane: 2 }, // the 285 pinch closes left and middle
      { at: 315, lane: 1 }, // after g4, clear of h8 spotlight (lane 2)
      { at: 362, lane: 1 }, // h9 fence is lane 0; middle stays safe
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
