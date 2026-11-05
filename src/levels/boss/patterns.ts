/**
 * The attack script, as plain data.
 *
 * `docs/COLLABORATION.md` puts lane geometry, timings and attack sequences in
 * the data layer so the simulation reads a table rather than hard-coding a
 * fight. Everything here is declarative: `runner.ts` interprets it and owns
 * every clock, every commitment and all damage.
 *
 * Why phases at all: with one attack per beat the fight has exactly one
 * answer — swipe once, either direction, the moment a warning appears — and
 * nothing to read. Escalating the number of attacks per beat, and introducing
 * a pattern that marks two lanes so only one is safe, is what turns "move" into
 * "move *there*".
 */

/**
 * - `strike`   one lane marked, committed to Matthew's lane at its start.
 * - `double`   two lanes marked, leaving exactly one safe lane, always within
 *              a single swipe of Matthew. Standing still is never safe.
 * - `orb`      a slow projectile that commits its lane partway down the deck,
 *              so its flight is the warning rather than a floor marker.
 */
export type AttackKind = 'strike' | 'double' | 'orb';

/**
 * One beat is a sequence of attacks. The next begins only when the previous
 * has finished, so two commitments are never live at once and every attack
 * keeps a reachable escape.
 */
export interface BeatSpec {
  readonly attacks: readonly AttackKind[];
}

export interface PhaseSpec {
  readonly id: string;
  /** This phase applies while Aurora's HP is strictly above this value. */
  readonly aboveHp: number;
  /** Cycled by beat index, so a phase can alternate its beats. */
  readonly beats: readonly BeatSpec[];
  /** Quiet time after her exposed window closes, before the next beat. */
  readonly gapSeconds: number;
}

/**
 * Ordered high HP to low. The phase is re-read at the start of every beat, so
 * a burst of damage escalates her immediately rather than at the next cycle.
 */
export const BOSS_PHASES: readonly PhaseSpec[] = [
  {
    // Teaching. One attack, one answer, generous room between beats.
    id: 'opening',
    aboveHp: 60,
    beats: [{ attacks: ['strike'] }, { attacks: ['orb'] }],
    gapSeconds: 1.5,
  },
  {
    // Two attacks per beat, and the first lane-reading test.
    id: 'pressure',
    aboveHp: 30,
    beats: [{ attacks: ['strike', 'orb'] }, { attacks: ['double'] }],
    gapSeconds: 1.2,
  },
  {
    // Every beat now needs a correct lane, not merely a different one.
    id: 'finale',
    aboveHp: 0,
    beats: [{ attacks: ['double', 'orb'] }, { attacks: ['strike', 'double'] }],
    gapSeconds: 1,
  },
];

export function phaseForHp(hp: number): PhaseSpec {
  // `aboveHp: 0` on the last phase makes this total for any live boss, but
  // fall back to the final phase rather than risking undefined at 0 HP.
  return BOSS_PHASES.find((phase) => hp > phase.aboveHp) ?? BOSS_PHASES[BOSS_PHASES.length - 1]!;
}

export function beatForPhase(phase: PhaseSpec, beatIndex: number): BeatSpec {
  return phase.beats[beatIndex % phase.beats.length]!;
}

/**
 * The safe lane for a double strike, given where Matthew stands.
 *
 * Two guarantees, both gate requirements. The safe lane is never his current
 * lane, so the pattern always demands a move; and it is always exactly one
 * lane away, so a single swipe always reaches it. From an edge lane that
 * forces the centre; from the centre the side alternates on beat parity, which
 * keeps it readable and keeps the simulation deterministic for tests.
 */
export function safeLaneForDouble(lane: number, beatIndex: number, laneCount = 3): number {
  if (lane <= 0) return 1;
  if (lane >= laneCount - 1) return laneCount - 2;
  return beatIndex % 2 === 0 ? lane - 1 : lane + 1;
}

export function markedLanesForDouble(safeLane: number, laneCount = 3): number[] {
  const lanes: number[] = [];
  for (let lane = 0; lane < laneCount; lane++) if (lane !== safeLane) lanes.push(lane);
  return lanes;
}
