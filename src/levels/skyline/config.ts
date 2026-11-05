/**
 * The physical constants of level 2, in one place with no imports.
 *
 * Exists to break a cycle and to end a class of bug. The scene authors
 * encounters and the course derives colliders from them, so both need the
 * same numbers; without a leaf module one would have to import the other
 * and the dependency would have to run backwards somewhere.
 *
 * More importantly: every bug this level has produced has been the same
 * shape — one physical fact written down twice and drifting. Collider
 * against art, anchor height against wire height, zone half-width against
 * motion bounds, entity times against test literals. Anything here is
 * written once and derived everywhere else.
 */
import type { Lane, TravelMode } from './types';

export const BAY = 27.2;

/**
 * Progressive curved speed ramp (Option 3):
 * Starts at 8.0 u/s and smoothly accelerates to 18.0 u/s at t=45s via v(t) = v0 + dv * (t/D)^1.5.
 * - Act 1 (0-11s):  8.0 ->  9.2 u/s (calm warmup, forgiving reactions)
 * - Act 2 (11-23s): 9.2 -> 11.6 u/s (building momentum through gantry/barricade)
 * - Act 3 (23-34s): 11.6 -> 14.6 u/s (fast slalom weaves)
 * - Act 4 (34-45s): 14.6 -> 18.0 u/s (high-octane runaway climax!)
 *
 * Integrated distance across 45s: z(45) = 540.0m (v_avg = 12.0 u/s).
 */
const START_SPEED = 8.0;
const END_SPEED = 18.0;
const DURATION = 45;
const DELTA_SPEED = END_SPEED - START_SPEED; // 10.0 u/s
const D_POW_1_5 = Math.pow(DURATION, 1.5); // 45^1.5 ≈ 301.869
const K_POS = DELTA_SPEED / (2.5 * D_POW_1_5); // 10 / (2.5 * 301.869)
const K_ACCEL = (1.5 * DELTA_SPEED) / D_POW_1_5; // 15 / 301.869

export function speedAt(t: number): number {
  if (t <= 0) return START_SPEED;
  if (t >= DURATION) return END_SPEED;
  return START_SPEED + (DELTA_SPEED / D_POW_1_5) * t * Math.sqrt(t);
}

export function accelerationAt(t: number): number {
  if (t <= 0 || t >= DURATION) return 0;
  return K_ACCEL * Math.sqrt(t);
}

export const ROUTE_LENGTH = 540.0;

export function positionAt(t: number): number {
  if (t <= 0) return t * START_SPEED;
  const clamped = Math.min(DURATION, t);
  const z = START_SPEED * clamped + K_POS * clamped * clamped * Math.sqrt(clamped);
  return t > DURATION ? z + END_SPEED * (t - DURATION) : z;
}

export function timeAt(z: number): number {
  if (z <= 0) return z / START_SPEED;
  if (z >= ROUTE_LENGTH) return DURATION + (z - ROUTE_LENGTH) / END_SPEED;
  // Newton-Raphson inversion with initial guess z / v_avg.
  // 4 unrolled iterations reach machine precision (< 1e-13).
  let t = z / 12.0;
  t -= (positionAt(t) - z) / speedAt(t);
  t -= (positionAt(t) - z) / speedAt(t);
  t -= (positionAt(t) - z) / speedAt(t);
  t -= (positionAt(t) - z) / speedAt(t);
  return t;
}

/** Route parameters. */
export const COURSE = {
  duration: 45,
  /** Average speed across the route (540 / 45 = 12.0 u/s). */
  speed: 12.0,
  startSpeed: START_SPEED,
  endSpeed: END_SPEED,
  laneWidth: 3.2,
  groundY: 1.25,
  cycle: 3.2,
} as const;

/**
 * Half-width of the interactive zone.
 *
 * The contract between gameplay and decoration: lanes, anchors, gifts and
 * hazards live inside it and nothing decorative may enter.
 */
export const GAME_ZONE_HALF = 4.6;

/**
 * Player collision half-extents.
 *
 * Shared so collision, launch clearance and the debug overlay cannot
 * disagree about how wide the player is — they were three separate literals.
 */
export const PLAYER_HALF = { x: 0.35, y: 0.9, z: 0.35 } as const;

/**
 * How long the `land` phase lasts, in seconds.
 *
 * Presentation only — nothing in collision, scoring or the solver reads the
 * phase, and the landing clip and the crouch are its only consumers. It
 * lived as a bare 0.28 in both `motion.ts` and `skyline-scene.ts`, which is
 * how it came to disagree with the clip: `Jump_Land` runs 0.67s, so at 0.28
 * the landing was cut off 42% in and replaced by the run.
 *
 * The clip is now time-scaled to whatever this says, so this is the one
 * dial. Raise it for a heavier landing, lower it for a snappier one; the
 * animation fits either way.
 */
export const LAND_TIME = 0.42;

/**
 * The furthest the player's CENTRE may travel from the middle lane.
 *
 * Derived, not chosen: the body adds `PLAYER_HALF.x`, so a centre at this
 * limit still keeps the whole collider inside the zone. `motion.ts` used
 * `laneWidth + 2.5` = 5.7, independently of the zone, and a probe reached
 * x=5.204 with ordinary inputs — past decoration that is placed on the
 * assumption of being unreachable.
 */
export const MOTION_LIMIT_X = GAME_ZONE_HALF - PLAYER_HALF.x;

/**
 * The two canonical height bands, as [bottom, top].
 *
 * Level 2 is three lanes by two heights. Running puts the player's collider
 * at 0.35-2.15 and swinging at 4.1-11.9 (the arc moves; the band it occupies
 * does not), so GROUND catches a runner and never a swinger, and OVERHEAD
 * the reverse.
 *
 * Authoring between the bands is possible and would not be caught by
 * playtesting, because a hazard at 7-9 depends on where in the 3.2-second
 * arc the player happens to be — which they cannot control.
 */
export const BAND = {
  ground: [0, 3],
  overhead: [5, 13],
} as const satisfies Record<string, readonly [number, number]>;

/** ~57% of a lane, so a single-lane blocker leaves a visible way past. */
const LANE_HALF_X = 0.91;
const HALF_Z = 0.45;

/** What the scene can place. Named outright, never inferred from a size. */
export type AssemblyId = 'laneBlock' | 'hangingSign' | 'barricade' | 'bridge' | 'gift';

export interface AssemblySpec {
  readonly kind: 'gift' | 'hazard';
  /** Null for a gift, whose height comes from the route it sits on. */
  readonly band: readonly [number, number] | null;
  readonly halfX: number;
  readonly halfZ: number;
}

/**
 * Assembly to collider. The ONE place a shape becomes a volume.
 *
 * The renderer used to infer "bridge" or "sign" or "barrier" from a
 * collider's width and bottom height, which is how `cone-right` ended up
 * rendering as a row of barriers. The arrow now points the other way: the
 * scene names the assembly and the collider follows from it.
 *
 * A span assembly blocks the whole interactive zone BY DEFINITION, so its
 * half-width is the zone's. At 4.5 against a 4.6 zone it left a 0.1-unit
 * strip that looked blocked and was not.
 */
export const ASSEMBLY: Record<AssemblyId, AssemblySpec> = {
  laneBlock: { kind: 'hazard', band: BAND.ground, halfX: LANE_HALF_X, halfZ: HALF_Z },
  hangingSign: { kind: 'hazard', band: BAND.overhead, halfX: LANE_HALF_X, halfZ: HALF_Z },
  barricade: { kind: 'hazard', band: BAND.ground, halfX: GAME_ZONE_HALF, halfZ: 0.53 },
  bridge: { kind: 'hazard', band: BAND.overhead, halfX: GAME_ZONE_HALF, halfZ: 0.95 },
  /**
   * Sized to FILL its collider rather than to a real present's proportions,
   * and the same size as level 1's so the two levels read as one game.
   */
  gift: { kind: 'gift', band: null, halfX: 0.8, halfZ: 0.8 },
};

/** Centre and half-height for a band, so no caller restates the arithmetic. */
export function bandBox(band: readonly [number, number]): { y: number; halfY: number } {
  return { y: (band[0] + band[1]) / 2, halfY: (band[1] - band[0]) / 2 };
}

/** What the scene writes down. Everything else about an encounter derives. */
export interface Encounter {
  readonly id: string;
  readonly assembly: AssemblyId;
  readonly lane: Lane;
  /**
   * Seconds along the route, not units.
   *
   * Beats are a rhythm the player feels, and a speed change should move the
   * geometry rather than the pacing. `z` derives as `t * speed`.
   */
  readonly t: number;
  /** Gifts only: which height band the route puts it on. */
  readonly mode?: TravelMode;
  /** Gifts only. Unscored gifts teach without counting toward the cap. */
  readonly scored?: boolean;
}
