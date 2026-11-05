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
import { SKYLINE } from './course';

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

/** What to build, named outright instead of inferred from collider shape. */
export type AssemblyId = 'barricade' | 'bridge' | 'hangingSign' | 'laneBlock' | 'gift';

export interface Encounter {
  readonly id: string;
  readonly assembly: AssemblyId;
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

/** Where the canyon's inner faces stand. The street is the gap between. */
export const FACADE_X = 6.9;
/** Pavement line for lamps and dressing, outside the interactive zone. */
export const KERB_X = 5.6;
/** How far the scene extends past each end of the route. */
export const MARGIN = 60;

/**
 * Building pitch equals the swing cycle's ground distance.
 *
 * One building pair per swing, so every wire has a facade on each side to
 * hang from and the canyon rhythm matches the rhythm the player feels.
 */
export const BAY = SKYLINE.cycle * SKYLINE.speed;

const ROUTE = SKYLINE.duration * SKYLINE.speed;

const FIRST_BAY = Math.floor(-MARGIN / BAY);
const LAST_BAY = Math.ceil((ROUTE + MARGIN) / BAY);

/** Four shapes, cycled rather than hashed, so the terrace is readable. */
const TOWERS = ['towerA', 'towerC', 'towerE', 'towerG'] as const;

/**
 * Deterministic variation, used ONLY at authoring time.
 *
 * An integer hash rather than Math.random so the scene is byte-identical on
 * every load and a review screenshot can be compared with the one before it.
 */
function pick(n: number, salt: number, count: number): number {
  let h = (n * 374761393 + salt * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) % count;
}

/** A pedestrian crossing every N tiles, to break up the repeat. */
const CROSSING_EVERY = 5;
/** One Kenney tile is the whole street, kerbs and all; 17 is its scaled width. */
const TILE = 17;

const objects: Placement[] = [];

/**
 * The carriageway, as ordinary placements.
 *
 * Road tiles used to be laid by a separate loop that wrote identity
 * rotations, which is how every lane marking ended up running across the
 * street instead of down it. Routing them through the same resolver as
 * everything else means the turn comes from the tile's measured axis rather
 * than from whoever wrote the loop.
 */
for (let i = Math.floor(-MARGIN / TILE) - 1; i <= Math.ceil((ROUTE + MARGIN) / TILE) + 1; i++) {
  const crossing = ((i % CROSSING_EVERY) + CROSSING_EVERY) % CROSSING_EVERY === 0;
  objects.push({
    id: `road-${i}`,
    prop: crossing ? 'roadCrossing' : 'road',
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

  for (const side of [-1, 1] as const) {
    const wall = side < 0 ? 'L' : 'R';
    const tower = TOWERS[pick(bay, side < 0 ? 17 : 91, TOWERS.length)] as string;
    objects.push({
      id: `bldg-${wall}${bay}`,
      prop: tower,
      // x is the FACADE line; the resolver pushes the centre back by the
      // building's own depth so the face lands here whichever shape it is.
      x: side * FACADE_X,
      z,
      facing: { faces: 'street' },
      side,
      place: 'face',
    });

    // Lamps alternate sides, so the street reads as a street rather than a
    // corridor of gates.
    if ((bay + (side > 0 ? 1 : 0)) % 2 === 0) {
      objects.push({
        id: `lamp-${wall}${bay}`,
        prop: 'streetlight',
        x: side * KERB_X,
        z: z + BAY * 0.35,
        facing: { faces: 'street' },
        side,
      });
    }
  }

  // One span per bay, bracketed to the facade on each side.
  const wireId = `wire-${bay}`;
  wires.push({
    id: wireId,
    from: { on: `bldg-L${bay}`, point: 'bracket' },
    to: { on: `bldg-R${bay}`, point: 'bracket' },
    sag: 0.06,
  });
  for (const lane of [-1, 0, 1] as const) {
    anchors.push({ id: `anchor-${bay}-${lane}`, wire: wireId, lane });
  }

  // Pavement dressing, on the kerb and clear of the lanes.
  const which = pick(bay, 5, 6);
  if (which < 3) {
    const side = which === 1 ? 1 : -1;
    objects.push({
      id: `dress-${bay}`,
      prop: which === 0 ? 'trafficLight' : which === 1 ? 'streetSign' : 'dumpster',
      x: side * KERB_X,
      z: z + BAY * 0.6,
      facing: which === 0 ? { faces: 'oncoming' } : { spans: 'along' },
      side,
    });
  }
}

/**
 * Encounters, carried over from the course so the beats are unchanged.
 *
 * `assembly` is named outright. The renderer used to infer "bridge" or
 * "sign" or "barrier" from a collider's width and bottom height, which is
 * why `cone-right` rendered as a row of barriers.
 */
const encounters: Encounter[] = SKYLINE.entities.map((e) => ({
  id: e.id,
  assembly:
    e.kind === 'gift'
      ? 'gift'
      : e.halfX > 3
        ? e.y - e.halfY < 0.6
          ? 'barricade'
          : 'bridge'
        : e.y - e.halfY < 0.6
          ? 'laneBlock'
          : 'hangingSign',
  lane: e.lane,
  z: e.z,
}));

/** Landing markings, one per lane at each bay, for the low road. */
const landings: Landing[] = [];
for (let bay = FIRST_BAY; bay <= LAST_BAY; bay++) {
  for (const lane of [-1, 0, 1] as const) {
    landings.push({ id: `land-${bay}-${lane}`, lane, z: bay * BAY + BAY * 0.5 });
  }
}

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
