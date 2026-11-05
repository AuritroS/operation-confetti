/**
 * The level 2 scene, as data.
 *
 * One authored list of placements, built once at module load and frozen.
 * Nothing here is generated at run time: the frame loop reads this and moves
 * a group, it never decides where anything goes. The loops below are
 * AUTHORING SHORTHAND for writing a terrace down — the output is a fixed
 * array you can print and diff, which is the property that matters.
 *
 * ---- why the scene owns the relationships -------------------------------
 *
 * Keeping environment and gameplay decoupled stopped being useful the moment
 * the grapple anchors had to live on wires strung between buildings. The
 * anchors floated 6.8 units below the wire they were supposed to hang from,
 * because the wire's height came from a model's base and the anchor's came
 * from an unrelated constant.
 *
 * So the dependencies run one way and are expressed, not implied:
 *
 *     building  ->  bracket (a named point on its facade)
 *     wire      ->  two brackets
 *     anchor    ->  a point ON a wire, at a lane's x
 *     landing   ->  a marking on the carriageway
 *
 * An anchor has no y of its own. It cannot float, because there is nowhere
 * to write a height that disagrees with the cable.
 *
 * ---- Toronto -------------------------------------------------------------
 *
 * The overhead wires are streetcar wire, not power lines. Toronto's streets
 * are strung with TTC overhead, and it is already exactly the thing Matthew
 * grapples — so the signature mechanic and the signature streetscape are the
 * same object. The red-brick low-rise with ground-floor shopfronts reads as
 * Queen West, and the CN Tower stands past the end of the route so the chase
 * has somewhere to be going.
 */
import type { Lane } from './types';
import { COURSE, ROUTE_LENGTH, type AssemblyId, type Encounter } from './config';

export type { AssemblyId, Encounter };

/** Placement intent. A placement never writes radians; see `resolveFacing`. */
export type Facing =
  | { readonly faces: 'street' | 'oncoming' | 'away' }
  | { readonly spans: 'across' | 'along' };

/** A point on a placed object, named in the prop registry. */
export interface Attach {
  readonly on: string;
  readonly point: string;
}

export interface Placement {
  readonly id: string;
  /** Registry id. Kept as a string so this module need not import render. */
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  /** Defaults to the carriageway at y=0. */
  readonly y?: number;
  readonly facing: Facing;
  /** Which side of the street it belongs to, for the resolver's turn. */
  readonly side: -1 | 0 | 1;
  /**
   * Whether `x` is the object's centre or its street-facing FACE.
   *
   * Buildings are placed by face: they scale to 15-30 units wide and are
   * asymmetric, so a shared centre line put one shape's facade inside the
   * road while another left a gap.
   */
  readonly place?: 'centre' | 'face';
}

export interface Wire {
  readonly id: string;
  readonly from: Attach;
  readonly to: Attach;
  /** Downward bow as a fraction of the span. */
  readonly sag: number;
}

/**
 * An anchor is a POINT ON A WIRE. It has no height of its own, which is what
 * makes a floating anchor unexpressible rather than merely fixed.
 */
export interface AnchorDef {
  readonly id: string;
  readonly wire: string;
  readonly lane: Lane;
}

export interface Landing {
  readonly id: string;
  readonly lane: Lane;
  readonly z: number;
}

export interface SceneDefinition {
  readonly objects: readonly Placement[];
  readonly wires: readonly Wire[];
  readonly anchors: readonly AnchorDef[];
  readonly landings: readonly Landing[];
  readonly encounters: readonly Encounter[];
}

// ---------------------------------------------------------------- layout ---

/**
 * Where the canyon's inner faces stand. The street is the gap between.
 *
 * Widened from 6.9 with the kerb, because the furniture did not fit. The
 * audit measured a lamp arm reaching x=3.00 — inside the 4.6 zone and
 * almost exactly on the outer lane centre, so a swinging player passed
 * through it — plus signs at 3.37 and dumpsters at 3.71.
 */
export const FACADE_X = 9.6;
/**
 * Pavement line for lamps and dressing, outside the interactive zone.
 *
 * Derived, not chosen: the deepest inward reach of any kerb prop is the
 * streetlight's 2.6-unit arm, so the post must stand at least 4.6 + 2.6
 * out for the arm to clear the zone.
 */
export const KERB_X = 7.4;
/** How far the scene extends past each end of the route. */
export const MARGIN = 60;

/**
 * Building pitch equals the swing cycle's ground distance.
 *
 * One building pair per swing, so every wire has a facade on each side to
 * hang from and the canyon rhythm matches the rhythm the player feels.
 */
export const BAY = COURSE.cycle * COURSE.speed;

const ROUTE = ROUTE_LENGTH;

const FIRST_BAY = -2;
const LAST_BAY = 16;

/** Curated fixed architectural sequences for each side of the Queen West canyon. */
const LEFT_WALL_TOWERS: readonly string[] = [
  'towerA', // Bay -2 (Z = -54.4)
  'towerE', // Bay -1 (Z = -27.2)
  'towerA', // Bay 0 (Z = 0.0) - Start
  'towerA', // Bay 1 (Z = 27.2)
  'towerE', // Bay 2 (Z = 54.4)
  'towerA', // Bay 3 (Z = 81.6)
  'towerC', // Bay 4 (Z = 108.8)
  'towerE', // Bay 5 (Z = 136.0)
  'towerC', // Bay 6 (Z = 163.2)
  'towerE', // Bay 7 (Z = 190.4)
  'towerG', // Bay 8 (Z = 217.6)
  'towerE', // Bay 9 (Z = 244.8)
  'towerG', // Bay 10 (Z = 272.0)
  'towerC', // Bay 11 (Z = 299.2)
  'towerA', // Bay 12 (Z = 326.4)
  'towerA', // Bay 13 (Z = 353.6)
  'towerE', // Bay 14 (Z = 380.8) - Finish
  'towerA', // Bay 15 (Z = 408.0)
  'towerE', // Bay 16 (Z = 435.2)
];

const RIGHT_WALL_TOWERS: readonly string[] = [
  'towerE', // Bay -2 (Z = -54.4)
  'towerA', // Bay -1 (Z = -27.2)
  'towerC', // Bay 0 (Z = 0.0) - Start
  'towerE', // Bay 1 (Z = 27.2)
  'towerA', // Bay 2 (Z = 54.4)
  'towerC', // Bay 3 (Z = 81.6)
  'towerE', // Bay 4 (Z = 108.8)
  'towerC', // Bay 5 (Z = 136.0)
  'towerG', // Bay 6 (Z = 163.2)
  'towerC', // Bay 7 (Z = 190.4)
  'towerG', // Bay 8 (Z = 217.6)
  'towerG', // Bay 9 (Z = 244.8)
  'towerE', // Bay 10 (Z = 272.0)
  'towerG', // Bay 11 (Z = 299.2)
  'towerE', // Bay 12 (Z = 326.4)
  'towerG', // Bay 13 (Z = 353.6)
  'towerC', // Bay 14 (Z = 380.8) - Finish
  'towerE', // Bay 15 (Z = 408.0)
  'towerA', // Bay 16 (Z = 435.2)
];

/** One Kenney tile is the whole street, kerbs and all; 19 is its scaled width. */
const TILE = 19;

const objects: Placement[] = [];

/** The carriageway, as straight road tiles. */
for (let i = Math.floor(-MARGIN / TILE) - 1; i <= Math.ceil((ROUTE + MARGIN) / TILE) + 1; i++) {
  objects.push({
    id: `road-${i}`,
    prop: 'road',
    x: 0,
    z: i * TILE,
    facing: { spans: 'along' },
    side: 0,
  });
}
const wires: Wire[] = [];
const anchors: AnchorDef[] = [];

for (let bay = FIRST_BAY; bay <= LAST_BAY; bay++) {
  const z = bay * BAY;
  const idx = bay - FIRST_BAY;
  const leftTower = LEFT_WALL_TOWERS[idx] ?? 'towerA';
  const rightTower = RIGHT_WALL_TOWERS[idx] ?? 'towerE';

  objects.push({
    id: `bldg-L${bay}`,
    prop: leftTower,
    x: -FACADE_X,
    z,
    facing: { faces: 'street' },
    side: -1,
    place: 'face',
  });

  objects.push({
    id: `bldg-R${bay}`,
    prop: rightTower,
    x: FACADE_X,
    z,
    facing: { faces: 'street' },
    side: 1,
    place: 'face',
  });

  // One streetcar cable span per bay, bracketed to the facades at Y=19.
  const wireId = `wire-${bay}`;
  wires.push({
    id: wireId,
    from: { on: `bldg-L${bay}`, point: 'bracket' },
    to: { on: `bldg-R${bay}`, point: 'bracket' },
    sag: 0.05,
  });
  for (const lane of [-1, 0, 1] as const) {
    anchors.push({ id: `anchor-${bay}-${lane}`, wire: wireId, lane });
  }
}

/**
 * The course, authored here.
 *
 * THE SCENE IS AUTHORITATIVE. This list used to be derived from
 * `course.ts`, with the renderer then guessing which assembly to build from
 * the collider's width and bottom height — which is how `cone-right` came
 * to render as a row of barriers. The arrow now runs the other way: an
 * encounter names its assembly, and `course.ts` derives the collider from
 * `ASSEMBLY`. One edit, both the visuals and the gameplay follow.
 *
 * Authored in SECONDS. Beats are a rhythm the player feels; changing the
 * speed should move the geometry, not the pacing.
 *
 * Four acts. Scored gifts are capped at four by the scoring rules, so the
 * route's length buys hazard variety and breathing room, not collectibles.
 *
 *   teach    0-11   one archetype at a time
 *   commit   11-23  the bridge and the barricade, each admitting one answer
 *   mix      23-34  lane choice and height choice in the same beat
 *   closing  34-45  tightest spacing, every archetype in play
 */
const encounters: Encounter[] = ([
  // ---- teach -----------------------------------------------------------
  { id: 'teach', assembly: 'gift', lane: 0, t: 3.5, mode: 'swing', scored: false },
  { id: 'gift-left', assembly: 'gift', lane: -1, t: 7, mode: 'swing', scored: true },
  // A lane shut at every height is a COMPOSITION of the two bands, not an
  // archetype: no prop in any pack honestly fills a 0-12 volume, and the
  // one that tried rendered as a barrier stretched to five times the
  // character's height.
  { id: 'first-middle-low', assembly: 'laneBlock', lane: 0, t: 7 },
  { id: 'first-middle-high', assembly: 'hangingSign', lane: 0, t: 7 },
  { id: 'cone-right', assembly: 'laneBlock', lane: 1, t: 11 },

  // ---- commit ----------------------------------------------------------
  { id: 'gift-ground', assembly: 'gift', lane: 0, t: 13.5, mode: 'run', scored: true },
  { id: 'bridge', assembly: 'bridge', lane: 0, t: 15.5 },
  { id: 'sign-left', assembly: 'hangingSign', lane: -1, t: 19.5 },
  { id: 'barricade', assembly: 'barricade', lane: 0, t: 22 },

  // ---- mix -------------------------------------------------------------
  { id: 'gift-right', assembly: 'gift', lane: 1, t: 25, mode: 'swing', scored: true },
  { id: 'upper-left', assembly: 'hangingSign', lane: -1, t: 25 },
  { id: 'centre-tower-low', assembly: 'laneBlock', lane: 0, t: 29 },
  { id: 'centre-tower-high', assembly: 'hangingSign', lane: 0, t: 29 },
  { id: 'fence-right', assembly: 'laneBlock', lane: 1, t: 31.5 },

  // ---- closing ---------------------------------------------------------
  { id: 'gift-low-left', assembly: 'gift', lane: -1, t: 34, mode: 'run', scored: true },
  { id: 'low-right', assembly: 'laneBlock', lane: 1, t: 34 },
  { id: 'mid-high', assembly: 'hangingSign', lane: 0, t: 38 },
  { id: 'final-ground', assembly: 'laneBlock', lane: 0, t: 41 },
  { id: 'final-high', assembly: 'hangingSign', lane: 1, t: 41 },
  { id: 'last-left-low', assembly: 'laneBlock', lane: -1, t: 43.5 },
  { id: 'last-left-high', assembly: 'hangingSign', lane: -1, t: 43.5 },
] satisfies Encounter[]).sort((a, b) => a.t - b.t);

/** Landing markings removed — player can land anywhere on the road. */
const landings: Landing[] = [];

export const SCENE: SceneDefinition = Object.freeze({
  objects: Object.freeze(objects),
  wires: Object.freeze(wires),
  anchors: Object.freeze(anchors),
  landings: Object.freeze(landings),
  encounters: Object.freeze(encounters),
});

/** A printable census, for review and for the no-churn test. */
export function sceneCensus(): Record<string, number> {
  const byProp: Record<string, number> = {};
  for (const o of SCENE.objects) byProp[o.prop] = (byProp[o.prop] ?? 0) + 1;
  return {
    ...byProp,
    '(wires)': SCENE.wires.length,
    '(anchors)': SCENE.anchors.length,
    '(landings)': SCENE.landings.length,
    '(encounters)': SCENE.encounters.length,
  };
}
