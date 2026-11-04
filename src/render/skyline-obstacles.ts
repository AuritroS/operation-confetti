/**
 * Level 2 obstacles and anchors, built from pack props.
 *
 * Replaces an earlier version that fabricated steel-and-magenta structures
 * out of boxes. That was the wrong answer to a problem which turned out to
 * have an asset solution: the Kenney City Kit has a real bridge, real
 * pillars, real hanging signs, real barriers and real cones, so none of it
 * needs inventing.
 *
 * ---- the rule this file obeys -------------------------------------------
 *
 * Collision bounds are FROZEN. The runner tests a swept box against
 * `halfX/halfY/halfZ`, so art is fitted to the volume, never the reverse —
 * and the fit has to be honest in BOTH directions:
 *
 *   - Art must span the collider. A row of props with daylight between them
 *     says "aim for the gap" while the collider says otherwise.
 *   - Art must not overhang it. A prop sticking out past the box reads as a
 *     wall where there is actually a way through, which costs a player a run
 *     they should have won.
 *
 * Props are therefore CLONED and fitted rather than instanced: a pack cone is
 * whatever size the pack made it, and the only way to fill a 1.82-unit lane
 * blocker honestly is to scale and repeat to measure. There are thirteen
 * obstacles on the route, so the draw cost of cloning is not worth trading
 * correctness for.
 */
import {
  Box3,
  BufferGeometry,
  Group,
  Mesh,
  Vector3,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StreetAssets } from './skyline-assets';
import type { StreetPropId } from './skyline-props';
import type { Entity } from '../levels/skyline/types';
import { ANCHOR_HEIGHT } from '../levels/skyline/motion';

/** How wide a hazard has to be before it counts as spanning the street. */
const SPAN_THRESHOLD = 3;
/** Collider underside below this is a ground obstacle, above it overhead. */
const GROUND_THRESHOLD = 0.6;

export class ObstacleKit {
  constructor(private assets: StreetAssets) {}

  /**
   * Build the visual for one hazard, in the collider's LOCAL space.
   *
   * y=0 is the collider's centre, because the scene positions the returned
   * group at the entity. The archetype is read from the volume itself rather
   * than from a field, because the shape of the box is exactly what the
   * player has to learn to read.
   */
  hazard(e: Entity): Group {
    const group = new Group();
    const span = e.halfX > SPAN_THRESHOLD;
    const clearance = e.y - e.halfY;

    if (clearance < GROUND_THRESHOLD) this.ground(group, e, span);
    else this.overhead(group, e, span, clearance);
    return bake(group);
  }

  /** A gift, dropped so it fills its collider rather than standing on it. */
  gift(e: Entity): Object3D | null {
    const prop = this.assets.prop('gift');
    if (prop) prop.position.y -= e.halfY;
    return prop;
  }

  /**
   * Street-level blockage.
   *
   * Barriers carry the width because they are the only prop in the pack that
   * tiles edge to edge without a visible seam; cones sit in front as the
   * read-at-distance cue, which is what a cone is for.
   */
  private ground(group: Group, e: Entity, span: boolean): void {
    const width = e.halfX * 2;
    this.tile(group, 'barrier', width, -e.halfY, e.halfZ * 0.2, e.halfY * 2);
    // Cones in front, spaced from the width so a lane blocker gets two and
    // the full-street wall gets five.
    const cones = span ? 5 : 2;
    for (let i = 0; i < cones; i++) {
      const t = (i + 0.5) / cones;
      this.one(group, 'cone', (t - 0.5) * width, -e.halfY, e.halfZ * 0.9);
    }
    // A beacon on a full-street wall: it is the one the player must act on
    // well before arriving, so it earns the extra read.
    if (span) {
      for (const side of [-1, 1]) {
        this.one(group, 'workLight', side * (e.halfX - 0.5), -e.halfY, e.halfZ * 0.4);
      }
    }
  }

  /**
   * Overhead blockage.
   *
   * The full-street form is the bridge, and it gets pillars carried to the
   * road: a nine-unit deck floating on nothing is the most obvious unreality
   * available. The single-lane form is a hanging sign, which already looks
   * like something bolted to a gantry.
   */
  private overhead(group: Group, e: Entity, span: boolean, clearance: number): void {
    if (span) {
      this.tile(group, 'bridgeDeck', e.halfX * 2, -e.halfY, 0, e.halfY * 2, e.halfZ * 2);
      // Pillars at the very edge, outside all three lanes, down to the road.
      for (const side of [-1, 1]) {
        const pillar = this.one(group, 'bridgePillar', side * (e.halfX - 0.6), -e.halfY, 0);
        if (pillar) this.stretch(pillar, 1, clearance, 1, 'down');
      }
      return;
    }
    // Single lane: a hanging sign filling the clearance the player must duck,
    // plus a hanger carrying it up to the overhead line the anchors use. A
    // sign suspended from nothing is the same lie as a floating deck, and
    // the cable line is already there to hang it from.
    const sign = this.one(group, 'signHanging', 0, e.halfY, 0);
    if (sign) this.fit(sign, e.halfX * 2, e.halfY * 2, e.halfZ * 2, 'top');
    const rise = ANCHOR_HEIGHT - e.y - e.halfY;
    if (rise > 0) {
      const hanger = this.one(group, 'bridgePillar', 0, e.halfY, 0);
      if (hanger) this.stretch(hanger, 0.25, rise, 0.25, 'up');
    }
  }

  /**
   * One prop, seated with its base at `y` in the group's local space.
   *
   * WRAPPED, not positioned directly. `assets.prop()` returns a clone whose
   * own position already carries the ground-seating correction, so writing
   * `prop.position` threw that away — and because most pack models happen to
   * be authored with their base near the origin the error was a fraction of
   * a unit and invisible, right up until a prop was stretched and the error
   * scaled with it.
   */
  private one(group: Group, id: StreetPropId, x: number, y: number, z: number): Object3D | null {
    const prop = this.assets.prop(id);
    if (!prop) return null;
    const holder = new Group();
    holder.position.set(x, y, z);
    holder.add(prop);
    group.add(holder);
    return holder;
  }

  /**
   * Repeat a prop edge to edge until it covers `width`, then trim the set to
   * exactly that width so nothing overhangs the collider.
   */
  private tile(
    group: Group,
    id: StreetPropId,
    width: number,
    baseY: number,
    z: number,
    height?: number,
    depth?: number,
  ): void {
    const half = this.assets.half(id);
    if (!half) return;
    const unit = Math.max(half.x * 2, 0.01);
    const count = Math.max(1, Math.ceil(width / unit));
    const step = width / count;
    for (let i = 0; i < count; i++) {
      const prop = this.one(group, id, (i + 0.5) / count * width - width / 2, baseY, z);
      if (!prop) continue;
      // Squeeze laterally so `count` copies land exactly on `width`, and
      // stretch vertically when the collider is taller than the prop.
      prop.scale.x *= step / unit;
      if (height) prop.scale.y *= height / Math.max(half.y * 2, 0.01);
      if (depth) prop.scale.z *= depth / Math.max(half.z * 2, 0.01);
    }
  }

  /** Scale a prop to exactly fill a box, anchored at its top or bottom. */
  private fit(prop: Object3D, w: number, h: number, d: number, anchor: 'top' | 'bottom'): void {
    const size = new Box3().setFromObject(prop).getSize(new Vector3());
    prop.scale.set(
      (prop.scale.x * w) / Math.max(size.x, 0.01),
      (prop.scale.y * h) / Math.max(size.y, 0.01),
      (prop.scale.z * d) / Math.max(size.z, 0.01),
    );
    prop.position.y -= anchor === 'top' ? h : 0;
  }

  /** Stretch a prop along one axis, growing from its seated end. */
  private stretch(prop: Object3D, x: number, y: number, z: number, from: 'down' | 'up'): void {
    const size = new Box3().setFromObject(prop).getSize(new Vector3());
    prop.scale.set(prop.scale.x * x, (prop.scale.y * y) / Math.max(size.y, 0.01), prop.scale.z * z);
    if (from === 'down') prop.position.y -= y;
  }
}

/**
 * Collapse a built obstacle into one mesh per material.
 *
 * A full-street barricade is five barriers, five cones and two beacons —
 * twelve draw calls for one object that never moves relative to itself. Since
 * the whole Kenney set shares a single material, merging takes each obstacle
 * to one draw. Worth doing here and not in the street layer, because these
 * are built once and then only translated.
 */
function bake(group: Group): Group {
  group.updateMatrixWorld(true);
  const byMaterial = new Map<Material, BufferGeometry[]>();
  const leftovers: Object3D[] = [];

  group.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = Array.isArray(mesh.material) ? null : mesh.material;
    if (!material) {
      leftovers.push(mesh);
      return;
    }
    const geometry = mesh.geometry.clone();
    geometry.applyMatrix4(mesh.matrixWorld);
    const bucket = byMaterial.get(material);
    if (bucket) bucket.push(geometry);
    else byMaterial.set(material, [geometry]);
  });

  if (byMaterial.size === 0) return group;

  const baked = new Group();
  for (const [material, parts] of byMaterial) {
    const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
    for (const part of parts) if (part !== merged) part.dispose();
    if (merged) baked.add(new Mesh(merged, material));
  }
  for (const extra of leftovers) baked.add(extra);
  return baked;
}
