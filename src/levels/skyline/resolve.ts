/**
 * Scene resolution, as pure arithmetic.
 *
 * Placement intent plus a prop's measured axes becomes a world transform.
 * This is the single place that reconciliation happens — every rotation bug
 * in this level came from doing it ad hoc at the call site, where facades
 * authored on +Z and lamp arms authored on -Z got the same "turn it toward
 * the street" rule and one of them ended up pointing into a wall.
 *
 * Deliberately free of three.js and of the asset loader. Facts about a prop
 * arrive through a `PropLookup`, so the renderer can supply them from loaded
 * GLBs and the offline audit can supply them from the glTF accessors —
 * both getting identical answers. A checker that resolved the scene
 * differently from the renderer would be checking a scene nobody ships.
 */
import type { Lane } from './types';
import { COURSE } from './config';

export type Axis = '+X' | '-X' | '+Z' | '-Z';

export interface Vec3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface Box {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** A named point on a prop: a face of its box, at an absolute height. */
export interface AttachPoint {
  readonly face: 'front' | 'back';
  readonly y: number;
  readonly wallOffset?: number;
}

/** Everything resolution needs to know about a prop, all of it measured. */
export interface PropFacts {
  readonly box: Box;
  readonly front?: Axis | undefined;
  readonly long?: 'X' | 'Z' | undefined;
  readonly points?: Readonly<Record<string, AttachPoint>> | undefined;
}

export type PropLookup = (prop: string) => PropFacts | null;

export type Facing =
  | { readonly faces: 'street' | 'oncoming' | 'away' }
  | { readonly spans: 'across' | 'along' };

export interface Placement {
  readonly id: string;
  readonly prop: string;
  readonly x: number;
  readonly z: number;
  readonly y?: number;
  readonly facing: Facing;
  readonly side: -1 | 0 | 1;
  readonly place?: 'centre' | 'face';
}

/**
 * Bearing of an axis, measured the way a Y rotation adds to it.
 *
 * Three.js rotates (x, z) to (x·cos + z·sin, −x·sin + z·cos), so +Z maps to
 * +X at +PI/2. Expressing each axis as a bearing makes the turn a plain
 * subtraction rather than a table of special cases.
 */
function bearing(axis: Axis): number {
  switch (axis) {
    case '+X': return Math.PI / 2;
    case '-X': return -Math.PI / 2;
    case '+Z': return 0;
    case '-Z': return Math.PI;
  }
}

/** Where the intent wants the prop's working axis to end up. */
function target(facing: Facing, side: -1 | 0 | 1): Axis {
  if ('faces' in facing) {
    // "street" means toward x = 0, which depends on which kerb it is on.
    if (facing.faces === 'street') return side > 0 ? '-X' : '+X';
    // The camera sits at +Z, so the player reads a +Z face.
    return facing.faces === 'oncoming' ? '+Z' : '-Z';
  }
  return facing.spans === 'across' ? '+X' : '+Z';
}

/** The Y rotation a placement implies, in radians. */
export function resolveFacing(facts: PropFacts, facing: Facing, side: -1 | 0 | 1): number {
  const authored =
    'faces' in facing
      ? facts.front
      : facts.long === 'X'
        ? '+X'
        : facts.long === 'Z'
          ? '+Z'
          : undefined;
  if (!authored) return 0;
  return bearing(target(facing, side)) - bearing(authored);
}

/** Rotate an offset about Y, matching three.js's convention. */
export function turn(x: number, z: number, theta: number): { x: number; z: number } {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export interface Resolved {
  readonly id: string;
  readonly prop: string;
  readonly position: Vec3;
  readonly rotationY: number;
}

/**
 * Resolve one placement to a world transform.
 *
 * A `place: 'face'` placement reports the line its street-facing surface
 * must land on, not its centre. These buildings are 15-30 units deep and
 * asymmetric — a shopfront reaches 0.80 one way against 0.65 the other — so
 * a shared centre line puts one shape's facade in the road and leaves a gap
 * behind another, and a half-extent averages the asymmetry away.
 */
export function resolvePlacement(p: Placement, look: PropLookup): Resolved | null {
  const facts = look(p.prop);
  if (!facts) return null;
  const rotationY = resolveFacing(facts, p.facing, p.side);

  let x = p.x;
  if (p.place === 'face') {
    const b = facts.box;
    const reach =
      facts.front === '+Z' ? b.max.z
        : facts.front === '-Z' ? -b.min.z
          : facts.front === '+X' ? b.max.x
            : facts.front === '-X' ? -b.min.x
              : 0;
    x = p.x + Math.sign(p.x || 1) * reach;
  }
  return { id: p.id, prop: p.prop, position: { x, y: p.y ?? 0, z: p.z }, rotationY };
}

/** World position of a named point on a placed object. */
export function resolveAttach(
  on: string,
  point: string,
  objects: readonly Placement[],
  look: PropLookup,
): Vec3 | null {
  const placement = objects.find((o) => o.id === on);
  if (!placement) return null;
  const facts = look(placement.prop);
  const named = facts?.points?.[point];
  const resolved = resolvePlacement(placement, look);
  if (!facts || !named || !resolved || !facts.front) return null;

  const b = facts.box;
  const outward = named.face === 'front' ? 1 : -1;
  const reach = named.wallOffset ?? (facts.front === '+Z' ? b.max.z : b.min.z);
  const local =
    facts.front === '+Z' || facts.front === '-Z'
      ? { x: 0, z: outward * reach }
      : { x: outward * (named.wallOffset ?? (facts.front === '+X' ? b.max.x : b.min.x)), z: 0 };
  const rotated = turn(local.x, local.z, resolved.rotationY);
  return { x: resolved.position.x + rotated.x, y: named.y, z: resolved.position.z + rotated.z };
}

export interface ResolvedWire {
  readonly id: string;
  readonly a: Vec3;
  readonly b: Vec3;
  readonly sag: number;
}

/**
 * Height of a sagging wire at a given x.
 *
 * A parabola between the two brackets, dipping by `sag` of the span at the
 * middle. Close enough to a catenary at this scale, and cheap to evaluate —
 * which matters because the anchors read their height off it rather than
 * carrying one of their own.
 */
export function wireHeightAt(wire: ResolvedWire, x: number): number {
  const span = wire.b.x - wire.a.x;
  if (Math.abs(span) < 1e-6) return wire.a.y;
  const t = (x - wire.a.x) / span;
  const straight = wire.a.y + (wire.b.y - wire.a.y) * t;
  // 4t(1-t) peaks at 1 in the middle and is 0 at both ends.
  return straight - wire.sag * Math.abs(span) * 4 * t * (1 - t);
}

/**
 * Where an anchor actually is.
 *
 * Its height is READ OFF the wire. There is nowhere to write a height that
 * disagrees with the cable, which is the whole reason the scene owns this
 * relationship rather than the gameplay computing it independently.
 */
export function resolveAnchor(lane: Lane, wire: ResolvedWire): Vec3 {
  const x = lane * COURSE.laneWidth;
  return { x, y: wireHeightAt(wire, x), z: (wire.a.z + wire.b.z) / 2 };
}

/** World-space axis-aligned box of a placed object. */
export function worldBox(resolved: Resolved, facts: PropFacts): Box {
  const b = facts.box;
  // Only quarter turns are used, so the authored X and Z extents either
  // stay or swap — exact, with no need to transform eight corners.
  const turned = Math.abs(Math.sin(resolved.rotationY)) > 0.5;
  const halfX = (turned ? b.max.z - b.min.z : b.max.x - b.min.x) / 2;
  const halfZ = (turned ? b.max.x - b.min.x : b.max.z - b.min.z) / 2;
  // These models are not centred on their origin, so the box centre has to
  // be rotated into place rather than assumed to sit at the position.
  const centre = turn((b.min.x + b.max.x) / 2, (b.min.z + b.max.z) / 2, resolved.rotationY);
  return {
    min: {
      x: resolved.position.x + centre.x - halfX,
      y: resolved.position.y + b.min.y,
      z: resolved.position.z + centre.z - halfZ,
    },
    max: {
      x: resolved.position.x + centre.x + halfX,
      y: resolved.position.y + b.max.y,
      z: resolved.position.z + centre.z + halfZ,
    },
  };
}

/** Overlap depth on each axis; all three positive means interpenetration. */
export function overlap(a: Box, b: Box): Vec3 {
  return {
    x: Math.min(a.max.x, b.max.x) - Math.max(a.min.x, b.min.x),
    y: Math.min(a.max.y, b.max.y) - Math.max(a.min.y, b.min.y),
    z: Math.min(a.max.z, b.max.z) - Math.max(a.min.z, b.min.z),
  };
}
