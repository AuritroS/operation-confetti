/**
 * The geometric audit, as a gate.
 *
 * `npm run check:scene` prints the same findings as a report for when I am
 * iterating; this fails the suite so they cannot be committed. Both call
 * `auditScene` with bounds measured from the staged glTF, which is also
 * what the browser resolves from — a checker that computed placements
 * differently from the renderer would be certifying a scene nobody ships.
 */
import { describe, expect, it } from 'vitest';
import { auditScene, formatAudit } from '../src/levels/skyline/audit';
import { propLookup } from '../tools/scene-bounds';
import { SKYLINE } from '../src/levels/skyline/course';
import { SkylineRunner } from '../src/levels/skyline/runner';
import {
  COURSE,
  GAME_ZONE_HALF,
  MOTION_LIMIT_X,
  PLAYER_HALF,
} from '../src/levels/skyline/config';
import type { Direction } from '../src/levels/skyline/types';

describe('scene geometry', () => {
  const findings = auditScene(propLookup());

  it('has no errors', () => {
    const errors = findings.filter((f) => f.severity === 'error');
    expect(errors.length, `\n${formatAudit(findings)}\n`).toBe(0);
  });

  it('has no phasing warnings', () => {
    const phasing = findings.filter((f) => f.kind === 'phasing');
    expect(phasing.length, `\n${formatAudit(phasing)}\n`).toBe(0);
  });

  it('actually checks something', () => {
    // A clean audit is only meaningful if the audit can fail. Guard against
    // the checks silently becoming vacuous — an empty scene would pass
    // every assertion above.
    expect(SKYLINE.entities.length).toBeGreaterThan(10);
  });
});

describe('the player cannot leave the interactive zone', () => {
  /**
   * Decoration is placed on the assumption that the player cannot reach it,
   * and the audit's zone check is worthless if that assumption is false.
   *
   * `motion.ts` used to bound at `laneWidth + 2.5` = 5.7, chosen
   * independently of the zone, and would install the last candidate curve
   * whether or not it certified. A probe reached x=5.204 against a declared
   * 4.6. The bound is now derived from the zone, and an uncertified curve
   * is refused rather than accepted.
   */
  const patterns: Direction[][] = [
    ['right', 'up', 'left', 'left', 'up', 'down', 'up', 'up', 'left', 'right', 'down', 'up', 'right'],
    ['left', 'left', 'right', 'right', 'down', 'up', 'right', 'right', 'left', 'up', 'down', 'left'],
    ['up', 'right', 'right', 'down', 'left', 'left', 'up', 'right', 'down', 'left', 'right', 'up'],
  ];

  it('keeps the body inside the zone under adversarial input', () => {
    let worst = 0;
    let when = '';
    for (const [n, seq] of patterns.entries()) {
      for (const gap of [0.2, 0.35, 0.5, 0.8]) {
        const runner = new SkylineRunner(SKYLINE);
        let next = 0;
        for (let frame = 0; frame < 10 * 120; frame++) {
          const t = frame / 120;
          while (next < seq.length && t >= next * gap) runner.swipe(seq[next++] as Direction);
          runner.update(1 / 120);
          const x = Math.abs(runner.snapshot.p.x);
          if (x > worst) {
            worst = x;
            when = `pattern ${n}, ${gap}s apart, t=${t.toFixed(2)}`;
          }
        }
      }
    }
    expect(worst, `centre reached ${worst.toFixed(3)} (${when})`)
      .toBeLessThanOrEqual(MOTION_LIMIT_X + 1e-6);
    expect(worst + PLAYER_HALF.x, 'the body crosses the zone boundary')
      .toBeLessThanOrEqual(GAME_ZONE_HALF + 1e-6);
  });

  it('derives the motion bound from the zone rather than restating it', () => {
    expect(MOTION_LIMIT_X).toBeCloseTo(GAME_ZONE_HALF - PLAYER_HALF.x, 9);
    // And the lanes themselves must fit inside it, or an ordinary lane
    // change would be refused.
    expect(COURSE.laneWidth).toBeLessThan(MOTION_LIMIT_X);
  });
});
