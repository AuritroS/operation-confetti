import { describe, expect, it } from 'vitest';
import { SKYLINE } from '../src/levels/skyline/course';
import { clean, formatSolve, probeTiming, replay, scoredGifts, solve, type Swipe } from '../src/levels/skyline/solve';
import { route } from '../src/levels/skyline/motion';
import type { Course, Entity, Lane, TravelMode } from '../src/levels/skyline/types';
import { RULES } from '../src/core/scoring';

const empty = (): Course => ({ ...SKYLINE, duration: 12, entities: [] });
function gift(c: Course, id: string, time: number, lane: Lane, mode: TravelMode = 'swing'): Entity {
  return { id, assembly: 'gift', kind: 'gift', lane, scored: true,
    ...route(c, lane, time, mode).p, halfX: 0.8, halfY: 0.8, halfZ: 0.8 };
}
function swipes(c: Course): readonly Swipe[] {
  const result = solve(c);
  if ('failure' in result) throw new Error(formatSolve(result, c));
  return result.solution.swipes;
}

describe('generated review route', () => {
  it('collects every scored gift without touching any hazard at simulation and browser cadences', () => {
    const inputs = swipes(SKYLINE);
    for (const [hz, polling] of [[120, 1], [60, 1], [60, 3]] as const) {
      const outcome = replay(inputs, SKYLINE, hz, polling);
      expect(outcome, JSON.stringify(outcome)).toMatchObject({ complete: true, gifts: scoredGifts(),
        incidents: 0, struck: [], missed: [], violations: [] });
    }
  });

  it('adapts to changed encounter times, lanes, duration and speed without mutating the course', () => {
    for (const speed of [6, 10]) {
      const c = { ...empty(), speed };
      c.entities = [gift(c, 'a', 3, -1), gift(c, 'b', 8, 1, 'run')];
      const before = JSON.stringify(c);
      expect(clean(replay(swipes(c), c), c)).toBe(true);
      expect(JSON.stringify(c)).toBe(before);
    }
  });

  it('uses two separate strokes to cross both lanes', () => {
    const c = empty();
    c.entities = [gift(c, 'left', 2, -1), gift(c, 'right', 5, 1)];
    const inputs = swipes(c);
    expect(inputs.filter(s => s.direction === 'right')).toHaveLength(2);
    expect(clean(replay(inputs, c), c)).toBe(true);
  });

  it('tries another path when all timings of the first path hit a deep obstacle', () => {
    const c: Course = { ...empty(), duration: 18 };
    const hazard = (id: string, t: number, lane: Lane, overhead: boolean, halfZ: number): Entity => ({
      id, kind: 'hazard', assembly: overhead ? 'hangingSign' : 'laneBlock', lane, scored: false,
      x: lane * c.laneWidth, y: overhead ? 9 : 1.5, z: t * c.speed,
      halfX: 0.91, halfY: overhead ? 4 : 1.5, halfZ,
    });
    // The first graph path enters the left lane while the long overhead
    // obstacle still occupies it. A later departure on another path works.
    c.entities = [hazard('middle-low', 2, 0, false, 10), gift(c, 'first', 4, 0),
      hazard('long-sign', 6, -1, true, 18), hazard('left-low-a', 8, -1, false, 13),
      hazard('left-low-b', 10, -1, false, 15), hazard('middle-low-b', 12, 0, false, 5),
      gift(c, 'last', 14, -1)];
    const result = solve(c);
    if ('failure' in result) throw new Error(formatSolve(result, c));
    expect(result.solution.candidatesTried).toBeGreaterThan(4);
    expect(clean(replay(result.solution.swipes, c), c)).toBe(true);
  });

  it('reports an obstructed course as unsolved without claiming an impossibility proof', () => {
    const c = empty();
    c.entities = [{ id: 'wall', kind: 'hazard', assembly: 'bridge', lane: 0, scored: false,
      x: 0, y: 10, z: c.speed * 3, halfX: 20, halfY: 10, halfZ: 1 }];
    const result = solve(c);
    expect(result).toHaveProperty('failure');
    expect(formatSolve(result, c)).toContain('does not prove impossibility');
  });

  it('counts protected contacts as hits even when only one incident is emitted', () => {
    const c = empty();
    const wall: Entity = { id: 'wall-a', kind: 'hazard', assembly: 'bridge', lane: 0, scored: false,
      x: 0, y: 10, z: c.speed * 3, halfX: 20, halfY: 10, halfZ: 1 };
    c.entities = [wall, { ...wall, id: 'wall-b' }];
    const outcome = replay([{ time: 0, direction: 'up' }], c);
    expect(outcome.incidents).toBe(1);
    expect(outcome.struck).toEqual(['wall-a', 'wall-b']);
    expect(clean(outcome, c)).toBe(false);
  });

  it('does not invent a slack value when no move is required', () => {
    const c = empty();
    expect(solve(c)).toMatchObject({ solution: { estimatedSlack: null, tightestAt: null,
      swipes: [{ time: 0, direction: 'up' }] } });
  });

  it('rejects a missed scored gift and does not count teaching gifts', () => {
    const c = empty();
    c.entities = [{ ...gift(c, 'teach', 2, 0), scored: false }, gift(c, 'scored', 5, 1)];
    const outcome = replay([{ time: 0, direction: 'up' }], c);
    expect(outcome.gifts).toBe(0);
    expect(outcome.missed).toEqual(['scored']);
    expect(clean(outcome, c)).toBe(false);
    expect(clean(replay(swipes(c), c), c)).toBe(true);
  });

  it('rejects scoring-rule violations instead of certifying an inflated reward route', () => {
    const c = empty();
    c.entities = Array.from({ length: RULES.giftsPerLevel + 1 }, (_, i) => gift(c, `gift-${i}`, 2 + i, 0));
    const outcome = replay([{ time: 0, direction: 'up' }], c);
    expect(outcome.violations.length).toBeGreaterThan(0);
    expect(clean(outcome, c)).toBe(false);
    expect(solve(c)).toHaveProperty('failure.reason', `${RULES.giftsPerLevel + 1} scored gifts exceed the scoring rule cap of ${RULES.giftsPerLevel}.`);
  });

  it('reports malformed course geometry instead of searching it', () => {
    expect(solve({ ...empty(), speed: 0 })).toHaveProperty('failure');
    const c = empty(), e = gift(c, 'duplicate', 2, 0);
    c.entities = [e, { ...e }];
    expect(solve(c)).toHaveProperty('failure');
  });

  it('rejects unordered, non-finite and out-of-course input times', () => {
    for (const inputs of [[], [{ time: 1, direction: 'up' }],
      [{ time: 0, direction: 'up' }, { time: NaN, direction: 'left' }],
      [{ time: 0, direction: 'up' }, { time: 13, direction: 'left' }],
      [{ time: 0, direction: 'up' }, { time: 2, direction: 'left' }, { time: 1, direction: 'right' }]] as Swipe[][]) {
      expect(() => replay(inputs, empty())).toThrow('Invalid swipe schedule');
    }
  });

  it('measures single-swipe timing probes without modifying the accepted schedule', () => {
    const c = empty(); c.entities = [gift(c, 'gift', 3, -1)];
    const inputs = swipes(c), before = JSON.stringify(inputs);
    const timing = probeTiming(inputs, c);
    expect(timing.late).toBeGreaterThan(0);
    expect(timing.late).toBeLessThanOrEqual(timing.limit);
    expect(JSON.stringify(inputs)).toBe(before);
    expect(clean(replay(inputs, c), c)).toBe(true);
    expect(timing.jitter.passed).toBe(timing.jitter.trials);
  });

  it('identifies a missed gift when a valid swipe is delayed beyond its tested margin', () => {
    const c = empty(); c.entities = [gift(c, 'gift', 3, -1)];
    const inputs: Swipe[] = [{ time: 0, direction: 'up' }, { time: 2.6, direction: 'left' }];
    const timing = probeTiming(inputs, c);
    expect(timing.late).toBeCloseTo(0.2);
    expect(timing.stoppedBy.late).toBe('replay');
    expect(timing.firstFailure?.offset).toBeCloseTo(0.3);
    expect(timing.firstFailure).toMatchObject({ swipe: 1, outcome: { missed: ['gift'] } });
  });
});
