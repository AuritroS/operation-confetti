/**
 * Level 1: The Gift Vault (design doc §5).
 *
 * Three lanes on a straight rooftop route with automatic forward travel.
 * Swipe is the only required action.
 *
 * Pacing: speed ramps 7 to 11 u/s across 487 units, which integrates to
 * about 55 seconds — the bottom of the doc's 55-65s window, where a flat
 * 7.5 u/s sat at the top. Adding the teaching beats and four guard encounters first pushed
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
 * Authored route, built as three acts that ramp.
 *
 * The levers are variety, spacing, telegraph length and how many lanes a
 * single encounter closes. No new mechanic is introduced partway through —
 * the player learns one verb and the level keeps finding new questions to
 * ask with it.
 *
 *   ACT 1  0-150   learn      one hazard type, wide gaps, ~7.5 u/s
 *   ACT 2  150-320 combine    all three types, 30u locks, ~9 u/s
 *   ACT 3  320-487 pressure   two lanes closed at once, 24-26u locks, ~10.5 u/s
 *
 * Act three's locks were lengthened when the speed ramp went in: 20 units at
 * 10.5 u/s is 1.9 seconds, which clears the floor but leaves little room,
 * and the warning should not shrink just because the player is moving
 * faster.
 *
 * Even at the tightest, 2.7 seconds of warning is well past the 1.2s floor.
 * Two invariants are enforced by test rather than inspection: no encounter
 * ever closes all three lanes, and no gap or lock lead falls under the floor.
 *
 * Teaching comes first: two unscored gifts, the second needing a sideways
 * move, before any hazard exists (§5). Neither counts toward the four scored
 * gifts, so the 600-point maximum is unchanged.
 */
const entities: RouteEntity[] = [
  // ===== ACT 1 — learn ==================================================
  { id: 't1', kind: 'gift', z: 26, lane: LANES.middle, scored: false },
  { id: 't2', kind: 'gift', z: 53, lane: LANES.right, scored: false },
  { id: 'g1', kind: 'gift', z: 83, lane: LANES.middle, scored: true },
  // First hazard, and the only kind in this act.
  { id: 'h1', kind: 'hazard', z: 120, lane: LANES.left, scored: false, style: 'laser' },

  // ===== ACT 2 — combine ================================================
  { id: 'g2', kind: 'gift', z: 153, lane: LANES.right, scored: true },
  // First spotlight, with the longest warning it ever gives.
  { id: 'h2', kind: 'hazard', z: 185, lane: LANES.right, scored: false, style: 'spotlight', lockLead: 30 },
  { id: 'h3', kind: 'hazard', z: 218, lane: LANES.middle, scored: false, style: 'fence' },
  { id: 'g3', kind: 'gift', z: 248, lane: LANES.left, scored: true },
  { id: 'h4', kind: 'hazard', z: 278, lane: LANES.left, scored: false, style: 'spotlight', lockLead: 30 },
  { id: 'h5', kind: 'hazard', z: 305, lane: LANES.right, scored: false, style: 'laser' },

  // ===== ACT 3 — pressure ===============================================
  // Two lanes closed: only the right is open.
  { id: 'h6', kind: 'hazard', z: 335, lane: LANES.left, scored: false, style: 'laser' },
  { id: 'h7', kind: 'hazard', z: 335, lane: LANES.middle, scored: false, style: 'spotlight', lockLead: 26 },
  // The reward sits in the lane that pinch forced them into.
  { id: 'g4', kind: 'gift', z: 360, lane: LANES.right, scored: true },
  // ...and is immediately threatened, so holding it costs a decision.
  { id: 'h8', kind: 'hazard', z: 385, lane: LANES.right, scored: false, style: 'spotlight', lockLead: 24 },
  { id: 'h9', kind: 'hazard', z: 408, lane: LANES.left, scored: false, style: 'fence' },
  // Final pinch: only the middle is open.
  { id: 'h10', kind: 'hazard', z: 432, lane: LANES.right, scored: false, style: 'laser' },
  { id: 'h11', kind: 'hazard', z: 432, lane: LANES.left, scored: false, style: 'spotlight', lockLead: 26 },
];

export const LEVEL_1: LevelConfig = {
  id: 1,
  laneCount: 3,
  laneWidth: 1.6,
  routeLength: 487,
  forwardSpeed: 7,
  endForwardSpeed: 11,
  invulnerabilitySeconds: 1,
  entities,
};
