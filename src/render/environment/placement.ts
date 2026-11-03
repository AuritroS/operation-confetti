/**
 * Structural protection for the playable corridor.
 *
 * The rule is that decoration never enters the lanes. That is enforced here by
 * construction rather than by convention: a `Placement` cannot express an x
 * coordinate at all. It names a side and a distance BEYOND the parapet, and
 * the x is derived. There is no way to write a placement inside the corridor,
 * so no reviewer has to check for one.
 *
 * `overhead` exists because a banner spanning the route is legitimate, but it
 * demands a minimum clearance so it cannot sag into play.
 *
 * Corridor width comes from the level config, so changing the lane count or
 * width moves every prop automatically.
 */
import type { LevelConfig } from '../../levels/types';

/** Width of the rooftop parapet that bounds the play area, in world units. */
export const PARAPET_WIDTH = 0.45;

/** Nothing overhead may hang lower than this above the rooftop. */
export const MIN_OVERHEAD_CLEARANCE = 3.2;

export type Side = 'left' | 'right';

export type Placement =
  | {
      readonly side: Side;
      /** Distance beyond the outer face of the parapet. Negative is clamped. */
      readonly beyond: number;
      /** Distance along the route. */
      readonly z: number;
      readonly y?: number;
    }
  | {
      readonly overhead: true;
      readonly z: number;
      /** Height above the rooftop. Values below the minimum are raised. */
      readonly clearance: number;
      readonly offset?: number;
    };

export interface CorridorGeometry {
  /** Half the playable width — the lanes and nothing else. */
  readonly halfWidth: number;
  /** Outer face of the parapet; the innermost a prop may sit. */
  readonly edge: number;
}

export function corridorOf(level: LevelConfig): CorridorGeometry {
  const halfWidth = (level.laneWidth * level.laneCount) / 2;
  return { halfWidth, edge: halfWidth + PARAPET_WIDTH };
}

/**
 * Resolve a placement to world coordinates.
 *
 * The only function that produces an x for decoration, and it cannot produce
 * one inside the corridor.
 */
export function resolve(
  corridor: CorridorGeometry,
  placement: Placement,
): { x: number; y: number; z: number } {
  if ('overhead' in placement) {
    const offset = placement.offset ?? 0;
    // Clamp the offset so an overhead piece cannot be shoved out to the side
    // and then dropped to head height.
    const x = Math.max(-corridor.halfWidth, Math.min(corridor.halfWidth, offset));
    return {
      x,
      y: Math.max(MIN_OVERHEAD_CLEARANCE, placement.clearance),
      z: placement.z,
    };
  }

  const beyond = Math.max(0, placement.beyond);
  const sign = placement.side === 'left' ? -1 : 1;
  return {
    x: sign * (corridor.edge + beyond),
    y: placement.y ?? 0,
    z: placement.z,
  };
}

/**
 * True when a resolved point is clear of the playable corridor.
 *
 * Used by the containment test. Production code never needs it, because
 * `resolve` cannot return a violating point — which is the whole design.
 */
export function isClearOfCorridor(
  corridor: CorridorGeometry,
  point: { x: number; y: number },
): boolean {
  if (Math.abs(point.x) >= corridor.edge) return true;
  // Inside the corridor horizontally is only legal well above the player.
  return point.y >= MIN_OVERHEAD_CLEARANCE;
}
