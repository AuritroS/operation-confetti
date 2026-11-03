/**
 * Level content types (design doc §5, §11).
 *
 * Level content is plain data so tuning is a config edit, not a code change.
 * Nothing here knows about meshes: the renderer maps `kind` to a visual, which
 * is the seam that lets primitives be swapped for real assets without touching
 * collisions or timings.
 */

/**
 * `guard` is a hazard like `obstacle`, with identical collision semantics.
 * The difference is presentational: a guard telegraphs its lane with a
 * searchlight before the player reaches it.
 *
 * Its lane is authored, never chosen at runtime. The doc forbids targeting a
 * lane on hidden last-millisecond input (§7), and the simplest way to be
 * certain of that is to give the simulation no way to decide.
 */
export type EntityKind = 'gift' | 'obstacle' | 'guard';

/** Hazard kinds, which cost an incident on contact. */
export const HAZARD_KINDS: readonly EntityKind[] = ['obstacle', 'guard'];

export function isHazard(kind: EntityKind): boolean {
  return HAZARD_KINDS.includes(kind);
}

/** How a hazard is presented. Gameplay reads none of this. */
export type HazardStyle = 'laser' | 'turret' | 'blocker';

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
  /**
   * Visual treatment for a hazard. Purely presentational: every style has the
   * same collider and the same penalty, so changing one cannot alter
   * difficulty.
   */
  readonly style?: HazardStyle;
}

export interface LevelConfig {
  readonly id: 1 | 2 | 3;
  readonly laneCount: number;
  readonly laneWidth: number;
  /** Total route distance in world units. */
  readonly routeLength: number;
  /** Constant forward travel, world units per second. */
  readonly forwardSpeed: number;
  /** Seconds of invulnerability after a collision (§5). */
  readonly invulnerabilitySeconds: number;
  readonly entities: readonly RouteEntity[];
}

/**
 * Collision half-depths along the route axis, in world units.
 *
 * Contact is tested as |entityZ - travelled| < playerHalfDepth + half-depth
 * for the kind. At 7.5 u/s a 60 Hz step advances 0.125 units, so the smallest
 * window here is still eight steps wide and nothing can pass through
 * untested — no swept test or physics engine needed.
 */
export const HALF_DEPTH = {
  player: 0.45,
  gift: 0.55,
  obstacle: 0.55,
  guard: 0.6,
} as const;

/** Number of scored gifts expected per level, for HUD and validation. */
export function scoredGiftCount(level: LevelConfig): number {
  return level.entities.filter((e) => e.kind === 'gift' && e.scored).length;
}
