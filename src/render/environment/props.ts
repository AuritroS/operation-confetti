/**
 * Prop registry: the structural guarantee that nothing enters the scene at
 * its authored scale.
 *
 * The packs are authored at wildly inconsistent sizes — `building_A` ships
 * 1.65 units tall, shorter than the 1.45-unit player, while `snowman_A` ships
 * at 2.05, taller than him and wider than a lane. The spread between the
 * largest and smallest correction here is over 12x. Dropping any of them in
 * unscaled produces nonsense, and the error is the kind the eye forgives one
 * at a time and gets badly wrong in aggregate.
 *
 * So a prop can only be placed via a `PropId`, which is derived from the keys
 * of this table. An unregistered prop does not typecheck, and a registered one
 * always carries a scale.
 *
 * `expect` makes the table self-checking: a test loads each prop, applies its
 * scale, measures the result and fails if the height lands outside the range.
 * A wrong factor fails in CI rather than looking slightly odd on screen.
 *
 * World scale is roughly 1 unit to 1.2 metres, taken from the 1.45-unit
 * player standing about 1.75 m.
 */

export interface PropSpec {
  readonly url: string;
  /** Uniform scale applied at load. Never 1 by default — always measured. */
  readonly scale: number;
  /** Plausible scaled height in world units, as [min, max]. */
  readonly expect: readonly [number, number];
  /** What it is for, so a reader need not infer it from placement code. */
  readonly role: string;
}

const P = (file: string, scale: number, expect: readonly [number, number], role: string): PropSpec => ({
  url: `/models/props/${file}.glb`,
  scale,
  expect,
  role,
});

export const PROPS = {
  // ---- skyline: authored ~1.65-2.98 tall, wanted 12-26 ------------------
  buildingA: P('building_A', 7.1, [8, 16], 'skyline silhouette, low block'),
  buildingB: P('building_B', 8.1, [9, 18], 'skyline silhouette, low block'),
  buildingC: P('building_C', 6.7, [15, 26], 'skyline silhouette, tower'),
  buildingD: P('building_D', 7.3, [16, 28], 'skyline silhouette, tower'),
  buildingE: P('building_E', 7.1, [12, 22], 'skyline silhouette, mid-rise'),
  buildingF: P('building_F', 6.7, [12, 22], 'skyline silhouette, mid-rise'),

  // ---- rooftop clutter --------------------------------------------------
  watertower: P('watertower', 4.97, [2.5, 4.5], 'rooftop landmark'),
  streetlight: P('streetlight', 4.34, [3.5, 5.0], 'street below, grapple anchor'),
  dumpster: P('dumpster', 3.4, [0.8, 1.4], 'rooftop clutter'),
  acUnit: P('box_A', 5.1, [0.7, 1.3], 'rooftop air-conditioning unit'),
  vent: P('box_B', 3.9, [0.5, 1.0], 'rooftop vent'),
  trash: P('trash_A', 5.0, [0.15, 0.4], 'rooftop litter'),
  bush: P('bush', 1.97, [0.5, 1.1], 'planter greenery'),
  carPolice: P('car_police', 3.25, [1.1, 1.8], 'street below, Interpol nod'),

  // ---- gameplay props, scaled by the same rule --------------------------
  /**
   * Deliberately larger than a real present would be.
   *
   * At true proportion — about a quarter of the player's height — a gift is a
   * speck by the time it is far enough away to react to, which is the exact
   * readability problem that sank the primitive torus it replaced. Gameplay
   * legibility wins over strict scale for the one object the player has to
   * see and decide about.
   */
  gift: P('present_A_blue', 1.05, [0.55, 0.9], 'scored collectible'),
  /** Dressing, so it keeps the honest proportion. */
  giftDecor: P('present_C_red', 0.72, [0.25, 0.5], 'non-interactive dressing'),
  snowman: P('snowman_A', 0.61, [1.0, 1.6], 'physical hazard blocker'),
  cannon: P('snowball_cannon', 1.41, [0.8, 1.3], 'turret hazard, confetti blaster'),
  bell: P('bell_decorated', 0.68, [0.6, 1.0], 'hit feedback'),
  candycane: P('candycane_small', 0.86, [0.4, 0.7], 'grapple hook'),
} as const;

export type PropId = keyof typeof PROPS;

export const PROP_IDS = Object.keys(PROPS) as PropId[];

export function propSpec(id: PropId): PropSpec {
  return PROPS[id];
}
