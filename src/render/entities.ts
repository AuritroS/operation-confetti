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
import { GiftGlowField, Searchlight } from './effects';
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
/**
 * Emitter housings at the lane edges.
 *
 * Two beams hanging in the air with nothing under them read as props that
 * failed to land. The first attempt stood them on uprights drawn in the
 * beams' own magenta additive material, which only turned the hazard into a
 * magenta fence.
 *
 * These are matte steel instead, in their own batch: hardware, not a signal.
 * It keeps the rule the palette sets — if it glows, it matters — so the
 * housing is a prop the player can ignore and the beam is the threat.
 */
const LASER_POSTS = 2;
const POST_TOP = 0.92;

export type PropProvider = (id: PropId) => Object3D | null;

/**
 * Vertical pillars per fence, and their x offsets within the lane.
 *
 * A fence shares the laser's InstancedMesh, differing only in transform, so
 * the second hazard shape costs nothing. It replaced a pack mesh turret that
 * read as scenery: a small beige object on a dark roof gives the eye no
 * reason to treat it as danger, whereas emissive magenta in an unfamiliar
 * silhouette does.
 */
const FENCE_PILLARS = 3;
const PILLAR_HEIGHT = 1.15;

/** How long a collected gift takes to pop and vanish. */
const POP_SECONDS = 0.25;

/** Spotlights in flight at once. Encounters are 23+ units apart. */
const SPOTLIGHT_POOL = 3;

/** Default commit distance when an entity does not name one. */
const DEFAULT_LOCK_LEAD = 30;

/** Distance at which the strike lands and the cone flares. */
const STRIKE_LEAD = 5;

export class EntityVisuals {
  readonly group = new Group();

  private readonly objects = new Map<string, Object3D>();
  private readonly barIndex = new Map<string, { base: number; count: number }>();
  private readonly lasers: InstancedMesh;
  /** Matte housings the beams emit from. Hardware, never a signal. */
  private readonly emitters: InstancedMesh;
  private emitterCount = 0;
  private readonly lights: { light: Searchlight; id: string | null }[] = [];
  /** Seconds since each gift was taken, driving its pop. */
  private readonly collected = new Map<string, number>();
  /** Authored scale per object, so a pop multiplies rather than replaces it. */
  private readonly baseScale = new Map<string, number>();
  readonly giftGlow: GiftGlowField;
  private readonly matrix = new Matrix4();
  private readonly scratch = new Vector3();
  private readonly anchors: Vector3[] = [];
  private spin = 0;

  constructor(
    private readonly level: LevelConfig,
    tracked: readonly TrackedEntity[],
    prop: PropProvider,
  ) {
    // Lasers and fences share one batch; count the bars each needs.
    const barTotal = tracked.reduce(
      (n, t) =>
        n +
        (t.entity.style === 'laser' ? LASER_BARS : t.entity.style === 'fence' ? FENCE_PILLARS : 0),
      0,
    );

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
      Math.max(1, barTotal),
    );
    this.lasers.frustumCulled = false;
    this.lasers.count = 0;
    this.group.add(this.lasers);

    this.emitters = new InstancedMesh(
      new BoxGeometry(0.1, POST_TOP, 0.1),
      new MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.6 }),
      Math.max(1, barTotal),
    );
    this.emitters.frustumCulled = false;
    this.emitters.count = 0;
    this.group.add(this.emitters);

    // One collectible glow aura batch for all gifts.
    this.giftGlow = new GiftGlowField(tracked.length, {
      size: 1.6,
      color: PALETTE.gold,
    });
    this.group.add(this.giftGlow.group);

    let nextBar = 0;
    for (const t of tracked) {
      const bars =
        t.entity.style === 'laser' ? LASER_BARS : t.entity.style === 'fence' ? FENCE_PILLARS : 0;
      if (bars > 0) {
        this.barIndex.set(t.entity.id, { base: nextBar, count: bars });
        nextBar += bars;
        continue;
      }
      // Spotlights are drawn by the pool, not by a per-entity object.
      if (t.entity.style === 'spotlight') continue;

      const object = this.makeEntity(t, prop);
      object.position.x = this.laneX(t.entity.lane);
      this.objects.set(t.entity.id, object);
      // The registry already scaled this prop; remember it so the pop can
      // multiply rather than overwrite, which made a taken gift balloon to
      // nearly twice its intended size.
      this.baseScale.set(t.entity.id, object.scale.x);
      this.group.add(object);

      // Seed the pop as already finished for anything taken before this
      // instance existed. The visuals are rebuilt when props finish loading,
      // and without this every gift collected up to that point replayed its
      // pickup animation — a giant present appearing over the player seconds
      // after it was actually collected.
      if (t.state !== 'pending') {
        this.collected.set(t.entity.id, POP_SECONDS);
        object.visible = false;
      }
    }

    // A small pool of cones, assigned to whichever spotlights are closest.
    for (let i = 0; i < SPOTLIGHT_POOL; i++) {
      const light = new Searchlight(level.laneCount, level.laneWidth, 5.5);
      light.group.visible = false;
      this.group.add(light.group);
      this.lights.push({ light, id: null });
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

    // Every hazard style is procedural now; nothing else reaches here.
    void prop;
    return fallbackHazard();
  }

  update(tracked: readonly TrackedEntity[], step: number): void {
    this.spin += step;
    this.anchors.length = 0;

    let bars = 0;
    this.emitterCount = 0;
    const spotlights: TrackedEntity[] = [];

    for (const t of tracked) {
      const ahead = t.relativeZ;
      const inRange = ahead < DRAW_DISTANCE && ahead > -4;

      if (t.entity.style === 'spotlight') {
        if (inRange) spotlights.push(t);
        continue;
      }

      // ---- lasers and fences: transforms into the shared batch ---------
      const slot = this.barIndex.get(t.entity.id);
      if (slot) {
        // A struck hazard stops drawing entirely rather than dimming in
        // place: it is spent, and leaving it lit reads as a threat that is
        // still live.
        if (inRange && t.state !== 'hit') {
          bars += this.writeBars(t, bars);
        }
        continue;
      }

      // ---- gifts -------------------------------------------------------
      const object = this.objects.get(t.entity.id);
      if (!object) continue;

      if (t.entity.kind === 'gift' && t.state === 'collected') {
        // Absorbed, not popped.
        //
        // This used to scale to 1.9x and rise 0.8 units toward the camera.
        // Collection happens at Matthew's position, which is close to the
        // lens, so a swelling gift filled the frame at exactly the moment the
        // player needed to see the next hazard. It now shrinks away and lets
        // the glow do the celebrating — the same vocabulary level 3 uses.
        //
        // Feedback lives on the gift so Matthew's run cycle is never
        // interrupted by a collection.
        const age = this.collected.get(t.entity.id) ?? 0;
        if (age >= POP_SECONDS) {
          object.visible = false;
          continue;
        }
        this.collected.set(t.entity.id, age + step);
        const t01 = age / POP_SECONDS;
        const base = this.baseScale.get(t.entity.id) ?? 1;
        object.visible = true;
        // Ease out so it leaves quickly and finishes gently.
        object.scale.setScalar(base * (1 - t01 * t01));
        object.position.y = 0.42;
        continue;
      }

      object.visible = inRange;
      if (!inRange) continue;
      object.position.z = -ahead;

      if (t.entity.kind === 'gift') {
        object.rotation.y = this.spin * 1.4;
        object.position.y = 0.42 + Math.sin(this.spin * 2.4) * 0.06;
        if (t.state === 'pending') {
          this.anchors.push(
            this.scratch.set(object.position.x, object.position.y + 0.1, -ahead).clone(),
          );
        }
      }

      if (t.state === 'hit') dim(object);
    }

    this.lasers.count = bars;
    this.lasers.instanceMatrix.needsUpdate = true;
    this.emitters.count = this.emitterCount;
    this.emitters.instanceMatrix.needsUpdate = true;
    this.driveSpotlights(spotlights, step);
    this.giftGlow.setAnchors(this.anchors);
    this.giftGlow.update(step);
  }

  /** Write one hazard's bars into the shared batch. Returns how many. */
  private writeBars(t: TrackedEntity, offset: number): number {
    const x = this.laneX(t.entity.lane);
    const z = -t.relativeZ;
    // Shallow flicker, enough to read as live without strobing.
    const flicker = Math.sin(this.spin * 7) * 0.012;

    if (t.entity.style === 'fence') {
      const spread = this.level.laneWidth * 0.3;
      for (let i = 0; i < FENCE_PILLARS; i++) {
        this.matrix.makeRotationZ(Math.PI / 2);
        this.matrix.setPosition(x + (i - 1) * spread, PILLAR_HEIGHT / 2 + flicker, z);
        this.lasers.setMatrixAt(offset + i, this.matrix);
      }
      return FENCE_PILLARS;
    }

    for (let i = 0; i < LASER_BARS; i++) {
      this.matrix.identity();
      this.matrix.setPosition(x, (BAR_HEIGHTS[i] ?? 0.5) + flicker, z);
      this.lasers.setMatrixAt(offset + i, this.matrix);
    }

    // Housings are a separate matte batch, written against their own cursor.
    const beamWidth = this.level.laneWidth * 0.94;
    for (let i = 0; i < LASER_POSTS; i++) {
      const side = i === 0 ? -1 : 1;
      this.matrix.identity();
      this.matrix.setPosition(x + side * beamWidth * 0.5, POST_TOP / 2, z);
      this.emitters.setMatrixAt(this.emitterCount++, this.matrix);
    }
    return LASER_BARS;
  }

  /**
   * Assign the pooled cones to the nearest spotlights and advance them.
   *
   * Sweep, then lock, then strike — all driven purely by distance, so the
   * sequence replays identically and nothing the player does can influence
   * which lane is chosen. The lane itself is authored; the doc forbids
   * picking one from late input (§7).
   */
  private driveSpotlights(upcoming: readonly TrackedEntity[], step: number): void {
    const nearest = [...upcoming].sort((a, b) => a.relativeZ - b.relativeZ).slice(0, SPOTLIGHT_POOL);

    for (const [i, slot] of this.lights.entries()) {
      const target = nearest[i];
      if (!target) {
        slot.light.group.visible = false;
        slot.id = null;
        continue;
      }

      const ahead = target.relativeZ;
      const lockLead = target.entity.lockLead ?? DEFAULT_LOCK_LEAD;

      slot.light.group.visible = true;
      slot.light.group.position.z = -ahead;

      if (slot.id !== target.entity.id) {
        slot.id = target.entity.id;
        slot.light.sweep();
      }

      if (ahead <= STRIKE_LEAD) {
        if (slot.light.currentState !== 'striking') slot.light.strike();
      } else if (ahead <= lockLead && slot.light.currentState === 'sweeping') {
        slot.light.lockTo(target.entity.lane);
      }

      slot.light.update(step);
      // Fade the cone out as it reaches the player. At full strength from a
      // few units away it fills the screen in flat magenta and the player
      // cannot see the lane they are meant to be moving to.
      slot.light.setProximityFade(Math.min(1, Math.max(0, (ahead - 1) / 9)));

    }
  }

  /**
   * The object drawn for an entity, or null when it is batched.
   *
   * Children are no longer one-to-one with entities — lasers and fences
   * share an InstancedMesh and spotlights come from a pool — so positional
   * lookups by index are wrong. This is the supported way to find one.
   */
  objectFor(id: string): Object3D | null {
    return this.objects.get(id) ?? null;
  }

  dispose(): void {
    for (const object of this.objects.values()) object.removeFromParent();
    this.objects.clear();
    for (const { light } of this.lights) light.dispose();
    this.lights.length = 0;
    this.collected.clear();
    this.baseScale.clear();
    this.emitters.geometry.dispose();
    (this.emitters.material as MeshStandardMaterial).dispose();
    this.emitters.removeFromParent();
    this.lasers.geometry.dispose();
    (this.lasers.material as MeshBasicMaterial).dispose();
    this.lasers.removeFromParent();
    this.giftGlow.dispose();
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

