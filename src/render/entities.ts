/**
 * Asset-backed gameplay visuals (design doc §5, §12 Phase 4).
 *
 * Replaces the primitive capsules and crates with the chosen assets, through
 * the presentation-adapter seam so colliders and timings are untouched. The
 * runner's tests are the check on that: if they change, art has altered
 * gameplay.
 *
 * Draw-call discipline drives the structure. The scene was already at 75 of a
 * 100-call budget before any of this, so:
 *
 *  - every sparkle in the level shares one `SparkleField`, one draw
 *  - every laser shares one `InstancedMesh`, one draw
 *  - props are loaded once and cloned, so a repeated hazard costs no fetch
 *
 * Anything absent falls back to a primitive rather than vanishing, which
 * keeps the level playable if an asset fails to load.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  TorusGeometry,
  Vector3,
} from 'three';
import type { LevelConfig } from '../levels/types';
import type { TrackedEntity } from '../levels/runner';
import { PALETTE, ROLE } from './palette';
import { SparkleField } from './effects';
import type { PropId } from './environment/props';

/** Beyond this an entity is not drawn; fog hides it anyway. */
export const DRAW_DISTANCE = 44;

/**
 * Bars per laser. Two horizontal beams at different heights, which reads as a
 * security barrier rather than a single stripe.
 *
 * They are solid boxes rather than quads, so neither vanishes edge-on and no
 * crossed pair is needed — an earlier version rotated the second bar about Z
 * and drew a plus sign across the lane.
 */
const LASER_BARS = 2;
const BAR_HEIGHTS = [0.42, 0.78];

export type PropProvider = (id: PropId) => Object3D | null;

/** Which prop stands in for which hazard style. */
const STYLE_PROP: Record<string, PropId> = {
  turret: 'cannon',
  blocker: 'snowman',
};

export class EntityVisuals {
  readonly group = new Group();

  private readonly objects = new Map<string, Object3D>();
  private readonly laserIndex = new Map<string, number>();
  private readonly lasers: InstancedMesh;
  private readonly sparkle: SparkleField;
  private readonly matrix = new Matrix4();
  private readonly scratch = new Vector3();
  private readonly anchors: Vector3[] = [];
  private spin = 0;

  constructor(
    private readonly level: LevelConfig,
    tracked: readonly TrackedEntity[],
    prop: PropProvider,
  ) {
    const laserCount = tracked.filter((t) => t.entity.style === 'laser').length;

    // One instanced mesh for every beam in the level.
    this.lasers = new InstancedMesh(
      new BoxGeometry(this.level.laneWidth * 0.94, 0.055, 0.055),
      new MeshBasicMaterial({
        color: new Color(ROLE.hazard),
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      Math.max(1, laserCount * LASER_BARS),
    );
    this.lasers.frustumCulled = false;
    this.lasers.count = 0;
    this.group.add(this.lasers);

    // One sparkle system for every gift plus every laser.
    this.sparkle = new SparkleField(tracked.length, {
      count: 8,
      radius: 0.38,
      size: 0.13,
    });
    this.group.add(this.sparkle.points);

    let nextLaser = 0;
    for (const t of tracked) {
      if (t.entity.style === 'laser') {
        this.laserIndex.set(t.entity.id, nextLaser);
        nextLaser += LASER_BARS;
        continue;
      }
      const object = this.makeEntity(t, prop);
      object.position.x = this.laneX(t.entity.lane);
      this.objects.set(t.entity.id, object);
      this.group.add(object);
    }
  }

  private laneX(lane: number): number {
    return (lane - (this.level.laneCount - 1) / 2) * this.level.laneWidth;
  }

  /** Real asset where one exists, primitive where it does not. */
  private makeEntity(t: TrackedEntity, prop: PropProvider): Object3D {
    if (t.entity.kind === 'gift') {
      const present = prop('gift');
      if (present) return present;
      return fallbackGift();
    }

    if (t.entity.kind === 'guard') {
      // The guard model is pooled separately, since it is animated; this is
      // only the ground marker that shows where the encounter is.
      return new Group();
    }

    const id = t.entity.style ? STYLE_PROP[t.entity.style] : undefined;
    const model = id ? prop(id) : null;
    return model ?? fallbackHazard();
  }

  update(tracked: readonly TrackedEntity[], step: number): void {
    this.spin += step;
    this.anchors.length = 0;

    let laserInstances = 0;

    for (const t of tracked) {
      const ahead = t.relativeZ;
      const visible = t.state !== 'collected' && ahead < DRAW_DISTANCE && ahead > -4;

      // ---- lasers: write instance transforms, no per-object meshes -----
      const base = this.laserIndex.get(t.entity.id);
      if (base !== undefined) {
        if (visible && t.state !== 'hit') {
          const x = this.laneX(t.entity.lane);
          // Shallow pulse, enough to read as live without flickering.
          const flicker = Math.sin(this.spin * 7) * 0.012;
          for (let bar = 0; bar < LASER_BARS; bar++) {
            this.matrix.identity();
            this.matrix.setPosition(x, (BAR_HEIGHTS[bar] ?? 0.5) + flicker, -ahead);
            this.lasers.setMatrixAt(laserInstances++, this.matrix);
          }
          this.anchors.push(this.scratch.set(x, 0.6, -ahead).clone());
        }
        continue;
      }

      // ---- everything else: a cloned prop ------------------------------
      const object = this.objects.get(t.entity.id);
      if (!object) continue;
      object.visible = visible;
      if (!visible) continue;

      object.position.z = -ahead;

      if (t.entity.kind === 'gift') {
        object.rotation.y = this.spin * 1.4;
        object.position.y = 0.42 + Math.sin(this.spin * 2.4) * 0.06;
        // Only a gift still worth taking should shimmer.
        if (t.state === 'pending') {
          this.anchors.push(
            this.scratch.set(object.position.x, object.position.y + 0.1, -ahead).clone(),
          );
        }
      }

      if (t.state === 'hit') dim(object);
    }

    this.lasers.count = laserInstances;
    this.lasers.instanceMatrix.needsUpdate = true;
    this.sparkle.setAnchors(this.anchors);
    this.sparkle.update(step);
  }

  dispose(): void {
    for (const object of this.objects.values()) object.removeFromParent();
    this.objects.clear();
    this.lasers.geometry.dispose();
    (this.lasers.material as MeshBasicMaterial).dispose();
    this.lasers.removeFromParent();
    this.sparkle.dispose();
    this.group.removeFromParent();
  }
}

/** A struck hazard stays visible but reads as spent. */
function dim(object: Object3D): void {
  object.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material as MeshStandardMaterial;
    if (material.color) material.color.lerp(new Color(PALETTE.slate), 0.25);
  });
}

function fallbackGift(): Mesh {
  const mesh = new Mesh(
    new TorusGeometry(0.3, 0.1, 8, 14),
    new MeshStandardMaterial({ color: ROLE.collectible, roughness: 0.4 }),
  );
  mesh.rotation.x = Math.PI / 2;
  return mesh;
}

function fallbackHazard(): Mesh {
  const mesh = new Mesh(
    new BoxGeometry(0.9, 0.8, 0.8),
    new MeshStandardMaterial({ color: ROLE.hazard, roughness: 0.8 }),
  );
  mesh.position.y = 0.4;
  return mesh;
}

