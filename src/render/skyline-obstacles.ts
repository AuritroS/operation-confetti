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
  BoxGeometry,
  BufferGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Material,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { StreetAssets } from './skyline-assets';
import type { StreetPropId } from './skyline-props';
import type { Entity } from '../levels/skyline/types';
import { ANCHOR_HEIGHT } from '../levels/skyline/motion';

/**
 * Threshold-based inference is gone.
 *
 * This file used to work out whether to build a bridge, a sign or a
 * barricade by measuring the collider it was given — wider than 3 meant a
 * span, a bottom above 0.6 meant overhead. That is reading intent out of a
 * number, and it is how `cone-right` came to render as a row of barriers.
 * The entity now carries `assembly`, named by the scene.
 */
/**
 * Quarter turn that puts a prop ACROSS the player's path instead of along it.
 *
 * Measured. The Kenney street furniture is authored with its long axis on Z:
 *
 *     construction-barrier   0.135 wide x 0.225 deep
 *     construction-fence     0.075 wide x 0.375 deep
 *     dumpster               0.275 wide x 0.370 deep
 *     road-sign-empty-hanging 0.09 wide x 0.295 deep
 *
 * The route also runs along Z, so dropped in untouched every one of them
 * pointed AT the player — a barrier lying lengthways down the lane it was
 * supposed to be blocking, and a sign panel showing its edge instead of its
 * face. `road-bridge` is the same story for a different reason: it is a road
 * segment, and a bridge crossing the street has to run across it.
 *
 * Cones and beacons are square in plan and need no turn, which is why the
 * barricade was the one obstacle that looked right.
 */
export const BLOCKING_TURN = Math.PI / 2;

/**
 * Props whose authored long axis runs along Z and therefore need the turn.
 *
 * Exported so the test checks the SAME list the builder uses. A test that
 * restates which props are long passes however wrong the builder is — the
 * facade test made exactly that mistake in draft.
 */
export const TURNED_PROPS: readonly StreetPropId[] = [
  'barrier',
  'fence',
  'dumpster',
  'bridgeDeck',
  'signHanging',
  'signGantry',
  'trafficLightHoriz',
];

export class ObstacleKit {
  constructor(private assets: StreetAssets) {}

  /**
   * Build the visual for one hazard, in the collider's LOCAL space.
   *
   * y=0 is the collider's centre, because the scene positions the returned
   * group at the entity. The assembly is NAMED by the scene; it used to be
   * inferred from the collider's width and bottom height, which is reading
   * intent out of a number and is how `cone-right` rendered as barriers.
   */
  hazard(e: Entity): Group {
    const group = new Group();

    switch (e.assembly) {
      case 'barricade':
        this.ground(group, e, true);
        break;
      case 'laneBlock':
        this.ground(group, e, false);
        break;
      case 'bridge':
        this.overhead(group, e, true);
        break;
      case 'hangingSign':
        this.overhead(group, e, false);
        break;
      default:
        break;
    }
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
   * Barriers carry the width because they tile cleanly without seams.
   * Scaled uniformly with 1:1:1 aspect ratio to avoid any warping.
   * Cones sit in front on the road as the read-at-distance cue.
   */
  private ground(group: Group, e: Entity, span: boolean): void {
    const width = e.halfX * 2;
    const half = this.assets.half('barrier');
    const across = Math.max((half ? half.z : 0.91) * 2, 0.01);
    const count = span ? Math.max(1, Math.round(width / across)) : 1;
    // Uniform scale factor so barriers fit the lane or span without distortion
    const uniformScale = span ? width / (count * across) : width / across;

    for (let i = 0; i < count; i++) {
      const x = count > 1 ? (i + 0.5) / count * width - width / 2 : 0;
      const prop = this.one(group, 'barrier', x, -e.halfY, e.halfZ * 0.2, BLOCKING_TURN);
      if (prop && uniformScale !== 1) {
        prop.scale.setScalar(uniformScale);
      }
    }

    // Cones in front on the road surface
    const cones = span ? 5 : 2;
    for (let i = 0; i < cones; i++) {
      const t = (i + 0.5) / cones;
      this.one(group, 'cone', (t - 0.5) * width, -e.halfY, e.halfZ * 0.9);
    }
  }

  /**
   * Overhead blockage.
   *
   * The full-street form is the highway gantry (`signGantry`), whose upright posts
   * stand on the kerbs outside the lanes and whose wide crossbeam spans all 3 lanes.
   * The single-lane form is a suspended horizontal traffic signal head (`trafficLightHoriz`)
   * dropped from the overhead streetcar cable line.
   */
  private overhead(group: Group, e: Entity, span: boolean): void {
    if (span) {
      // Highway Gantry: wide truss crossbeam spanning all 3 lanes, upright posts on kerbs.
      // Seated on the road surface (-e.y) so the upright posts stand firmly on the pavements.
      this.one(group, 'signGantry', 0, -e.y, 0, BLOCKING_TURN);
      return;
    }

    // Single lane: horizontal traffic light head centered in the lane at uniform scale
    const half = this.assets.half('trafficLightHoriz');
    const across = Math.max((half ? half.z : 0.91) * 2, 0.01);
    const sign = this.one(group, 'trafficLightHoriz', 0, 0, 0, BLOCKING_TURN);
    if (sign) {
      const uniformScale = (e.halfX * 2) / across;
      sign.scale.setScalar(uniformScale);
    }

    // Slender vertical hanger cable connecting the signal head up to the overhead cable line
    const rise = ANCHOR_HEIGHT - e.y - 0.4;
    if (rise > 0) {
      const hanger = new Mesh(
        new BoxGeometry(0.04, rise, 0.04),
        new MeshBasicMaterial({ color: 0x2e384d }),
      );
      hanger.position.set(0, 0.4 + rise / 2, 0);
      group.add(hanger);
    }
  }

  /**
   * One prop, seated with its base at `y` in the group's local space.
   *
   * WRAPPED, not positioned directly. `assets.prop()` returns a clone whose
   * own position already carries the ground-seating correction, so writing
   * `prop.position` threw that away.
   */
  private one(
    group: Group, id: StreetPropId, x: number, y: number, z: number, turn = 0,
  ): Object3D | null {
    const prop = this.assets.prop(id);
    if (!prop) return null;
    const holder = new Group();
    holder.position.set(x, y, z);
    if (turn) {
      const pivot = new Group();
      pivot.rotation.y = turn;
      pivot.add(prop);
      holder.add(pivot);
    } else {
      holder.add(prop);
    }
    group.add(holder);
    return holder;
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
