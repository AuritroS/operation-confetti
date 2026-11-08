import { describe, expect, it } from 'vitest';
import {
  LaneStrike, MagicOrbShot, STRIKE_TIMING, SHIELD_TIMING, Shield,
  WARNING_FLOOR_SECONDS, ORB_TRAVEL_SECONDS, ORB_LOCK_SECONDS, ORB_LOCK_BLEND_SECONDS,
} from '../src/levels/boss/telegraph';

/**
 * Properties of the combat cues that have to hold before any fight is built
 * on them. These are the invariants `docs/DESIGN_LEVEL3.md` lists as gates, tested
 * against the data rather than against a rendered frame.
 */

/** Advance in 60 Hz steps, as the fixed loop does, not in one jump. */
function run(subject: { advance(step: number): void }, seconds: number): void {
  const step = 1 / 60;
  for (let t = 0; t < seconds; t += step) subject.advance(step);
}

describe('lane strike', () => {
  it('never warns for less than the reaction floor', () => {
    expect(STRIKE_TIMING.warning).toBeGreaterThanOrEqual(WARNING_FLOOR_SECONDS);
  });

  it('keeps its committed lane for its whole life', () => {
    const strike = new LaneStrike(1, 2);
    const lanes = new Set<number>();
    for (let t = 0; t < 3; t += 1 / 60) {
      lanes.add(strike.snapshot.lane);
      strike.advance(1 / 60);
    }
    // Late retargeting is the failure this rules out: a telegraph that moves
    // after it is shown teaches the player to distrust every warning.
    expect([...lanes]).toEqual([2]);
  });

  it('walks warning then strike then recovery, and finishes', () => {
    const strike = new LaneStrike(1, 0);
    expect(strike.snapshot.phase).toBe('warning');
    run(strike, STRIKE_TIMING.warning + 0.01);
    expect(strike.snapshot.phase).toBe('strike');
    run(strike, STRIKE_TIMING.strike);
    expect(strike.snapshot.phase).toBe('recovery');
    run(strike, STRIKE_TIMING.recovery + 0.02);
    expect(strike.finished).toBe(true);
  });

  it('is only in contact during the strike window', () => {
    const strike = new LaneStrike(1, 1);
    const contactStarted: number[] = [];
    let was = false;
    for (let t = 0; t < 2.5; t += 1 / 60) {
      const now = strike.contacting;
      if (now !== was) contactStarted.push(t);
      was = now;
      strike.advance(1 / 60);
    }
    // Opens once and closes once: never twice, never still open at the end.
    expect(contactStarted).toHaveLength(2);
    expect(strike.contacting).toBe(false);
  });

  it('reports progress inside the current phase, never beyond it', () => {
    const strike = new LaneStrike(1, 0);
    for (let t = 0; t < 2.5; t += 1 / 60) {
      const { progress } = strike.snapshot;
      expect(progress).toBeGreaterThanOrEqual(0);
      expect(progress).toBeLessThanOrEqual(1);
      strike.advance(1 / 60);
    }
  });
});

describe('shield', () => {
  it('starts up and closed', () => {
    const shield = new Shield();
    expect(shield.open).toBe(false);
    expect(shield.snapshot.phase).toBe('up');
  });

  it('does not open because a shot was blocked', () => {
    const shield = new Shield();
    shield.block();
    expect(shield.snapshot.phase).toBe('blocked');
    // A block is feedback, not a state change. If blocking opened her, the
    // player would be rewarded for hitting a raised shield.
    expect(shield.open).toBe(false);
    run(shield, SHIELD_TIMING.blocked + 0.02);
    expect(shield.snapshot.phase).toBe('up');
    expect(shield.open).toBe(false);
  });

  it('opens and closes only when told to', () => {
    const shield = new Shield();
    shield.setOpen(true);
    expect(shield.open).toBe(true);
    run(shield, 2);
    expect(shield.open).toBe(true);
    shield.setOpen(false);
    expect(shield.open).toBe(false);
  });

  it('ignores a block while she is already exposed', () => {
    const shield = new Shield();
    shield.setOpen(true);
    shield.block();
    expect(shield.snapshot.phase).toBe('down');
  });
});

describe('magic orb', () => {
  it('leaves her with no lane, so nothing can be telegraphed yet', () => {
    const orb = new MagicOrbShot(7);
    expect(orb.lane).toBe(null);
    expect(orb.snapshot.lane).toBe(null);
    expect(orb.snapshot.lockProgress).toBe(0);
    expect(orb.needsCommit).toBe(false);
  });

  it('asks for a lane at the lock time and keeps it for the rest of the flight', () => {
    const orb = new MagicOrbShot(7);
    run(orb, ORB_LOCK_SECONDS + 0.02);
    expect(orb.needsCommit).toBe(true);
    orb.commit(2);
    expect(orb.needsCommit).toBe(false);
    const lanes = new Set<number | null>();
    for (let t = 0; t < ORB_TRAVEL_SECONDS; t += 1 / 60) {
      lanes.add(orb.snapshot.lane);
      orb.advance(1 / 60);
    }
    // Committing late is the whole point of this attack, but committing twice
    // would be the retargeting that makes every warning untrustworthy.
    expect([...lanes]).toEqual([2]);
    expect(orb.finished).toBe(true);
  });

  it('refuses a second commitment', () => {
    const orb = new MagicOrbShot(3);
    orb.commit(0);
    expect(() => orb.commit(1)).toThrow(/already committed/);
    expect(orb.lane).toBe(0);
  });

  it('leaves at least the reaction floor between locking on and landing', () => {
    // Not a style note: the drifting orb is not yet a threat to any lane, so
    // the player's actual warning is only what remains after the lock.
    expect(ORB_TRAVEL_SECONDS - ORB_LOCK_SECONDS).toBeGreaterThanOrEqual(WARNING_FLOOR_SECONDS);
  });

  it('eases onto its lane from the lock time, not from the frame commit landed on', () => {
    const early = new MagicOrbShot(1);
    const late = new MagicOrbShot(2);
    // Same lock time, committed on different frames by a jittery caller.
    run(early, ORB_LOCK_SECONDS + 1 / 60);
    run(late, ORB_LOCK_SECONDS + 3 / 60);
    early.commit(1);
    late.commit(1);
    run(early, ORB_LOCK_BLEND_SECONDS);
    run(late, ORB_LOCK_BLEND_SECONDS - 2 / 60);
    // Both have now been flying for the same total time, so the swing must be
    // at the same point regardless of when `commit` was called.
    expect(early.snapshot.lockProgress).toBeCloseTo(late.snapshot.lockProgress, 5);
    expect(early.snapshot.lockProgress).toBe(1);
  });

  it('advances monotonically and clamps at one', () => {
    const orb = new MagicOrbShot(1);
    let previous = -1;
    for (let t = 0; t < ORB_TRAVEL_SECONDS * 1.5; t += 1 / 60) {
      const { progress } = orb.snapshot;
      expect(progress).toBeGreaterThanOrEqual(previous);
      expect(progress).toBeLessThanOrEqual(1);
      previous = progress;
      orb.advance(1 / 60);
    }
    expect(orb.snapshot.progress).toBe(1);
  });

  it('is slow enough to read and to cross lanes away from', () => {
    expect(ORB_TRAVEL_SECONDS).toBeGreaterThanOrEqual(WARNING_FLOOR_SECONDS);
  });
});
