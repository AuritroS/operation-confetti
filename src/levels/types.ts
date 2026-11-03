/**
 * Level content types (design doc §5, §11).
 *
 * Level content is plain data so tuning is a config edit, not a code change.
 * Nothing here knows about meshes: the renderer maps `kind` to a visual, which
 * is the seam that lets primitives be swapped for real assets without touching
 * collisions or timings.
 */

/**
 * Two kinds only.
 *
 * Guards were removed: a pool of skinned characters cost up to 16 draw calls
 * and two mixers to deliver a threat the searchlight already conveys on its
 * own — and a spotlight is the more iconic thief-game danger anyway. Every
 * hazard is now procedural and magenta, which is what makes the "avoid"
 * signal unambiguous.
 */
export type EntityKind = 'gift' | 'hazard';

/**
 * How a hazard is drawn. Purely presentational: all three share one collider
 * and one penalty, so the shape can never change the difficulty.
 *
 *   laser     two horizontal beams across the lane
 *   fence     vertical pillars filling the lane
 *   spotlight a cone that sweeps, locks to the lane, then strikes
 *
 * Distinct silhouettes in one colour, so the kind is readable at a glance
 * while the meaning never is in doubt. An earlier turret used a pack mesh and
 * failed exactly that test: a small beige object on a dark roof reads as
 * scenery.
 */
export type HazardStyle = 'laser' | 'fence' | 'spotlight';

/** Hazard collision half-depths along the route, in world units. */
/**
 * Collision half-depths along the route axis, in world units.
 *
 * Contact is |entityZ - travelled| < playerHalfDepth + the kind's half-depth.
 * At 7.5 u/s a 60 Hz step advances 0.125 units, so the window is eight steps
 * wide and nothing passes through untested — no swept test needed.
 */
export const HALF_DEPTH = {
  player: 0.45,
  gift: 0.55,
  hazard: 0.55,
} as const;

export interface RouteEntity {
  /** Stable id. Used to mark an entity resolved so it cannot score twice. */
  readonly id: string;
  readonly kind: EntityKind;
  /** Distance along the route, in world units, where the entity sits. */
  readonly z: number;
  /** Lane index, 0-based from the left. */
  readonly lane: number;
  /**
   * Scored gifts count toward the level maximum. An unscored gift is a
   * tutorial demonstration and must stay outside the four scored gifts (§5).
   */
  readonly scored: boolean;
  readonly style?: HazardStyle;
  /**
   * Spotlights only: how far ahead the cone commits to its lane, in units.
   * Shorter means less warning, which is the difficulty dial for act three.
   * Never below the reaction floor; a test enforces that.
   */
  readonly lockLead?: number;
}

export interface LevelConfig {
  readonly id: 1 | 2 | 3;
  readonly laneCount: number;
  readonly laneWidth: number;
  /** Total route distance in world units. */
  readonly routeLength: number;
  /** Forward travel at the start of the route, world units per second. */
  readonly forwardSpeed: number;
  /**
   * Forward travel at the route end. Omit for a constant-speed level.
   *
   * Speed ramps linearly with distance, which compounds with the spacing
   * ramp: later encounters are both closer together and arriving faster.
   * Every reaction-time check therefore has to use the speed at that point
   * in the route, not the starting speed — a test that divides by
   * `forwardSpeed` would quietly understate the difficulty of act three.
   */
  readonly endForwardSpeed?: number;
  /** Seconds of invulnerability after a collision (§5). */
  readonly invulnerabilitySeconds: number;
  readonly entities: readonly RouteEntity[];
}

/**
 * Minimum reaction time, in seconds (design doc §5).
 *
 * Every gap between encounters and every spotlight lock lead is checked
 * against this, so tightening the ramp cannot quietly make the level unfair.
 */
export const MIN_REACTION_SECONDS = 1.2;

/**
 * Forward speed at a point along the route.
 *
 * The single source of truth for the ramp, shared by the runner and by the
 * tests that check reaction time, so the two can never disagree.
 */
export function speedAt(level: LevelConfig, travelled: number): number {
  const end = level.endForwardSpeed ?? level.forwardSpeed;
  if (end === level.forwardSpeed) return level.forwardSpeed;
  const t = Math.min(1, Math.max(0, travelled / level.routeLength));
  return level.forwardSpeed + (end - level.forwardSpeed) * t;
}

/**
 * Seconds a player has between two points, accounting for the ramp.
 *
 * Uses the speed at the later point, which is the conservative reading: that
 * is how fast they will actually be moving when the decision lands.
 */
export function secondsBetween(level: LevelConfig, fromZ: number, toZ: number): number {
  return (toZ - fromZ) / speedAt(level, toZ);
}

/** Number of scored gifts expected per level, for HUD and validation. */
export function scoredGiftCount(level: LevelConfig): number {
  return level.entities.filter((e) => e.kind === 'gift' && e.scored).length;
}
