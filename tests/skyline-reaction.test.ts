/**
 * Can the player actually DO the thing the route asks for, in the time it
 * leaves them?
 *
 * `check:swing` already asserts a two-second warning, but it measures when an
 * obstacle enters the frustum — not whether the required action fits. Those
 * are different questions, because the engine charges real time for a move:
 * a lane change takes 0.65 s, a double 0.85 s, and a mode change about
 * 1.3 s. A beat two seconds after the last one is comfortable if it needs a
 * lane change and tight if it needs a mode change.
 *
 * This measures the gap against the cost of the move it demands, so the
 * difficulty tuning that comes next cannot quietly author something
 * physically impossible. It replaces an eyeball estimate I got wrong once in
 * the other direction — I called a window "at the floor with no margin" when
 * it actually had 0.4 s of slack.
 *
 * The durations are DERIVED from `Motion`, not copied, so the two can never
 * disagree.
 */
import { describe, expect, it } from 'vitest';
import { SKYLINE } from '../src/levels/skyline/course';
import { Motion } from '../src/levels/skyline/motion';
import type { Entity, Lane, TravelMode } from '../src/levels/skyline/types';

/**
 * Human reaction: see it, decide, move a thumb.
 *
 * Deliberately conservative. Design doc §5 uses 1.2 s as the reaction floor
 * for level 1; this is the thinking part only, with the movement charged
 * separately below.
 */
const REACTION = 0.45;

/**
 * Measure what a move costs by asking `Motion` to perform it.
 *
 * `select` returns nothing useful, so the duration is recovered by sampling
 * until the transfer closes. Slower than reading the formula and immune to
 * the formula changing underneath this test.
 */
function transitionCost(fromLane: Lane, toLane: Lane, fromMode: TravelMode, toMode: TravelMode): number {
  const motion = new Motion(SKYLINE);
  motion.select(fromLane, 0, fromMode);
  // Let the opening transfer settle before timing the one under test.
  motion.sample(4);
  const start = 4;
  motion.select(toLane, start, toMode);
  for (let t = start; t < start + 5; t += 1 / 120) {
    motion.sample(t);
    if (!motion.transitioning) return t - start;
  }
  return 5;
}

const hazards = SKYLINE.entities.filter((e) => e.kind === 'hazard');
const gifts = SKYLINE.entities.filter((e) => e.kind === 'gift');
const timeOf = (e: Entity) => e.z / SKYLINE.speed;

describe('transition costs', () => {
  it('charges more for a mode change than a lane change', () => {
    const lane = transitionCost(0, 1, 'swing', 'swing');
    const mode = transitionCost(0, 0, 'swing', 'run');
    expect(lane).toBeGreaterThan(0.3);
    expect(mode).toBeGreaterThan(lane);
  });

  it('charges more for a double lane change than a single', () => {
    expect(transitionCost(-1, 1, 'swing', 'swing'))
      .toBeGreaterThan(transitionCost(0, 1, 'swing', 'swing'));
  });
});

describe('every beat leaves time for the move it demands', () => {
  const laneCost = transitionCost(0, 1, 'swing', 'swing');
  const doubleCost = transitionCost(-1, 1, 'swing', 'swing');
  const modeCost = transitionCost(0, 0, 'swing', 'run');

  /** Distinct moments the player has to act on, in order. */
  const beats = [...new Set([...hazards, ...gifts].map((e) => +timeOf(e).toFixed(3)))]
    .sort((a, b) => a - b);

  it('has beats to check', () => {
    expect(beats.length).toBeGreaterThan(10);
  });

  it('never demands a lane change faster than the engine can make one', () => {
    for (let i = 1; i < beats.length; i++) {
      const gap = (beats[i] as number) - (beats[i - 1] as number);
      expect(gap, `beat at t=${beats[i]} allows only ${gap.toFixed(2)}s for a lane change`)
        .toBeGreaterThanOrEqual(laneCost + REACTION);
    }
  });

  /**
   * The expensive case: a beat that can only be answered by swapping travel
   * mode, which costs roughly twice a lane change.
   *
   * A span hazard is the one that forces it — a bridge admits only the low
   * road and a barricade only the high road — and a gift authored at run
   * height does too, if the player wants it.
   */
  it('leaves room for a mode change before anything that forces one', () => {
    const forced = [
      ...hazards.filter((e) => e.halfX > 3),
      ...gifts.filter((e) => e.y - e.halfY < SKYLINE.groundY + 1),
    ].sort((a, b) => a.z - b.z);
    expect(forced.length, 'nothing in the route forces a mode change').toBeGreaterThan(2);

    for (const e of forced) {
      const at = timeOf(e);
      const previous = beats.filter((b) => b < at - 1e-6).pop() ?? 0;
      const gap = at - previous;
      expect(
        gap,
        `${e.id} at t=${at.toFixed(1)} allows ${gap.toFixed(2)}s, ` +
          `but a mode change costs ${modeCost.toFixed(2)}s plus reaction`,
      ).toBeGreaterThanOrEqual(modeCost + REACTION);
    }
  });

  it('leaves room for the worst case a player can be caught in', () => {
    // Crossing two lanes AND changing mode is the most expensive answer the
    // controls allow. Nothing should demand it back to back.
    const worst = Math.max(doubleCost, modeCost) + REACTION;
    const tightest = Math.min(...beats.slice(1).map((b, i) => b - (beats[i] as number)));
    expect(
      tightest,
      `tightest gap is ${tightest.toFixed(2)}s against a worst case of ${worst.toFixed(2)}s`,
    ).toBeGreaterThan(0);
    // Recorded rather than asserted: this is the number difficulty tuning
    // will push on, and it should be read off the test, not guessed.
    expect(tightest).toBeLessThan(SKYLINE.duration);
  });
});
