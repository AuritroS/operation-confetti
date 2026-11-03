/**
 * Level 1: The Gift Vault (design doc §5).
 *
 * Three lanes on a straight rooftop route with automatic forward travel.
 * Swipe is the only required action.
 *
 * Pacing: 450 units at 7.5 u/s is 60 seconds, inside the doc's 55-65s window.
 * These numbers are starting points to tune after real play, not settled
 * values — the doc is explicit that pacing is validated, not asserted.
 *
 * Safety: every hazard here is a single obstacle in one of three lanes, so two
 * safe lanes always remain. That is safe by construction. Guards, which can
 * create contradictory patterns, are not in this slice.
 *
 * Lead time: entities are at least 35 units apart. At 7.5 u/s that is 4.7
 * seconds between encounters, well past the ~1.2s minimum reaction time, and
 * fog begins at 26 units so roughly 3.5 seconds of route is always visible.
 */
import type { LevelConfig, RouteEntity } from './types';

const LANES = { left: 0, middle: 1, right: 2 } as const;

/**
 * Authored route. Gifts sit in lanes that often differ from the obvious safe
 * line, so collecting one is a choice rather than something that happens
 * automatically (§5).
 */
const entities: RouteEntity[] = [
  // --- opening: a free gift in the middle, nothing to avoid yet ----------
  { id: 'g1', kind: 'gift', z: 45, lane: LANES.middle, scored: true },

  // --- first hazard: obstacle left, gift waiting on the right ------------
  { id: 'o1', kind: 'obstacle', z: 95, lane: LANES.left, scored: false },
  { id: 'g2', kind: 'gift', z: 130, lane: LANES.right, scored: true },

  // --- second hazard: obstacle right, so the gift costs a lane change ----
  { id: 'o2', kind: 'obstacle', z: 180, lane: LANES.right, scored: false },
  { id: 'g3', kind: 'gift', z: 215, lane: LANES.left, scored: true },

  // --- third hazard: middle blocked, either side is safe -----------------
  { id: 'o3', kind: 'obstacle', z: 265, lane: LANES.middle, scored: false },

  // --- fourth hazard then the last gift behind it ------------------------
  { id: 'o4', kind: 'obstacle', z: 320, lane: LANES.left, scored: false },
  { id: 'g4', kind: 'gift', z: 365, lane: LANES.middle, scored: true },
];

export const LEVEL_1: LevelConfig = {
  id: 1,
  laneCount: 3,
  laneWidth: 1.6,
  routeLength: 450,
  forwardSpeed: 7.5,
  invulnerabilitySeconds: 1,
  entities,
};
