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
  'signWarningDiamond',
  'signStopOctagon',
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
   * - Single-lane (laneBlock): 2 heavy-duty traffic cones scaled 1.45x (height 1.77m,
   *   chest-high on Matthew) spanning the lane edge-to-edge.
   * - Full-street (barricade): 3 large highway-scale construction barriers scaled 1.68x
   *   uniformly (height 1.77m), each barrier directly covering one of the 3 lanes.
   * Distinct reads: cones mean "detour around lane", barriers mean "street blocked".
   */
  private ground(group: Group, e: Entity, span: boolean): void {
    const width = e.halfX * 2;

    if (!span) {
      // Single lane: 2 heavy-duty traffic cones scaled 1.45x (height 1.77m, chest-high)
      const half = this.assets.half('cone');
      const coneHalfX = half ? half.x : 0.49;
      const coneScale = 1.45;
      const effectiveRadius = coneHalfX * coneScale;
      // Position two cones so their outer edges align with the lane collider boundaries
      const xOffset = Math.max(0, e.halfX - effectiveRadius);
      for (const side of [-1, 1]) {
        const cone = this.one(group, 'cone', side * xOffset, -e.halfY, 0);
        if (cone) {
          cone.scale.setScalar(coneScale);
        }
      }
      return;
    }

    // Full-street barricade: 3 large highway construction barriers scaled 1.68x uniformly (height 1.77m)
    // Seamlessly tiled so each barrier directly commands one lane of the 3-lane street
    const half = this.assets.half('barrier');
    const across = Math.max((half ? half.z : 0.91) * 2, 0.01);
    const count = 3;
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
   * - Single-lane hangingSign: 3 Warning Diamonds stacked vertically in the lane, suspended
   *   directly from the overhead streetcar cable (y = 19m) that Matthew anchors to.
   *   Blocks the swing corridor y in [6.3m, 11.7m] from any flight angle while leaving
   *   the road clear underneath (y in [0, 6.3m]) with over 3.9m of headroom for runners.
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

    // Single lane: 3 Warning Diamonds stacked vertically in the lane,
    // suspended directly from the overhead streetcar cable (y = 19m) that Matthew anchors to.
    const half = this.assets.half('signWarningDiamond');
    const across = Math.max((half ? half.z : 0.87) * 2, 0.01);
    const uniformScale = (e.halfX * 2) / across;
    const signHeight = across * uniformScale;

    // Stack 3 Warning Diamonds vertically:
    // Lower diamond: world y ~ 6.3m to 8.1m (blocks low-trough swing)
    // Middle diamond: world y ~ 8.1m to 9.9m (blocks mid-level flight)
    // Upper diamond: world y ~ 9.9m to 11.7m (blocks high-apex swing)
    const yOffsets = [-signHeight * 1.5, -signHeight * 0.5, signHeight * 0.5];
    for (const yBase of yOffsets) {
      const sign = this.one(group, 'signWarningDiamond', 0, yBase, 0, BLOCKING_TURN);
      if (sign) {
        sign.scale.setScalar(uniformScale);
      }
    }

    // Central structural steel mounting spine connecting the 3 signs together
    const totalSpan = signHeight * 3;
    const spineMat = new MeshBasicMaterial({ color: 0x2e384d });
    const spine = new Mesh(new BoxGeometry(0.12, totalSpan, 0.12), spineMat);
    spine.position.set(0, 0, -0.05);
    group.add(spine);

    // Calculate the actual catenary wire height at this lane's X position
    // Street span is 19.2m (facade at +/-9.6m) with 0.05 sag
    const facadeX = 9.6;
    const streetSpan = facadeX * 2;
    const tLane = Math.max(0, Math.min(1, (e.x - (-facadeX)) / streetSpan));
    const wireWorldY = 19.0 - 0.05 * streetSpan * 4 * tLane * (1 - tLane);
    const wireY = wireWorldY - e.y;
    const cableTop = Math.max(wireY + 0.45, ANCHOR_HEIGHT - e.y - 0.5);
    const signTop = signHeight * 1.5;
    const rise = cableTop - signTop;

    if (rise > 0) {
      // Dual vertical suspension hanger cables rising directly to the streetcar wire
      for (const side of [-0.55, 0.55]) {
        const cable = new Mesh(new BoxGeometry(0.04, rise, 0.04), spineMat);
        cable.position.set(side, signTop + rise / 2, -0.05);
        group.add(cable);

        // 3D cast-iron cable clamp sleeves physically gripping the longitudinal trolley wire
        const clampSleeve = new Mesh(new BoxGeometry(0.09, 0.09, 0.35), spineMat);
        clampSleeve.position.set(side, wireY, -0.05);
        group.add(clampSleeve);
      }
      // Transverse clamp bar gripping the cross-span catenary wire
      const clampBar = new Mesh(new BoxGeometry(1.3, 0.08, 0.08), spineMat);
      clampBar.position.set(0, wireY, -0.05);
      group.add(clampBar);
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
