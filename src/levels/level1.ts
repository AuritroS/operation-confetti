/**
 * Level 1: The Gift Vault (design doc §5).
 *
 * Three lanes on a straight rooftop route with automatic forward travel.
 * Swipe is the only required action.
 *
 * Pacing: 487 units at 7.5 u/s is 65 seconds, at the top of the doc's 55-65s
 * window. Adding the teaching beats and four guard encounters first pushed
 * this to 75s; the route was compressed rather than the target widened,
 * since the window is a stated pacing goal and 75s is a long first run for
 * a party guest. Spacing stayed proportional, so reaction time is unchanged
 * in relative terms.
 * These numbers are starting points to tune after real play, not settled
 * values — the doc is explicit that pacing is validated, not asserted.
 *
 * Safety: every hazard occupies exactly one of three lanes and no two are
 * close enough to overlap, so at least two safe lanes always remain. A test
 * asserts this rather than leaving it to inspection.
 *
 * Lead time: entities are at least 26 units apart, which at 7.5 u/s is 3.4
 * seconds between encounters — well past the ~1.2s minimum reaction time.
 */
import type { LevelConfig, RouteEntity } from './types';

const LANES = { left: 0, middle: 1, right: 2 } as const;

/**
 * Authored route.
 *
 * Teaching comes first: an unscored demonstration gift in the lane the player
 * already occupies, then an unscored one requiring a single sideways move, and
 * only then the first hazard (§5). Neither counts toward the four scored
 * gifts.
 *
 * Gifts sit in lanes that often differ from the safe line, so collecting one
 * is a decision rather than something that happens automatically.
 *
 * Guard lanes are fixed here and never chosen at runtime. The searchlight
 * locks to the authored lane well before contact, which is what satisfies
 * "telegraphs commit to a lane before impact" by construction.
 */
const entities: RouteEntity[] = [
  // --- teaching: free, unscored, no hazards yet -------------------------
  { id: 't1', kind: 'gift', z: 26, lane: LANES.middle, scored: false },
  { id: 't2', kind: 'gift', z: 53, lane: LANES.right, scored: false },

  // --- first scored gift, still no hazard -------------------------------
  { id: 'g1', kind: 'gift', z: 83, lane: LANES.middle, scored: true },

  // --- first hazard: a laser on the left, gift waiting right ------------
  { id: 'h1', kind: 'obstacle', z: 120, lane: LANES.left, scored: false, style: 'laser' },
  { id: 'g2', kind: 'gift', z: 153, lane: LANES.right, scored: true },

  // --- first guard: commits to the right, so the gift above costs a move -
  { id: 'd1', kind: 'guard', z: 187, lane: LANES.right, scored: false },

  // --- turret in the middle; either side is safe ------------------------
  { id: 'h2', kind: 'obstacle', z: 222, lane: LANES.middle, scored: false, style: 'turret' },
  { id: 'g3', kind: 'gift', z: 251, lane: LANES.left, scored: true },

  // --- guard on the left, forcing a move off the gift lane --------------
  { id: 'd2', kind: 'guard', z: 284, lane: LANES.left, scored: false },

  // --- blocker, then a laser, then the last gift behind them ------------
  { id: 'h3', kind: 'obstacle', z: 316, lane: LANES.right, scored: false, style: 'blocker' },
  { id: 'd3', kind: 'guard', z: 347, lane: LANES.middle, scored: false },
  { id: 'h4', kind: 'obstacle', z: 380, lane: LANES.left, scored: false, style: 'laser' },
  { id: 'g4', kind: 'gift', z: 411, lane: LANES.middle, scored: true },

  // --- final guard before the vault -------------------------------------
  { id: 'd4', kind: 'guard', z: 444, lane: LANES.right, scored: false },
];

export const LEVEL_1: LevelConfig = {
  id: 1,
  laneCount: 3,
  laneWidth: 1.6,
  routeLength: 487,
  forwardSpeed: 7.5,
  invulnerabilitySeconds: 1,
  entities,
};
