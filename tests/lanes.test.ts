import { describe, expect, it } from 'vitest';
import { LaneRunner } from '../src/core/lanes';
import { STEP_S } from '../src/core/loop';

describe('lane movement', () => {
  it('starts in the middle lane of three', () => {
    expect(new LaneRunner(3, 1.6).laneIndex).toBe(1);
  });

  it('moves exactly one lane per swipe', () => {
    const l = new LaneRunner(3, 1.6);
    l.swipe(1);
    expect(l.laneIndex).toBe(2);
    l.swipe(-1);
    expect(l.laneIndex).toBe(1);
  });

  it('clamps at the edges and reports no change', () => {
    const l = new LaneRunner(3, 1.6);
    expect(l.swipe(1)).toBe(true);
    expect(l.swipe(1)).toBe(false);
    expect(l.laneIndex).toBe(2);
    expect(l.swipe(-1)).toBe(true);
    expect(l.swipe(-1)).toBe(true);
    expect(l.swipe(-1)).toBe(false);
    expect(l.laneIndex).toBe(0);
  });

  it('never crosses two lanes from repeated swipes within one settle window', () => {
    // Logical position is what collisions read, and it advances one step at a
    // time regardless of how fast swipes arrive.
    const l = new LaneRunner(5, 1.6, 0.11, 0);
    l.swipe(1);
    l.swipe(1);
    expect(l.laneIndex).toBe(2);
  });

  it('places lane centres symmetrically around zero', () => {
    const l = new LaneRunner(3, 1.6);
    expect(l.laneToX(0)).toBeCloseTo(-1.6);
    expect(l.laneToX(1)).toBeCloseTo(0);
    expect(l.laneToX(2)).toBeCloseTo(1.6);
  });

  it('settles the visual position toward the logical lane', () => {
    const l = new LaneRunner(3, 1.6);
    l.swipe(1);
    expect(l.isSettling).toBe(true);
    const startX = l.renderX;
    for (let i = 0; i < 30; i++) l.update(STEP_S);
    expect(l.isSettling).toBe(false);
    expect(l.renderX).toBeGreaterThan(startX);
    expect(l.renderX).toBeCloseTo(l.targetX, 5);
  });

  it('resets to the middle lane with no residual settle', () => {
    const l = new LaneRunner(3, 1.6);
    l.swipe(1);
    l.reset();
    expect(l.laneIndex).toBe(1);
    expect(l.isSettling).toBe(false);
    expect(l.renderX).toBeCloseTo(0);
  });
});
