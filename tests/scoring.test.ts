import { describe, expect, it } from 'vitest';
import {
  LEVEL_MAX,
  MAX_TOTAL,
  POINTS,
  RULES,
  type RunEvent,
  scoreRun,
} from '../src/core/scoring';

/** A maximum-score winning run: all gifts, no incidents, boss fully damaged. */
function perfectRun(): RunEvent[] {
  const ev: RunEvent[] = [];
  for (const level of [1, 2] as const) {
    for (let i = 0; i < RULES.giftsPerLevel; i++) ev.push({ t: 'gift', level });
    ev.push({ t: 'routeComplete', level });
  }
  for (let i = 0; i < RULES.giftsPerLevel; i++) ev.push({ t: 'gift', level: 3 });
  const shots = RULES.bossMaxHp / RULES.confettiDamage;
  for (let i = 0; i < shots; i++) ev.push({ t: 'bossDamage', amount: RULES.confettiDamage });
  ev.push({ t: 'victory' });
  return ev;
}

describe('maxima', () => {
  it('a perfect run hits the documented per-level and overall maxima', () => {
    const r = scoreRun(perfectRun());
    expect(r.violations).toEqual([]);
    expect(r.levelScores).toEqual([LEVEL_MAX[1], LEVEL_MAX[2], LEVEL_MAX[3]]);
    expect(r.total).toBe(MAX_TOTAL);
    expect(r.total).toBe(2300);
    expect(r.outcome).toBe('win');
  });
});

describe('penalties and the per-level floor', () => {
  it('clamps each level at zero rather than going negative', () => {
    const r = scoreRun([
      { t: 'incident', level: 1 },
      { t: 'incident', level: 1 },
      { t: 'incident', level: 1 },
      { t: 'defeat' },
    ]);
    expect(r.levelScores[0]).toBe(0);
    expect(r.total).toBe(0);
  });

  it('clamps after each penalty, so order cannot produce a negative carry', () => {
    // One gift (+100) then three incidents (-150) must floor at 0, not -50.
    const r = scoreRun([
      { t: 'gift', level: 2 },
      { t: 'incident', level: 2 },
      { t: 'incident', level: 2 },
      { t: 'incident', level: 2 },
      { t: 'defeat' },
    ]);
    expect(r.levelScores[1]).toBe(0);
  });

  it('a collision and its rescue count as one incident, not two', () => {
    // The level emits a single incident event; this asserts the price of one.
    const r = scoreRun([{ t: 'gift', level: 2 }, { t: 'incident', level: 2 }, { t: 'defeat' }]);
    expect(r.levelScores[1]).toBe(POINTS.gift + POINTS.incident);
  });
});

describe('duplicate collectibles', () => {
  it('ignores gifts beyond the per-level allowance', () => {
    const ev: RunEvent[] = [];
    for (let i = 0; i < RULES.giftsPerLevel + 5; i++) ev.push({ t: 'gift', level: 1 });
    ev.push({ t: 'defeat' });
    const r = scoreRun(ev);
    expect(r.levelScores[0]).toBe(RULES.giftsPerLevel * POINTS.gift);
    expect(r.violations.length).toBe(5);
  });
});

describe('boss damage credit', () => {
  it('caps credited damage at remaining HP, so overkill scores nothing extra', () => {
    const ev: RunEvent[] = [];
    // 21 shots of 5 damage against 100 HP: the 21st must credit nothing.
    for (let i = 0; i < 21; i++) ev.push({ t: 'bossDamage', amount: 5 });
    ev.push({ t: 'victory' });
    const r = scoreRun(ev);
    expect(r.levelScores[2]).toBe(RULES.bossMaxHp * POINTS.perBossHp + POINTS.victory);
    expect(r.violations).toContain('boss damage with no HP remaining');
  });

  it('rejects a shot claiming more than the per-shot damage maximum', () => {
    const r = scoreRun([{ t: 'bossDamage', amount: 95 }, { t: 'defeat' }]);
    expect(r.levelScores[2]).toBe(0);
    expect(r.violations[0]).toMatch(/exceeds per-shot maximum/);
  });

  it('never credits non-positive or non-finite damage', () => {
    const r = scoreRun([
      { t: 'bossDamage', amount: 0 },
      { t: 'bossDamage', amount: -5 },
      { t: 'bossDamage', amount: Number.NaN },
      { t: 'defeat' },
    ]);
    expect(r.levelScores[2]).toBe(0);
    expect(r.violations).toHaveLength(3);
  });
});

describe('terminal state', () => {
  it('stops scoring at the outcome', () => {
    const r = scoreRun([
      { t: 'gift', level: 3 },
      { t: 'defeat' },
      { t: 'gift', level: 3 },
      { t: 'bossDamage', amount: 5 },
    ]);
    expect(r.levelScores[2]).toBe(POINTS.gift);
    expect(r.outcome).toBe('loss');
    expect(r.violations).toContain('event "gift" after outcome');
  });

  it('simultaneous resolution favours the player: victory lands, defeat is dropped', () => {
    // Design doc §7: player damage resolves first; if it defeats Aurora the
    // win stands and remaining damage for that tick is cancelled.
    const ev: RunEvent[] = [];
    for (let i = 0; i < 20; i++) ev.push({ t: 'bossDamage', amount: 5 });
    ev.push({ t: 'victory' });
    ev.push({ t: 'defeat' });
    const r = scoreRun(ev);
    expect(r.outcome).toBe('win');
    expect(r.violations).toContain('event "defeat" after outcome');
  });

  it('flags a victory claimed while the boss still has HP', () => {
    const r = scoreRun([{ t: 'bossDamage', amount: 5 }, { t: 'victory' }]);
    expect(r.violations).toContain('victory with boss HP remaining');
  });

  it('reports an unfinished run as incomplete so the Worker can reject it', () => {
    expect(scoreRun([{ t: 'gift', level: 1 }]).outcome).toBe('incomplete');
  });
});

describe('route completion', () => {
  it('credits a route only once', () => {
    const r = scoreRun([
      { t: 'routeComplete', level: 1 },
      { t: 'routeComplete', level: 1 },
      { t: 'defeat' },
    ]);
    expect(r.levelScores[0]).toBe(POINTS.routeComplete);
    expect(r.violations).toContain('level 1 route completed twice');
  });
});

describe('losing runs', () => {
  it('scores and submits a loss as a completed attempt', () => {
    const r = scoreRun([
      { t: 'gift', level: 1 },
      { t: 'routeComplete', level: 1 },
      { t: 'bossDamage', amount: 5 },
      { t: 'defeat' },
    ]);
    expect(r.outcome).toBe('loss');
    expect(r.total).toBe(100 + 200 + 25);
    expect(r.violations).toEqual([]);
  });
});
