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
   * Ground obstacles (Option A):
   * - Single-lane (laneBlock): Clean row of 3 traffic cones across the lane.
   * - Full-street (barricade): Solid wall of 5 construction barriers spanning all 3 lanes.
   * Distinct reads: cones mean "detour around lane", barriers mean "street blocked".
   */
  private ground(group: Group, e: Entity, span: boolean): void {
    const width = e.halfX * 2;

    if (!span) {
      // Single lane: Traffic cones spanning the lane edge-to-edge
      const half = this.assets.half('cone');
      const coneHalfX = half ? half.x : 0.49;
      // Position two cones so their outer edges align with the lane collider boundaries
      const xOffset = Math.max(0, e.halfX - coneHalfX);
      this.one(group, 'cone', -xOffset, -e.halfY, 0);
      this.one(group, 'cone', xOffset, -e.halfY, 0);
      return;
    }

    // Full-street barricade: 5 construction barriers tiled across all 3 lanes
    const half = this.assets.half('barrier');
    const across = Math.max((half ? half.z : 0.91) * 2, 0.01);
    const count = 5;
    const uniformScale = width / (count * across);

    for (let i = 0; i < count; i++) {
      const x = (i + 0.5) / count * width - width / 2;
      const barrier = this.one(group, 'barrier', x, -e.halfY, 0, BLOCKING_TURN);
      if (barrier && uniformScale !== 1) {
        barrier.scale.setScalar(uniformScale);
      }
    }
  }

  /**
   * Overhead obstacles:
   * - Full-street bridge: Highway Gantry (signGantry) elevated so the truss clears y ~ 12.5m
   *   (above the swing apex) and sign panels hang across the corridor y in [6.5, 12m].
   * - Single-lane hangingSign: Vertically stacked traffic signal rig (trafficLightVert +
   *   trafficLightHoriz) suspended from the cable, blocking the swing corridor y in [6.5, 12m]
   *   while leaving the road clear underneath for runners to dive/run under.
   */
  private overhead(group: Group, e: Entity, span: boolean): void {
    if (span) {
      // Highway Gantry: elevated truss spanning all 3 lanes, posts on kerbs
      // Scaled by 1.35 uniformly so the truss reaches y ~ 12.5m, clearing Matthew's apex
      const gantry = this.one(group, 'signGantry', 0, -e.y, 0, BLOCKING_TURN);
      if (gantry) {
        gantry.scale.setScalar(1.35);
      }
      return;
    }

    // Single lane: Multi-head vertical signal rig in the lane
    // Upper vertical head at local y = +1.3 (world y = 10.3m, covering apex swing height)
    const upperHead = this.one(group, 'trafficLightVert', 0, 1.3, 0);
    if (upperHead) {
      upperHead.scale.setScalar(1.15);
    }

    // Lower horizontal head at local y = -1.2 (world y = 7.8m, covering trough/mid swing height)
    const lowerHead = this.one(group, 'trafficLightHoriz', 0, -1.2, 0, BLOCKING_TURN);
    if (lowerHead) {
      const half = this.assets.half('trafficLightHoriz');
      const across = Math.max((half ? half.z : 0.91) * 2, 0.01);
      const uniformScale = (e.halfX * 2) / across;
      lowerHead.scale.setScalar(uniformScale);
    }

    // Central mounting mast connecting the upper and lower heads
    const mastHeight = 4.8;
    const mast = new Mesh(
      new BoxGeometry(0.12, mastHeight, 0.12),
      new MeshBasicMaterial({ color: 0x2e384d }),
    );
    mast.position.set(0, 0.2, 0);
    group.add(mast);

    // Slender vertical suspension cable connecting the rig up to the streetcar cable line
    const cableTop = ANCHOR_HEIGHT - e.y;
    const mastTop = 0.2 + mastHeight / 2;
    const rise = cableTop - mastTop;
    if (rise > 0) {
      const cable = new Mesh(
        new BoxGeometry(0.04, rise, 0.04),
        new MeshBasicMaterial({ color: 0x2e384d }),
      );
      cable.position.set(0, mastTop + rise / 2, 0);
      group.add(cable);
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
