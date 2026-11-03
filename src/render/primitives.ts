/**
 * Presentation adapter (design doc §11, §12 Phase 4).
 *
 * Maps simulation state to meshes. This is the only module that should change
 * when primitives are replaced by real assets: colliders, timings and scoring
 * live in `src/levels`, so a visual swap cannot alter gameplay.
 *
 * The player visual is already asset-backed here — the Rogue is loaded when
 * available and a capsule stands in when it is not — which proves that seam
 * works before the remaining art arrives.
 */
import {
  BoxGeometry,
  CapsuleGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  TorusGeometry,
} from 'three';
import type { LevelConfig } from '../levels/types';
import type { TrackedEntity } from '../levels/runner';

const PLAYER_BLUE = 0x4da3ff;
const GOLD = 0xffc54d;
const CRATE = 0x8a6a4a;

/**
 * Beyond this distance an entity is not drawn; fog hides it anyway.
 *
 * Exported because it is part of the culling contract: a culled mesh keeps
 * whatever position it last had, so anything reading mesh positions needs to
 * know when they are meaningful.
 */
export const DRAW_DISTANCE = 34;

export interface PlayerVisual {
  readonly object: Object3D;
  /** Flash on a hit, and blink while protection is active. */
  setHitFlash(active: boolean): void;
  /** Called with the fixed simulation step; drives animation if any. */
  update(step: number, moving: boolean): void;
  dispose(): void;
}

// ---------------------------------------------------------------- route ----

export function buildRoute(level: LevelConfig): Group {
  const group = new Group();
  const width = level.laneWidth * level.laneCount;

  const ground = new Mesh(
    new PlaneGeometry(width, DRAW_DISTANCE * 2),
    new MeshStandardMaterial({ color: 0x27354f, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  group.add(ground);

  // Lane dividers make the result of a swipe legible without any art.
  for (let i = 0; i <= level.laneCount; i++) {
    const stripe = new Mesh(
      new PlaneGeometry(0.05, DRAW_DISTANCE * 2),
      new MeshStandardMaterial({ color: 0x3c4e73, roughness: 1 }),
    );
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set((i - level.laneCount / 2) * level.laneWidth, 0.01, 0);
    group.add(stripe);
  }

  return group;
}

/**
 * Scrolling distance markers. Without them the sense of forward speed is
 * ambiguous, which makes judging the reaction window impossible.
 */
export class RouteMarkers {
  readonly group = new Group();
  private readonly meshes: Mesh[] = [];

  constructor(level: LevelConfig, private readonly spacing = 10) {
    const count = Math.ceil(DRAW_DISTANCE / spacing) + 1;
    for (let i = 0; i < count; i++) {
      const m = new Mesh(
        new BoxGeometry(level.laneWidth * level.laneCount, 0.06, 0.2),
        new MeshStandardMaterial({ color: 0x3c4e73, roughness: 0.8 }),
      );
      this.group.add(m);
      this.meshes.push(m);
    }
  }

  update(travelled: number): void {
    for (const [i, m] of this.meshes.entries()) {
      // Repeat the markers through a fixed window rather than allocating one
      // per route unit.
      const base = Math.floor(travelled / this.spacing) * this.spacing;
      const z = base + (i + 1) * this.spacing - travelled;
      m.position.set(0, 0.03, -z);
    }
  }
}

// --------------------------------------------------------------- entities ---

export class EntityVisuals {
  readonly group = new Group();
  private readonly objects = new Map<string, Object3D>();
  private spin = 0;

  constructor(
    private readonly level: LevelConfig,
    tracked: readonly TrackedEntity[],
  ) {
    for (const t of tracked) {
      const object = makeEntity(t);
      object.position.x = this.laneX(t.entity.lane);
      this.objects.set(t.entity.id, object);
      this.group.add(object);
    }
  }

  private laneX(lane: number): number {
    return (lane - (this.level.laneCount - 1) / 2) * this.level.laneWidth;
  }

  update(tracked: readonly TrackedEntity[], step: number): void {
    this.spin += step;

    for (const t of tracked) {
      const object = this.objects.get(t.entity.id);
      if (!object) continue;

      const ahead = t.relativeZ;
      // Cull by distance and by being spent, so collected gifts vanish.
      const visible =
        t.state !== 'collected' && ahead < DRAW_DISTANCE && ahead > -4;
      object.visible = visible;
      if (!visible) continue;

      object.position.z = -ahead;

      if (t.entity.kind === 'gift') {
        object.rotation.y = this.spin * 1.6;
        object.position.y = 0.75 + Math.sin(this.spin * 2.4) * 0.07;
      }
      if (t.state === 'hit') {
        // A struck obstacle stays visible but reads as spent.
        const mesh = object as Mesh;
        const mat = mesh.material as MeshStandardMaterial | undefined;
        mat?.color.setHex(0x55617a);
      }
    }
  }

  dispose(): void {
    for (const object of this.objects.values()) object.removeFromParent();
    this.objects.clear();
  }
}

function makeEntity(t: TrackedEntity): Object3D {
  if (t.entity.kind === 'gift') {
    // A ring reads as collectable at distance and is unmistakably not a
    // hazard, which matters more than looking like a present at this stage.
    const mesh = new Mesh(
      new TorusGeometry(0.34, 0.12, 8, 16),
      new MeshStandardMaterial({
        color: GOLD,
        roughness: 0.35,
        emissive: new Color(0x5a4000),
      }),
    );
    mesh.rotation.x = Math.PI / 2;
    mesh.position.y = 0.75;
    return mesh;
  }

  const mesh = new Mesh(
    new BoxGeometry(1.0, 0.9, 0.9),
    new MeshStandardMaterial({ color: CRATE, roughness: 0.85 }),
  );
  mesh.position.y = 0.45;
  return mesh;
}

// ----------------------------------------------------------------- player ---

/** Fallback player visual, used until the Rogue finishes loading. */
export function makeCapsulePlayer(): PlayerVisual {
  const mesh = new Mesh(
    new CapsuleGeometry(0.33, 0.72, 6, 12),
    new MeshStandardMaterial({ color: PLAYER_BLUE, roughness: 0.5 }),
  );
  mesh.position.y = 0.69;

  const group = new Group();
  group.add(mesh);

  return {
    object: group,
    setHitFlash(active: boolean): void {
      mesh.material.color.setHex(active ? 0xff5d6c : PLAYER_BLUE);
    },
    update(): void {
      /* nothing to animate */
    },
    dispose(): void {
      mesh.geometry.dispose();
      mesh.material.dispose();
      group.removeFromParent();
    },
  };
}
