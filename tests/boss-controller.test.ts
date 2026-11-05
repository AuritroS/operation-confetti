import { describe, expect, it } from 'vitest';
import { BossLevel } from '../src/levels/boss/controller';
import { scoreRun, type RunEvent } from '../src/core/scoring';
import type { LevelContext } from '../src/core/level';
import type { RendererHost } from '../src/render/renderer-host';

const STEP = 1 / 60;

/**
 * The level without a scene.
 *
 * `mount` needs WebGL, which jsdom has not got, but none of the behaviour
 * worth testing here is graphical: it is whether the level reports what it
 * did, exactly once, and stops at the right moment.
 */
function headless(): { level: BossLevel; events: RunEvent[] } {
  const level = new BossLevel();
  const events: RunEvent[] = [];
  const ctx: LevelContext = {
    host: null as unknown as RendererHost,
    emit: (event) => events.push(event),
    debug: false,
  };
  level.attach(ctx);
  return { level, events };
}

function dodge(level: BossLevel): void {
  const marked = level.runner.markedLanes;
  if (!marked.includes(level.runner.lane)) return;
  for (const dir of [-1, 1] as const) {
    const target = level.runner.lane + dir;
    if (target < 0 || target > 2) continue;
    if (!marked.includes(target)) { level.swipe(dir); return; }
  }
}

function play(level: BossLevel, seconds = 180): void {
  for (let i = 0; i < seconds / STEP && level.result === null; i++) {
    const gift = level.runner.cues.gift;
    if (gift && gift.phase !== 'taken' && gift.phase !== 'expired'
      && gift.lane !== level.runner.lane && !level.runner.inDanger) {
      level.swipe(gift.lane > level.runner.lane ? 1 : -1);
    } else {
      dodge(level);
    }
    if (level.runner.beat === 'exposed' && level.runner.cooldownLeft === 0) level.fire();
    level.update(STEP);
  }
}

describe('level 3 as a mountable level', () => {
  it('emits nothing until a scored fight begins', () => {
    const { level, events } = headless();
    for (let i = 0; i < 120; i++) { level.fire(); level.update(STEP); }
    expect(events).toEqual([]);
    expect(level.result).toBeNull();
  });

  it('forwards every simulation event outward exactly once, in order', () => {
    const { level, events } = headless();
    level.startFight();
    play(level);
    // The level keeps a mirror for its own tests; the shell's copy is what
    // counts, and the two must be the same list.
    expect(events).toEqual([...level.runner.events]);
    expect(new Set(events).size).toBe(events.length);
    expect(scoreRun(events).violations).toEqual([]);
  });

  it('reports a result only once the ending choreography has finished', () => {
    const { level } = headless();
    level.startFight();
    // Stand still: five contacts end the attempt.
    for (let i = 0; i < 120 / STEP && level.runner.state !== 'defeat'; i++) level.update(STEP);
    expect(level.runner.state).toBe('defeat');
    // Cutting away here would eat the ending, so the level is not done yet.
    expect(level.result).toBeNull();
    for (let i = 0; i < 6 / STEP && level.result === null; i++) level.update(STEP);
    expect(level.result).toBe('defeated');
  });

  it('reports a win as complete and keeps the shell score in agreement', () => {
    const { level, events } = headless();
    level.startFight();
    play(level);
    expect(level.result).toBe('complete');
    expect(scoreRun(events).levelScores[2]).toBe(level.runner.score);
    expect(scoreRun(events).outcome).toBe('win');
  });

  it('does not re-emit a finished run when restarted', () => {
    const { level, events } = headless();
    level.startFight();
    play(level);
    const first = events.length;
    expect(first).toBeGreaterThan(0);
    level.restart();
    // A replay starts a fresh list in the shell; the level must not replay
    // its old events into it.
    events.length = 0;
    expect(level.result).toBeNull();
    level.startFight();
    for (let i = 0; i < 60; i++) level.update(STEP);
    expect(events.length).toBeLessThan(first);
    expect(scoreRun(events).violations).toEqual([]);
  });

  it('exposes a snapshot that never hands out live simulation state', () => {
    const { level } = headless();
    level.startFight();
    const before = level.snapshot;
    for (let i = 0; i < 90; i++) level.update(STEP);
    // A HUD holding yesterday's snapshot must not silently show today's data.
    expect(level.snapshot).not.toBe(before);
    expect(level.snapshot.bossHp).toBe(level.runner.bossHp);
  });
});
