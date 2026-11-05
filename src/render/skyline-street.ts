/**
 * Builds the level 2 street from the scene definition.
 *
 * This file decides nothing. Every position, rotation and relationship comes
 * from `levels/skyline/scene.ts` and is resolved by `skyline-resolve.ts`; the
 * job here is to turn resolved transforms into instanced meshes once, and
 * then move one group per frame.
 *
 * ---- the frame -----------------------------------------------------------
 *
 * The scene draws in a PLAYER-RELATIVE frame: the hero sits at render z=0 and
 * the world appears at `playerZ - worldZ`. Children are therefore placed at
 * local `-worldZ` and `update` sets the group's z to `playerZ`. Ahead of the
 * player is negative z; the camera sits behind at positive z.
 *
 * ---- the ground datum ----------------------------------------------------
 *
 * y=0 is the carriageway, and road tiles are base-seated so their LOWEST
 * surface lands on it. A Kenney tile is a thin plate with raised kerbs, not a
 * slab — its carriageway is at the bottom. This was got wrong in both
 * directions before `tests/skyline-datum.test.ts` pinned it.
 */
import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Vector3,
  type InstancedMesh,
} from 'three';
import type { StreetAssets } from './skyline-assets';
import type { StreetPropId } from './skyline-props';
import { SCENE, BAY, FACADE_X, KERB_X, MARGIN } from '../levels/skyline/scene';
import type { SceneDefinition } from '../levels/skyline/scene';
import { SKYLINE } from '../levels/skyline/course';
import { resolveAnchor, resolvePlacement, resolveWire, type ResolvedWire } from './skyline-resolve';

export { FACADE_X, KERB_X, MARGIN };

/** Segments per wire. Enough for the sag to read as a curve, not a kink. */
const WIRE_SEGMENTS = 10;

export class SkylineStreet {
  /** @deprecated superseded by the scene definition; see the shims below. */
  static readonly nearestDressingX = KERB_X;
  /** @deprecated superseded by the scene definition. */
  static readonly clearsGameZone = KERB_X > SKYLINE.laneWidth + 0.91;

  readonly object = new Group();

  private owned: (BufferGeometry | MeshStandardMaterial | LineBasicMaterial)[] = [];
  private meshes: (InstancedMesh | Mesh | Line | LineSegments)[] = [];
  private dummy = new Object3D();

  /** Resolved wires, exposed so anchors and the overlay read the same curve. */
  readonly wires: ResolvedWire[] = [];
  /** Resolved anchor positions, in world coordinates. */
  readonly anchors = new Map<string, Vector3>();

  /**
   * `layout` defaults to the real scene. `?inspect` passes the contact
   * sheet instead, so the same build path renders both — a review mode that
   * went down a different code path would be reviewing something else.
   */
  constructor(
    private assets: StreetAssets,
    private layout: SceneDefinition = SCENE,
  ) {
    this.buildGround();
    this.buildObjects();
    this.buildWires();
  }

  // --------------------------------------------------------------- build ---

  private buildGround(): void {
    /**
     * One dark plane under everything, as level 1 does it.
     *
     * The road tile is 17 units wide; the canyon reaches past +/-30, so
     * without this the buildings end in mid-air. Dropped a clear half unit,
     * not a hair: at 0.05 it z-fought the road and the painted lane markings
     * dissolved into a grey wash.
     */
    const route = SKYLINE.duration * SKYLINE.speed;
    const geometry = new PlaneGeometry(220, route + MARGIN * 2 + 120);
    const material = new MeshStandardMaterial({ color: 0x131d30, roughness: 1 });
    const ground = new Mesh(geometry, material);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.5, -route / 2);
    this.owned.push(geometry, material);
    this.meshes.push(ground);
    this.object.add(ground);
  }

  /** Everything the scene definition places, one instanced mesh per prop. */
  private buildObjects(): void {
    const byProp = new Map<StreetPropId, typeof SCENE.objects[number][]>();
    for (const placement of this.layout.objects) {
      const prop = placement.prop as StreetPropId;
      const list = byProp.get(prop);
      if (list) list.push(placement);
      else byProp.set(prop, [placement]);
    }

    for (const [prop, placements] of byProp) {
      const mesh = this.assets.batch(prop, placements.length);
      if (!mesh) continue;
      let written = 0;
      for (const placement of placements) {
        const resolved = resolvePlacement(placement, this.assets);
        if (!resolved) continue;
        this.dummy.position.set(resolved.position.x, resolved.position.y, -resolved.position.z);
        this.dummy.rotation.set(0, resolved.rotationY, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        mesh.setMatrixAt(written++, this.dummy.matrix);
      }
      mesh.count = written;
      mesh.instanceMatrix.needsUpdate = true;
      this.meshes.push(mesh);
      this.object.add(mesh);
    }
  }

  /**
   * Streetcar overhead, strung facade to facade.
   *
   * Drawn as one `LineSegments` for every wire on the route — 21 spans of
   * ten segments is one draw call. The anchors read their height off the
   * same resolved curve, so the rope can never end somewhere the cable is
   * not.
   */
  private buildWires(): void {
    const points: number[] = [];
    for (const wire of this.layout.wires) {
      const resolved = resolveWire(wire, this.assets, this.layout.objects);
      if (!resolved) continue;
      this.wires.push(resolved);

      let previous: Vector3 | null = null;
      for (let i = 0; i <= WIRE_SEGMENTS; i++) {
        const t = i / WIRE_SEGMENTS;
        const x = resolved.a.x + (resolved.b.x - resolved.a.x) * t;
        const z = resolved.a.z + (resolved.b.z - resolved.a.z) * t;
        const straight = resolved.a.y + (resolved.b.y - resolved.a.y) * t;
        const span = Math.abs(resolved.b.x - resolved.a.x);
        const y = straight - resolved.sag * span * 4 * t * (1 - t);
        const here = new Vector3(x, y, -z);
        if (previous) points.push(previous.x, previous.y, previous.z, here.x, here.y, here.z);
        previous = here;
      }
    }

    for (const anchor of this.layout.anchors) {
      const wire = this.wires.find((w) => w.id === anchor.wire);
      if (wire) this.anchors.set(anchor.id, resolveAnchor(anchor.lane, wire));
    }

    if (points.length === 0) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
    const material = new LineBasicMaterial({ color: 0x2a3550 });
    const lines = new LineSegments(geometry, material);
    lines.frustumCulled = false;
    this.owned.push(geometry, material);
    this.meshes.push(lines);
    this.object.add(lines);
  }

  // -------------------------------------------------------------- update ---

  /**
   * The entire frame cost of this layer.
   *
   * One transform on one group. Nothing is created, destroyed or rewritten,
   * which is what makes popping unexpressible rather than merely tuned away.
   */
  update(playerZ: number): void {
    this.object.position.z = playerZ;
  }

  /** Instance counts, for the no-churn test. */
  get census(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const mesh of this.meshes) {
      const instanced = mesh as InstancedMesh;
      if (instanced.isInstancedMesh) out[mesh.uuid] = instanced.count;
    }
    out['(wires)'] = this.wires.length;
    out['(anchors)'] = this.anchors.size;
    return out;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      const instanced = mesh as InstancedMesh;
      if (instanced.isInstancedMesh) instanced.dispose();
      mesh.removeFromParent();
    }
    this.meshes.length = 0;
    for (const item of this.owned) item.dispose();
    this.owned.length = 0;
    this.object.removeFromParent();
  }
}

/** Nearest dressing to the route, for the zone contract. */
export const NEAREST_DRESSING_X = KERB_X;
export const BAY_PITCH = BAY;

/**
 * Compatibility shims for tests written against the previous street.
 *
 * The rotation itself now lives in `skyline-resolve.ts`, where it is derived
 * from each prop's measured `front` rather than assumed to be a facade's.
 * These keep the existing tests compiling through the visual pass; they are
 * removed when the tests are rewritten against the scene definition.
 */
export const facadeTurn = (side: -1 | 1): number => (side > 0 ? -Math.PI / 2 : Math.PI / 2);
