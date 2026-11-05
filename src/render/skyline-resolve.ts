/**
 * Turns the scene definition into world transforms.
 *
 * The single place where a prop's AUTHORED orientation meets a placement's
 * INTENT. Every rotation bug in this level came from doing that
 * reconciliation ad hoc at the call site: building facades are authored on
 * +Z and streetlight arms on -Z, so one "turn it toward the street" rule
 * produced a correct facade and a lamp pointing into the wall behind it.
 *
 * Here it is arithmetic on two measured axes, done once.
 */
import { Vector3 } from 'three';
import type { Axis, StreetPropSpec } from './skyline-props';
import { STREET_PROPS, type StreetPropId } from './skyline-props';
import type { StreetAssets } from './skyline-assets';
import { SCENE, type Facing, type Placement, type Wire } from '../levels/skyline/scene';
import { SKYLINE } from '../levels/skyline/course';
import type { Lane } from '../levels/skyline/types';

/**
 * Bearing of an axis, measured the way a Y rotation adds to it.
 *
 * Three.js rotates (x, z) to (x·cos + z·sin, −x·sin + z·cos), so +Z maps to
 * +X at +PI/2. Expressing each axis as `atan2(x, z)` makes the turn a plain
 * subtraction instead of a table of special cases.
 */
function bearing(axis: Axis): number {
  switch (axis) {
    case '+X': return Math.PI / 2;
    case '-X': return -Math.PI / 2;
    case '+Z': return 0;
    case '-Z': return Math.PI;
  }
}

/** Where the intent wants the prop's front to end up. */
function target(facing: Facing, side: -1 | 0 | 1): Axis {
  if ('faces' in facing) {
    // "street" means toward x = 0, which depends on which kerb it is on.
    if (facing.faces === 'street') return side > 0 ? '-X' : '+X';
    // The camera sits at +Z, so the player reads a +Z face.
    return facing.faces === 'oncoming' ? '+Z' : '-Z';
  }
  return facing.spans === 'across' ? '+X' : '+Z';
}

/**
 * The Y rotation that satisfies a placement, in radians.
 *
 * Throws rather than guessing: asking a prop with no measured front to face
 * something is an authoring error, and silently rotating by zero is how the
 * lamp bug survived three reviews.
 */
export function resolveFacing(spec: StreetPropSpec, facing: Facing, side: -1 | 0 | 1): number {
  const wanted = target(facing, side);
  const authored = 'faces' in facing ? spec.front : spec.long === 'X' ? '+X' : spec.long === 'Z' ? '+Z' : undefined;
  if (!authored) return 0;
  return bearing(wanted) - bearing(authored);
}

/** Rotate a local offset about Y, matching three.js's convention. */
function turn(x: number, z: number, theta: number): { x: number; z: number } {
  const c = Math.cos(theta), s = Math.sin(theta);
  return { x: x * c + z * s, z: -x * s + z * c };
}

export interface Resolved {
  readonly id: string;
  readonly prop: StreetPropId;
  readonly position: Vector3;
  readonly rotationY: number;
}

/**
 * Resolve one placement to a world transform.
 *
 * A `place: 'face'` placement reports the line its street-facing surface
 * must land on, not its centre — these buildings are 15-30 units deep and
 * asymmetric, so a shared centre line puts one shape's facade in the road
 * and leaves a gap behind another.
 */
export function resolvePlacement(p: Placement, assets: StreetAssets): Resolved | null {
  const prop = p.prop as StreetPropId;
  const spec = STREET_PROPS[prop];
  if (!spec) return null;
  const rotationY = resolveFacing(spec, p.facing, p.side);

  let x = p.x;
  if (p.place === 'face') {
    const box = assets.box(prop);
    // Distance from the origin to the front face, along the authored front.
    const reach = box
      ? spec.front === '+Z' ? box.max.z
        : spec.front === '-Z' ? -box.min.z
          : spec.front === '+X' ? box.max.x
            : -box.min.x
      : 0;
    x = p.x + Math.sign(p.x || 1) * reach;
  }
  return { id: p.id, prop, position: new Vector3(x, p.y ?? 0, p.z), rotationY };
}

/**
 * World position of a named point on a placed object.
 *
 * `within` is the layout being resolved — the real scene normally, the
 * inspection sheet under `?inspect`. Defaulting to SCENE and ignoring the
 * argument would make the review mode resolve against objects it is not
 * drawing.
 */
export function resolveAttach(
  on: string,
  point: string,
  assets: StreetAssets,
  within: readonly Placement[] = SCENE.objects,
): Vector3 | null {
  const placement = within.find((o) => o.id === on);
  if (!placement) return null;
  const prop = placement.prop as StreetPropId;
  const spec = STREET_PROPS[prop];
  const named = spec?.points?.[point];
  const box = assets.box(prop);
  const resolved = resolvePlacement(placement, assets);
  if (!named || !box || !resolved || !spec.front) return null;

  // Local offset: out to the chosen face, up by a fraction of the height.
  const outward = named.face === 'front' ? 1 : -1;
  const local =
    spec.front === '+Z' || spec.front === '-Z'
      ? { x: 0, z: outward * (spec.front === '+Z' ? box.max.z : box.min.z) }
      : { x: outward * (spec.front === '+X' ? box.max.x : box.min.x), z: 0 };
  const rotated = turn(local.x, local.z, resolved.rotationY);
  return new Vector3(resolved.position.x + rotated.x, named.y, resolved.position.z + rotated.z);
}

export interface ResolvedWire {
  readonly id: string;
  readonly a: Vector3;
  readonly b: Vector3;
  readonly sag: number;
}

export function resolveWire(
  wire: Wire,
  assets: StreetAssets,
  within?: readonly Placement[],
): ResolvedWire | null {
  const a = resolveAttach(wire.from.on, wire.from.point, assets, within);
  const b = resolveAttach(wire.to.on, wire.to.point, assets, within);
  if (!a || !b) return null;
  return { id: wire.id, a, b, sag: wire.sag };
}

/**
 * Height of a sagging wire at a given x.
 *
 * A parabola between the two brackets, dipping by `sag` of the span at the
 * middle. Close enough to a catenary at this scale and cheap to invert,
 * which matters because the anchors read their height off it.
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
 * Its y is READ OFF the wire. There is no height to write down, so an
 * anchor cannot disagree with the cable it hangs from — which is the whole
 * reason the scene owns this relationship.
 */
export function resolveAnchor(
  lane: Lane,
  wire: ResolvedWire,
): Vector3 {
  const x = lane * SKYLINE.laneWidth;
  return new Vector3(x, wireHeightAt(wire, x), (wire.a.z + wire.b.z) / 2);
}
