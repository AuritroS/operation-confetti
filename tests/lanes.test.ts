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

  it('finishes the slide within the stated settle duration', () => {
    const settle = 0.11;
    const l = new LaneRunner(3, 1.6, settle);
    l.swipe(1);
    expect(l.isSettling).toBe(true);
    const startX = l.renderX;

    // One step short of the duration it must still be moving; at the
    // duration it must be exactly on target, not merely close.
    const steps = Math.ceil(settle / STEP_S);
    for (let i = 0; i < steps - 1; i++) l.update(STEP_S);
    expect(l.isSettling).toBe(true);

    l.update(STEP_S);
    expect(l.isSettling).toBe(false);
    expect(l.renderX).toBeGreaterThan(startX);
    expect(l.renderX).toBe(l.targetX);
  });

  it('holds the render position exactly on target once settled', () => {
    const l = new LaneRunner(3, 1.6);
    l.swipe(-1);
    for (let i = 0; i < 60; i++) l.update(STEP_S);
    expect(l.renderX).toBe(l.targetX);
    expect(l.renderX).toBeCloseTo(-1.6);
  });

  it('retargets from the current visual position on a second swipe', () => {
    const l = new LaneRunner(5, 1.6);
    l.swipe(1);
    l.update(STEP_S);
    const mid = l.renderX;
    // Interrupting mid-slide must carry on from here, never jump backwards.
    l.swipe(1);
    expect(l.renderX).toBeCloseTo(mid, 6);
    expect(l.laneIndex).toBe(4);
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
