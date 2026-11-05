/**
 * Level 2 prop registry: the street scale space, across two packs.
 *
 * ---- why this is separate from `environment/props.ts` --------------------
 *
 * The two levels are not drawn at the same number of units per metre. Level 1
 * stands a 1.45-unit character in 1.6-unit lanes and looks down at a rooftop;
 * level 2 stands a 2.385-unit character in 3.2-unit lanes and runs through a
 * street canyon. The SAME source file therefore needs two different scales,
 * and encoding that as one table with a multiplier at the call site would
 * defeat the point of a registry — that a prop cannot reach the scene except
 * through a measured scale. Two tables, each self-checking, keeps the
 * guarantee in both spaces and leaves level 1 untouched.
 *
 * ---- two packs, two ways of deriving a scale ----------------------------
 *
 * KayKit props (`P`) are authored at wildly inconsistent sizes — a car ships
 * 0.369 tall and a building 1.55 — so each is scaled from the real-world size
 * it represents, recorded in `metres`, against a measured native height:
 *
 *     UNITS_PER_METRE = 2.385 / 1.75 = 1.363
 *
 * Kenney's City Kit Roads (`K`) is internally consistent: a streetlight is
 * already correct against its own road tile. One factor therefore preserves
 * the whole set's proportions, and second-guessing individual props would
 * break the relationships the pack already gets right. Those entries carry
 * `metres: 0` to say "scaled by pack proportion, not by real-world size".
 */

/** Level 2 world units per real-world metre. See the derivation above. */
export const UNITS_PER_METRE = 1.363;

/** An axis in the prop's own authored file. */
export type Axis = '+X' | '-X' | '+Z' | '-Z';

/**
 * A named point on a prop: a plane of its measured box, at an ABSOLUTE
 * height.
 *
 * Height is absolute, not a fraction. A fraction seemed natural and was
 * wrong: the towers scale to between 22 and 36 units, so "62% up the wall"
 * strung the overhead between 14 and 22 and the wires visibly zigzagged
 * down the street. Real streetcar wire runs at a constant height above the
 * road, and a constant anchor height is also the one the player can learn.
 */
export interface AttachPoint {
  readonly face: 'front' | 'back';
  readonly y: number;
}

export interface StreetPropSpec {
  readonly url: string;
  /** Uniform scale applied at load. Always measured, never 1. */
  readonly scale: number;
  /** Plausible scaled height in world units, as [min, max]. */
  readonly expect: readonly [number, number];
  /** What it is for, so placement code need not be read to find out. */
  readonly role: string;
  /**
   * Real-world height in metres that `scale` was derived from.
   *
   * Recorded so the intent survives: if a prop is re-exported at a different
   * authored size, the fix is to re-measure and keep this number, not to
   * nudge the scale until it looks right.
   */
  readonly metres: number;
  /**
   * Which way the readable / working face points in the AUTHORED file.
   *
   * Measured, never assumed. Every rotation bug in this level came from
   * reconciling authored orientation against placement intent ad hoc at the
   * call site: building facades are +Z and streetlight arms are -Z, so the
   * same "turn it toward the street" rule produced a correct facade and a
   * lamp pointing into the wall it was bolted to.
   *
   * Placements declare intent (`faces: 'street'`) and the resolver does the
   * reconciliation once, here.
   */
  readonly front?: Axis;
  /**
   * The axis of its LENGTH, for props that block rather than face.
   *
   * A barrier has no meaningful front; what matters is that its long side
   * lies across the player's path rather than down it.
   */
  readonly long?: 'X' | 'Z';
  /** Named points other objects attach to, as fractions of this prop's box. */
  readonly points?: Readonly<Record<string, AttachPoint>>;
}

/** KayKit prop, staged to `/models/props`. */
const P = (
  file: string,
  scale: number,
  expect: readonly [number, number],
  metres: number,
  role: string,
  orient: Partial<StreetPropSpec> = {},
): StreetPropSpec => ({ url: `/models/props/${file}.glb`, scale, expect, metres, role, ...orient });

/**
 * Kenney City Kit Roads prop, staged to `/models/city`.
 *
 * This pack is internally consistent — a streetlight is correctly sized
 * against its own road tile — so one factor preserves those proportions
 * across the whole set, and `KENNEY` is that factor. Entries that deviate
 * say why.
 *
 * A Kenney road tile is a WHOLE STREET, kerbs and all, not one lane. The
 * first attempt tiled six of them across the route at one-per-lane and
 * produced a six-lane expanse for a three-lane game; one tile is the street.
 */
const KENNEY = 13;
const K = (
  file: string,
  expect: readonly [number, number],
  role: string,
  scale: number = KENNEY,
  orient: Partial<StreetPropSpec> = {},
): StreetPropSpec => ({
  url: `/models/city/${file}.glb`,
  scale,
  expect,
  metres: 0,
  role,
  ...orient,
});

/**
 * Where streetcar wire is bracketed to a facade.
 *
 * Deliberately the same height the gameplay anchors already use, so the
 * cable and the thing the rope grabs are one number rather than two that
 * drifted 6.8 units apart.
 */
const WIRE_BRACKET = { bracket: { face: 'front', y: 19 } } as const;

export const STREET_PROPS = {
  // ---- the canyon (KayKit, street scale) --------------------------------
  // Base-less variants only: the A-F exports carry a plinth that holds the
  // facade off the tarmac, which is right in a skyline band and wrong here.
  towerA: P('building_A_withoutBase', 15.8, [22, 27], 18.0, 'canyon wall, low block',
    { front: '+Z', points: WIRE_BRACKET }),
  towerC: P('building_C_withoutBase', 12.1, [25, 30], 20.0, 'canyon wall, narrow tower',
    { front: '+Z', points: WIRE_BRACKET }),
  towerE: P('building_E_withoutBase', 13.0, [27, 32], 21.5, 'canyon wall, wide mid-rise',
    { front: '+Z', points: WIRE_BRACKET }),
  towerG: P('building_G_withoutBase', 15.0, [31, 36], 24.8, 'canyon wall, tall tower',
    { front: '+Z', points: WIRE_BRACKET }),

  // ---- the street surface (Kenney) --------------------------------------
  /**
   * Wider than the rest of the pack, deliberately.
   *
   * A Kenney tile devotes roughly half its width to pavement, so at the pack
   * factor the DRIVABLE strip was only +/-3.25 — narrower than the outer
   * lanes at +/-3.2 plus their hazards, and the side lanes visibly ran along
   * the kerb. 17 puts the carriageway at about +/-4.25, which contains the
   * whole interactive zone.
   */
  /**
   * The carriageway runs along the tile's X axis, not its Z.
   *
   * Deduced from `road-side`, which is 1.00 x 0.02 x 1.31: the extra 0.31 is
   * its raised pavement, and it extends along Z. A pavement runs BESIDE a
   * road, so the road itself runs along X. Placed unrotated on a street that
   * runs along Z, every lane marking ran across the street instead of down
   * it.
   */
  road: K('road-straight', [0.3, 0.45], 'street surface, one tile is the whole street', 19,
    { long: 'X' }),
  roadCrossing: K('road-crossing', [0.3, 0.45], 'street surface, pedestrian crossing', 19,
    { long: 'X' }),

  // ---- anchors ----------------------------------------------------------
  // A cable strung across the street is the most legible "grab that" a city
  // offers, and it already spans all three lanes at once.
  anchorSpan: K('electricity-side-wide', [6.0, 7.5], 'wire bracket, one per facade', KENNEY,
    { front: '+Z', long: 'X' }),
  anchorWires: K('electricity-wires-wide', [1.0, 1.8], 'anchor cable', KENNEY, { long: 'X' }),
  anchorPole: K('electricity-pole-wide', [6.0, 7.5], 'anchor mast, where no facade is near',
    KENNEY, { long: 'X' }),
  /**
   * Ground marker under a low anchor.
   *
   * A pedestrian crossing painted on the road: the descent needs something
   * to aim at, and a flat marking is the only honest thing to put in the
   * carriageway — anything with height would be an obstacle the runner has
   * never heard of.
   */
  lowAnchor: K('road-crossing', [0.04, 0.1], 'low-anchor landing marking', 3, { long: 'X' }),

  // ---- overhead obstacles ------------------------------------------------
  bridgeDeck: K('road-bridge', [6.0, 7.5], 'the bridge, spanning every lane', KENNEY, { long: 'Z' }),
  bridgePillar: K('bridge-pillar-wide', [6.0, 7.5], 'bridge support, carried to the road'),
  signGantry: K('sign-highway-wide', [8.5, 10.0], 'overhead sign, gantry', KENNEY,
    { front: '-X', long: 'Z' }),
  signHanging: K('road-sign-empty-hanging', [5.5, 7.0], 'overhead sign, single lane', KENNEY,
    { front: '-Z', long: 'Z' }),
  lightHanging: K('traffic-light-hanging', [6.0, 7.5], 'hanging signal, single lane', KENNEY,
    { front: '-Z', long: 'Z' }),

  // ---- ground obstacles ---------------------------------------------------
  barrier: K('construction-barrier', [1.3, 2.1], 'road works barrier', KENNEY, { long: 'Z' }),
  cone: K('construction-cone', [0.9, 1.5], 'road works cone'),
  fence: K('construction-fence', [2.0, 2.8], 'road works fence', KENNEY, { long: 'Z' }),
  workLight: K('construction-light', [2.5, 3.4], 'road works beacon'),
  dumpster: K('dumpster', [2.3, 3.1], 'street clutter', KENNEY, { long: 'Z' }),

  // ---- dressing ----------------------------------------------------------
  // The lamp arm reaches -Z, the OPPOSITE of a building facade. Applying
  // the facade rule to it pointed every arm into the wall behind it.
  streetlight: K('light-curved', [8.0, 9.5], 'street lighting', KENNEY, { front: '-Z' }),
  streetlightDouble: K('light-curved-double', [8.0, 9.5], 'street lighting, both arms', KENNEY,
    { long: 'Z' }),
  trafficLight: K('traffic-light', [6.0, 7.5], 'junction dressing', KENNEY, { front: '+Z' }),
  streetSign: K('road-sign-street', [5.5, 7.0], 'pavement dressing', KENNEY, { front: '+Z' }),

  // ---- gameplay ----------------------------------------------------------
  /**
   * Sized to FILL its collider rather than to a real present's proportions,
   * and kept identical to level 1's collectible so the two levels read as one
   * game. A truthfully-proportioned present sits inside the box it is
   * collected by, which reads as a near miss scoring.
   */
  gift: P('present_A_yellow', 2.42, [1.4, 1.8], 1.17, 'scored collectible'),
} as const;

export type StreetPropId = keyof typeof STREET_PROPS;

export const STREET_PROP_IDS = Object.keys(STREET_PROPS) as StreetPropId[];

export function streetProp(id: StreetPropId): StreetPropSpec {
  return STREET_PROPS[id];
}
