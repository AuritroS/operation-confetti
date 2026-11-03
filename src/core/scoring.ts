/**
 * Pure scoring rules (design doc §8).
 *
 * Shared by the browser (for display) and the Worker (authoritative recompute).
 * No time bonuses, no frame-rate dependence, no cross-level carry-over.
 *
 * Per-level maxima: 600 / 600 / 1100.  Overall maximum: 2300.
 */

export const SCORING_VERSION = 1;

export const POINTS = {
  gift: 100,
  incident: -50,
  routeComplete: 200,
  perBossHp: 5,
  victory: 200,
} as const;

export const RULES = {
  giftsPerLevel: 4,
  bossMaxHp: 100,
  playerMaxHp: 5,
  confettiDamage: 5,
} as const;

export type Level = 1 | 2 | 3;

export type RunEvent =
  | { t: 'gift'; level: Level }
  | { t: 'incident'; level: 1 | 2 }
  | { t: 'routeComplete'; level: 1 | 2 }
  | { t: 'bossDamage'; amount: number }
  | { t: 'victory' }
  | { t: 'defeat' };

export interface ScoreResult {
  levelScores: [number, number, number];
  total: number;
  outcome: 'win' | 'loss' | 'incomplete';
  /** Human-readable reasons the event stream was not fully valid. */
  violations: string[];
}

const LEVEL_MAX: Record<Level, number> = { 1: 600, 2: 600, 3: 1100 };

/**
 * Reduce an event stream to scores.
 *
 * Invariants enforced here:
 *  - Each level clamps to a floor of zero after every penalty.
 *  - Gifts beyond `giftsPerLevel` are ignored, so duplicate pickups cannot
 *    inflate a score.
 *  - Boss damage is capped at the boss's remaining HP, so overkill and
 *    post-defeat hits are never credited.
 *  - A level's route may only complete once.
 */
export function scoreRun(events: readonly RunEvent[]): ScoreResult {
  const levels: [number, number, number] = [0, 0, 0];
  const gifts: Record<Level, number> = { 1: 0, 2: 0, 3: 0 };
  const routeDone = { 1: false, 2: false };
  const violations: string[] = [];

  let bossHpRemaining = RULES.bossMaxHp;
  let outcome: 'win' | 'loss' | 'incomplete' = 'incomplete';

  const add = (level: Level, delta: number): void => {
    const i = level - 1;
    // Clamp immediately so a penalty can never create a negative level score.
    levels[i] = Math.max(0, (levels[i] ?? 0) + delta);
  };

  for (const ev of events) {
    if (outcome !== 'incomplete') {
      // Gameplay stops at the outcome; later events are not scored (§7).
      violations.push(`event "${ev.t}" after outcome`);
      continue;
    }

    switch (ev.t) {
      case 'gift': {
        if (gifts[ev.level] >= RULES.giftsPerLevel) {
          violations.push(`extra gift in level ${ev.level}`);
          break;
        }
        gifts[ev.level]++;
        add(ev.level, POINTS.gift);
        break;
      }

      case 'incident': {
        add(ev.level, POINTS.incident);
        break;
      }

      case 'routeComplete': {
        if (routeDone[ev.level]) {
          violations.push(`level ${ev.level} route completed twice`);
          break;
        }
        routeDone[ev.level] = true;
        add(ev.level, POINTS.routeComplete);
        break;
      }

      case 'bossDamage': {
        if (!Number.isFinite(ev.amount) || ev.amount <= 0) {
          violations.push('non-positive boss damage');
          break;
        }
        if (ev.amount > RULES.confettiDamage) {
          violations.push(`boss damage ${ev.amount} exceeds per-shot maximum`);
          break;
        }
        // Credit only HP actually removed. Never score shield hits or overkill.
        const credited = Math.min(ev.amount, bossHpRemaining);
        if (credited <= 0) {
          violations.push('boss damage with no HP remaining');
          break;
        }
        bossHpRemaining -= credited;
        add(3, credited * POINTS.perBossHp);
        break;
      }

      case 'victory': {
        if (bossHpRemaining > 0) violations.push('victory with boss HP remaining');
        outcome = 'win';
        add(3, POINTS.victory);
        break;
      }

      case 'defeat': {
        outcome = 'loss';
        break;
      }
    }
  }

  for (const lv of [1, 2, 3] as Level[]) {
    const v = levels[lv - 1] ?? 0;
    if (v > LEVEL_MAX[lv]) {
      violations.push(`level ${lv} score ${v} exceeds maximum ${LEVEL_MAX[lv]}`);
      levels[lv - 1] = LEVEL_MAX[lv];
    }
  }

  return {
    levelScores: levels,
    total: levels[0] + levels[1] + levels[2],
    outcome,
    violations,
  };
}

export const MAX_TOTAL = LEVEL_MAX[1] + LEVEL_MAX[2] + LEVEL_MAX[3];
export { LEVEL_MAX };
