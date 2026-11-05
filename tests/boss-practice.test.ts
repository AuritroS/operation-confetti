import { describe, expect, it } from 'vitest';
import { BossPractice } from '../src/levels/boss/practice';

describe('Level 3 control practice', () => {
  it('moves one lane per swipe and clamps at the edges', () => {
    const game = new BossPractice();
    expect(game.lane).toBe(1);
    expect(game.swipe(-1)).toBe(true);
    expect(game.lane).toBe(0);
    expect(game.swipe(-1)).toBe(false);
    expect(game.lane).toBe(0);
    expect(game.swipe(1)).toBe(true);
    expect(game.lane).toBe(1);
  });

  it('fires one auto-aimed shot per accepted tap, obeys cooldown, and scores a target hit at arrival', () => {
    const game = new BossPractice();
    game.swipe(1);
    expect(game.fire()).toBe(true);
    expect(game.activeShots[0]?.lane).toBe(2);
    expect(game.fire()).toBe(false);
    game.update(0.29);
    expect(game.fire()).toBe(false);
    game.update(0.01);
    expect(game.fire()).toBe(true);
    game.update(0.38);
    expect(game.shotCount).toBe(2);
    expect(game.hitCount).toBe(2);
    expect(game.activeShots).toHaveLength(0);
  });

  it('reset clears shots, hits and cooldown', () => {
    const game = new BossPractice();
    game.fire();
    game.update(0.38);
    game.reset();
    expect(game.lane).toBe(1);
    expect(game.hitCount).toBe(0);
    expect(game.shotCount).toBe(0);
    expect(game.cooldownLeft).toBe(0);
    expect(game.fire()).toBe(true);
  });
});
