import { describe, expect, it } from 'vitest';
import { scoreRun, LEVEL_MAX } from '../src/core/scoring';
import { BossRunner } from '../src/levels/boss/runner';
import { BOSS_RULES } from '../src/levels/boss/config';
import { GIFT_TIMING } from '../src/levels/boss/telegraph';
import { BOSS_PHASES, safeLaneForDouble, markedLanesForDouble } from '../src/levels/boss/patterns';

const STEP = 1 / 60;
function advance(game: BossRunner, seconds: number): void {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) game.update(STEP);
}
function until(game: BossRunner, done: () => boolean, limitSeconds = 120): void {
  for (let i = 0; i < limitSeconds / STEP && !done(); i++) game.update(STEP);
  expect(done()).toBe(true);
}

/**
 * The one dodge every pattern is designed to permit: a single swipe into an
 * adjacent lane that nothing has committed to.
 *
 * Returning false is a fairness failure, not a losing move, so the tests below
 * assert on it rather than merely surviving.
 */
function dodge(game: BossRunner): boolean {
  if (!game.inDanger) return true;
  const marked = game.markedLanes;
  for (const dir of [-1, 1] as const) {
    const target = game.lane + dir;
    if (target < 0 || target > 2) continue;
    if (!marked.includes(target)) return game.swipe(dir);
  }
  return false;
}

/** Advance until `done`, dodging throughout so no hit or incident intrudes. */
function untilSafely(game: BossRunner, done: () => boolean, limitSeconds = 60): void {
  for (let i = 0; i < limitSeconds / STEP && !done(); i++) {
    expect(dodge(game)).toBe(true);
    game.update(STEP);
  }
  expect(done()).toBe(true);
}

/** A competent player: dodges when marked, fires whenever she is open. */
function play(game: BossRunner, seconds = 120, chaseGifts = false): void {
  for (let i = 0; i < seconds / STEP && game.state === 'playing'; i++) {
    const gift = game.cues.gift;
    if (chaseGifts && gift?.phase === 'idle' && game.lane !== gift.lane && !game.inDanger) {
      game.swipe(game.lane < gift.lane ? 1 : -1);
    } else {
      expect(dodge(game)).toBe(true);
    }
    if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
    game.update(STEP);
  }
}

describe('Level 3 fight simulation', () => {
  it('keeps unlimited practice damage free and starts a fresh fight', () => {
    const game = new BossRunner();
    for (let i = 0; i < 8; i++) {
      expect(game.fire()).toBe(true);
      advance(game, 0.4);
    }
    expect(game.practice.hitCount).toBe(8);
    expect(game.playerHp).toBe(5);
    expect(game.bossHp).toBe(100);
    expect(game.events).toEqual([]);
    game.startFight();
    expect(game.practice.hitCount).toBe(0);
    expect(game.state).toBe('playing');
    expect(game.cues.strikes[0]?.lane).toBe(1);
  });

  it('uses committed lane and shield state at impact', () => {
    const game = new BossRunner();
    game.startFight();
    expect(game.fire()).toBe(true);
    advance(game, 0.4);
    expect(game.bossHp).toBe(100);
    expect(game.cues.shield.phase).toBe('blocked');
    game.swipe(-1);
    until(game, () => game.beat === 'exposed');
    expect(game.playerHp).toBe(5);
    expect(game.cues.strikes).toHaveLength(0);
    expect(game.cues.shield.phase).toBe('down');
    expect(game.fire()).toBe(true);
    advance(game, 0.4);
    expect(game.bossHp).toBe(95);
    expect(game.score).toBeGreaterThanOrEqual(25);
    expect(game.events.filter((event) => event.t === 'bossDamage')).toHaveLength(1);
  });

  it('never leaves an attack without a safe lane one swipe away', () => {
    const game = new BossRunner();
    game.startFight();
    // Walk a whole fight asserting the escape exists on every single tick an
    // attack is live, in every phase, including the two-attack beats.
    let checked = 0;
    for (let i = 0; i < 120 / STEP && game.state === 'playing'; i++) {
      if (game.markedLanes.length > 0) {
        const marked = game.markedLanes;
        // At least one lane is always survivable, and it is always adjacent.
        const reachable = [-1, 0, 1]
          .map((d) => game.lane + d)
          .filter((l) => l >= 0 && l <= 2 && !marked.includes(l));
        expect(reachable.length).toBeGreaterThan(0);
        checked++;
      }
      expect(dodge(game)).toBe(true);
      if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
      game.update(STEP);
    }
    expect(game.state).toBe('victory');
    expect(checked).toBeGreaterThan(100);
  });

  it('marks two lanes in a double strike, always leaving one reachable', () => {
    // The data layer's guarantee, checked at every entry state.
    for (let beatIndex = 0; beatIndex < 4; beatIndex++) {
      for (const lane of [0, 1, 2]) {
        const safe = safeLaneForDouble(lane, beatIndex);
        const marked = markedLanesForDouble(safe);
        expect(marked).toHaveLength(2);
        // Standing still is never the answer, and the answer is never two
        // swipes away.
        expect(marked).toContain(lane);
        expect(Math.abs(safe - lane)).toBe(1);
      }
    }
  });

  it('escalates her phase as her health falls', () => {
    const game = new BossRunner();
    game.startFight();
    const seen = new Set<string>();
    for (let i = 0; i < 120 / STEP && game.state === 'playing'; i++) {
      seen.add(game.phase);
      expect(dodge(game)).toBe(true);
      if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
      game.update(STEP);
    }
    expect([...seen]).toEqual(BOSS_PHASES.map((phase) => phase.id));
  });

  it('commits an orb late, to the lane Matthew is in when it locks', () => {
    const game = new BossRunner();
    game.startFight();
    until(game, () => game.attackKind === 'orb');
    // It is in the air with nothing marked: the flight is the warning.
    expect(game.cues.orbs).toHaveLength(1);
    expect(game.cues.orbs[0]?.lane).toBe(null);
    expect(game.markedLanes).toEqual([]);
    game.swipe(game.lane === 0 ? 1 : -1);
    const laneAtLock = game.lane;
    until(game, () => game.markedLanes.length > 0, 3);
    expect(game.markedLanes).toEqual([laneAtLock]);
    // And then it never changes its mind.
    const committed = new Set<number>();
    until(game, () => {
      for (const lane of game.markedLanes) committed.add(lane);
      return game.beat === 'exposed';
    }, 4);
    expect([...committed]).toEqual([laneAtLock]);
  });

  it('cannot be collected while it is still falling, only once it settles', () => {
    const game = new BossRunner();
    game.startFight();
    untilSafely(game, () => game.cues.gift !== null);
    const gift = game.cues.gift!;
    expect(gift.phase).toBe('falling');
    // Never spawned underneath him, so it always costs a deliberate move.
    expect(gift.lane).not.toBe(game.lane);

    // Standing in the lane during the descent commits him to where it will
    // land; it does not score. Scoring here is what made it read as dragged in.
    game.swipe(game.lane < gift.lane ? 1 : -1);
    expect(game.lane).toBe(gift.lane);
    game.update(STEP);
    expect(game.cues.gift?.phase).toBe('falling');
    expect(game.score).toBe(0);
    expect(game.events).toEqual([]);

    untilSafely(game, () => game.cues.gift?.phase !== 'falling', 3);
    expect(game.score).toBe(100);
    expect(game.events).toEqual([{ t: 'gift', level: 3 }]);
    // Once only, and leaving the lane cannot un-take it.
    advance(game, 1.5);
    expect(game.score).toBe(100);
    expect(game.events.filter((event) => event.t === 'gift')).toHaveLength(1);
  });

  it('credits a settled gift the moment Matthew reaches it, not when it expires', () => {
    const game = new BossRunner();
    game.startFight();
    untilSafely(game, () => game.cues.gift?.phase === 'idle', 10);
    const gift = game.cues.gift!;
    expect(game.score).toBe(0);
    game.swipe(game.lane < gift.lane ? 1 : -1);
    game.update(STEP);
    expect(game.score).toBe(100);
    expect(game.events).toEqual([{ t: 'gift', level: 3 }]);
  });

  it('lets a missed gift expire without points or healing', () => {
    const game = new BossRunner();
    game.startFight();
    untilSafely(game, () => game.cues.gift !== null);
    const hp = game.playerHp;
    untilSafely(game, () => game.cues.gift === null,
      BOSS_RULES.giftFallSeconds + BOSS_RULES.giftPickupSeconds + GIFT_TIMING.fade + 1);
    expect(game.score).toBe(0);
    expect(game.playerHp).toBe(hp);
    expect(game.events).toEqual([]);
  });

  it('emits one short orb explosion only when the committed lane hits Matthew', () => {
    const hit = new BossRunner();
    hit.startFight();
    until(hit, () => hit.attackKind === 'orb');
    const hpBefore = hit.playerHp;
    until(hit, () => hit.cues.orbImpacts.length > 0, 4);
    expect(hit.playerHp).toBe(hpBefore - 1);
    expect(hit.cues.orbImpacts).toHaveLength(1);
    expect(hit.cues.orbImpacts[0]?.lane).toBe(hit.lane);
    advance(hit, 0.5);
    expect(hit.cues.orbImpacts).toHaveLength(0);

    const dodged = new BossRunner();
    dodged.startFight();
    until(dodged, () => dodged.attackKind === 'orb');
    const safeHp = dodged.playerHp;
    until(dodged, () => dodged.markedLanes.length > 0, 3);
    expect(dodge(dodged)).toBe(true);
    until(dodged, () => dodged.beat === 'exposed', 4);
    expect(dodged.playerHp).toBe(safeHp);
    expect(dodged.cues.orbImpacts).toHaveLength(0);
  });

  it('can lose, then restart without carrying health, score or events', () => {
    const game = new BossRunner();
    game.startFight();
    // Standing still is never safe in any pattern, so doing nothing loses.
    until(game, () => game.state === 'defeat', 90);
    expect(game.playerHp).toBe(0);
    expect(game.events.at(-1)).toEqual({ t: 'defeat' });
    const frozen = game.score;
    advance(game, 5);
    expect(game.score).toBe(frozen);
    expect(game.fire()).toBe(false);
    expect(game.cues.strikes).toEqual([]);
    expect(game.cues.orbs).toEqual([]);
    game.reset();
    expect(game.state).toBe('practice');
    expect(game.playerHp).toBe(5);
    expect(game.bossHp).toBe(100);
    expect(game.score).toBe(0);
    expect(game.events).toEqual([]);
    expect(game.cues.cake.phase).toBe('held');
  });

  it('can win with valid once-only local score events', () => {
    const game = new BossRunner();
    game.startFight();
    play(game);
    expect(game.state).toBe('victory');
    expect(game.playerHp).toBeGreaterThan(0);
    expect(game.bossHp).toBe(0);
    expect(game.events.at(-1)).toEqual({ t: 'victory' });
    expect(scoreRun(game.events).violations).toEqual([]);
    expect(scoreRun(game.events).levelScores[2]).toBe(game.score);
    expect(game.score).toBeLessThanOrEqual(LEVEL_MAX[3]);
    expect(game.practice.activeShots).toHaveLength(0);
    const count = game.events.length;
    advance(game, 5);
    expect(game.events).toHaveLength(count);
    expect(game.fire()).toBe(false);
  });

  it('offers all four gifts in a win even when damage is never withheld', () => {
    // The regression that matters most. Gifts used to run on a wall clock, so
    // killing her efficiently finished the fight before the fourth had
    // spawned and the advertised 1,100 maximum needed deliberate stalling.
    // Anchoring gifts to her exposed windows makes full marks a reward for
    // playing well rather than for playing slowly.
    const game = new BossRunner();
    game.startFight();
    play(game, 120, true);
    expect(game.state).toBe('victory');
    expect(game.events.filter((event) => event.t === 'gift')).toHaveLength(4);
    expect(game.score).toBe(LEVEL_MAX[3]);
    expect(scoreRun(game.events).violations).toEqual([]);
  });

  it('never spawns a fifth gift however long the fight runs', () => {
    const game = new BossRunner();
    game.startFight();
    // Dodge everything, never fire: the fight runs far past four windows.
    for (let i = 0; i < 90 / STEP && game.state === 'playing'; i++) {
      const gift = game.cues.gift;
      if (gift?.phase === 'idle' && game.lane !== gift.lane && !game.inDanger) {
        game.swipe(game.lane < gift.lane ? 1 : -1);
      } else {
        expect(dodge(game)).toBe(true);
      }
      game.update(STEP);
    }
    expect(game.bossHp).toBe(100);
    expect(game.events.filter((event) => event.t === 'gift')).toHaveLength(4);
    expect(game.score).toBe(400);
    expect(scoreRun(game.events).violations).toEqual([]);
  });

  it('takes about five exposed windows to beat, and runs in a sane time', () => {
    const game = new BossRunner();
    game.startFight();
    let seconds = 0;
    let windows = 0;
    let wasExposed = false;
    for (let i = 0; i < 120 / STEP && game.state === 'playing'; i++) {
      expect(dodge(game)).toBe(true);
      if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
      game.update(STEP);
      const exposed = game.beat === 'exposed';
      if (exposed && !wasExposed) windows++;
      wasExposed = exposed;
      seconds += STEP;
    }
    expect(game.state).toBe('victory');
    // Pins the design target so a timing change cannot quietly turn the
    // finale back into a sixteen-second fight.
    expect(windows).toBeGreaterThanOrEqual(4);
    expect(windows).toBeLessThanOrEqual(6);
    expect(seconds).toBeGreaterThan(24);
    expect(seconds).toBeLessThan(45);
  });

  it('resolves a killing shot before the attack that would have hit Matthew', () => {
    const game = new BossRunner();
    game.startFight();
    play(game, 120);
    expect(game.state).toBe('victory');
    // No damage event may follow the outcome, and no event at all may be
    // appended after it.
    const outcomeAt = game.events.findIndex((event) => event.t === 'victory');
    expect(outcomeAt).toBe(game.events.length - 1);
  });
  it('jams the cannon after a blocked shot, but never after one that lands', () => {
    const game = new BossRunner();
    game.startFight();
    // Her shield is up for the whole attack beat, so this one bounces.
    expect(game.fire()).toBe(true);
    advance(game, game.practice.flightSeconds + 0.02);
    expect(game.cues.shield.phase).toBe('blocked');
    expect(game.cues.gun.jammed).toBe(true);
    expect(game.cues.gun.ready).toBe(false);
    // The lockout is the point: mashing the button is no longer free.
    expect(game.fire()).toBe(false);
    advance(game, BOSS_RULES.blockedLockoutSeconds);
    expect(game.cues.gun.jammed).toBe(false);
    expect(game.cues.gun.ready).toBe(true);

    // Firing when she is actually open costs only the ordinary cooldown.
    until(game, () => game.beat === 'exposed');
    expect(game.fire()).toBe(true);
    advance(game, game.practice.flightSeconds + 0.02);
    expect(game.bossHp).toBe(95);
    expect(game.cues.gun.jammed).toBe(false);
  });

  it('charges a heart and an incident for every hit, and floors the score at zero', () => {
    const game = new BossRunner();
    game.startFight();
    until(game, () => game.state === 'defeat', 90);
    const incidents = game.events.filter((event) => event.t === 'incident');
    expect(incidents).toHaveLength(5);
    expect(incidents.every((event) => event.t === 'incident' && event.level === 3)).toBe(true);
    // Five penalties with nothing earned cannot drive the level negative.
    expect(game.score).toBe(0);
    const scored = scoreRun(game.events);
    expect(scored.levelScores[2]).toBe(game.score);
    expect(scored.violations).toEqual([]);
  });

  it('costs one heart and one incident even when two lanes are marked', () => {
    const game = new BossRunner();
    game.startFight();
    // Damage her into the phase that uses double strikes.
    for (let i = 0; i < 60 / STEP && game.phase === 'opening'; i++) {
      expect(dodge(game)).toBe(true);
      if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
      game.update(STEP);
    }
    for (let i = 0; i < 30 / STEP && game.attackKind !== 'double'; i++) {
      expect(dodge(game)).toBe(true);
      game.update(STEP);
    }
    expect(game.attackKind).toBe('double');
    expect(game.markedLanes).toHaveLength(2);
    // Stand in a marked lane and take it. Two strikes, one heart.
    expect(game.inDanger).toBe(true);
    const hp = game.playerHp;
    const before = game.events.filter((event) => event.t === 'incident').length;
    until(game, () => game.playerHp < hp, 4);
    expect(game.playerHp).toBe(hp - 1);
    expect(game.events.filter((event) => event.t === 'incident')).toHaveLength(before + 1);
  });

  it('keeps the local score identical to the authoritative recompute throughout', () => {
    const game = new BossRunner();
    game.startFight();
    // Never dodge the first attack, so penalties and rewards interleave.
    for (let i = 0; i < 90 / STEP && game.state === 'playing'; i++) {
      const gift = game.cues.gift;
      if (gift?.phase === 'idle' && game.lane !== gift.lane) game.swipe(game.lane < gift.lane ? 1 : -1);
      else dodge(game);
      if (game.beat === 'exposed' && game.cooldownLeft === 0) game.fire();
      game.update(STEP);
      expect(scoreRun(game.events).levelScores[2]).toBe(game.score);
    }
    expect(scoreRun(game.events).violations).toEqual([]);
  });
});
