/**
 * Procedural effects (design doc §11).
 *
 * The three things no asset pack supplies and the game depends on. These are
 * the real implementations, previewed in the gallery rather than mocked up
 * there, so what gets reviewed is what ships.
 *
 * Budget discipline: one shared point texture, additive blending, no
 * postprocessing, and particle counts capped. Confetti and sparkle are
 * decorative and never participate in collision (§11).
 */
import { ROLE } from './palette';
import {
  AdditiveBlending,
  Vector3,
  BufferGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  type Texture,
} from 'three';

/**
 * Colours come from the project palette, which is derived from the reference
 * art. Blue is Matthew's and means take it; magenta is Aurora's and means
 * avoid it — her magic, her orbs, her guards' searchlights.
 */
export const SPARKLE_BLUE = ROLE.collectible;
export const HAZARD_RED = ROLE.hazard;

let sharedDot: Texture | null = null;

/**
 * Soft radial dot shared by every particle system.
 *
 * Generated rather than shipped: it is 64x64 of pure gradient, so a PNG would
 * cost a request and a decode for something a canvas draws in microseconds.
 */
export function dotTexture(): Texture {
  if (sharedDot) return sharedDot;
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.65)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  sharedDot = new CanvasTexture(canvas);
  return sharedDot;
}

// ------------------------------------------------------------- sparkle ----

export interface SparkleOptions {
  /** Particle count. Kept small; this runs on every collectible on screen. */
  count?: number;
  /** Orbit radius in world units. */
  radius?: number;
  /** Vertical travel of the drift cycle. */
  rise?: number;
  size?: number;
  color?: number;
  speed?: number;
}

/**
 * The Sly thief sparkle: a slow shimmer marking anything interactable.
 *
 * Particles orbit on independent phases and drift vertically, so the cloud
 * never reads as a rigid ring. Additive blending makes it glow against the
 * dark environment without any postprocessing.
 */
export class Sparkle {
  readonly points: Points;
  private readonly phases: number[] = [];
  private readonly radii: number[] = [];
  private readonly heights: number[] = [];
  private readonly opts: Required<SparkleOptions>;
  private time = 0;

  constructor(options: SparkleOptions = {}) {
    this.opts = {
      count: options.count ?? 14,
      radius: options.radius ?? 0.42,
      rise: options.rise ?? 0.5,
      size: options.size ?? 0.16,
      color: options.color ?? SPARKLE_BLUE,
      speed: options.speed ?? 1,
    };

    const positions = new Float32Array(this.opts.count * 3);
    for (let i = 0; i < this.opts.count; i++) {
      this.phases.push(Math.random() * Math.PI * 2);
      this.radii.push(this.opts.radius * (0.55 + Math.random() * 0.45));
      this.heights.push(Math.random());
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(this.opts.color),
        size: this.opts.size,
        map: dotTexture(),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
    this.update(0);
  }

  update(step: number): void {
    this.time += step * this.opts.speed;
    const attr = this.points.geometry.getAttribute('position') as Float32BufferAttribute;

    for (let i = 0; i < this.opts.count; i++) {
      const phase = (this.phases[i] ?? 0) + this.time * 0.9;
      const radius = this.radii[i] ?? this.opts.radius;
      // Each particle rises on its own loop, wrapping back to the bottom.
      const t = ((this.heights[i] ?? 0) + this.time * 0.22) % 1;
      attr.setXYZ(
        i,
        Math.cos(phase) * radius,
        (t - 0.5) * this.opts.rise,
        Math.sin(phase) * radius,
      );
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    this.points.removeFromParent();
  }
}

/**
 * One particle system shared by every sparkling object on screen.
 *
 * A `Sparkle` per collectible would be one draw call per collectible. With
 * four gifts, four lasers and the orb that is nine draws for an effect that
 * is a handful of dots — and the budget is 100 for the whole scene. A single
 * Points with a slot per anchor costs one.
 *
 * Anchors are set each frame; unused slots park their particles far away
 * rather than being rebuilt, so the geometry never resizes.
 */
export class SparkleField {
  readonly points: Points;

  private readonly perAnchor: number;
  private readonly phases: number[] = [];
  private readonly radii: number[] = [];
  private readonly heights: number[] = [];
  private readonly anchors: Vector3[] = [];
  private active = 0;
  private time = 0;

  constructor(
    readonly maxAnchors: number,
    options: SparkleOptions = {},
  ) {
    this.perAnchor = options.count ?? 10;
    const total = maxAnchors * this.perAnchor;

    for (let i = 0; i < total; i++) {
      this.phases.push(Math.random() * Math.PI * 2);
      this.radii.push((options.radius ?? 0.4) * (0.55 + Math.random() * 0.45));
      this.heights.push(Math.random());
    }
    for (let i = 0; i < maxAnchors; i++) this.anchors.push(new Vector3());

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(total * 3), 3));

    this.points = new Points(
      geometry,
      new PointsMaterial({
        color: new Color(options.color ?? SPARKLE_BLUE),
        size: options.size ?? 0.15,
        map: dotTexture(),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    );
    this.points.frustumCulled = false;
  }

  /** Replace the active anchor set. Extra anchors beyond capacity are dropped. */
  setAnchors(positions: readonly Vector3[]): void {
    this.active = Math.min(positions.length, this.maxAnchors);
    for (let i = 0; i < this.active; i++) {
      const p = positions[i];
      if (p) this.anchors[i]?.copy(p);
    }
  }

  update(step: number): void {
    this.time += step;
    const attr = this.points.geometry.getAttribute('position') as Float32BufferAttribute;

    for (let a = 0; a < this.maxAnchors; a++) {
      const anchor = this.anchors[a];
      const live = a < this.active && anchor;
      for (let k = 0; k < this.perAnchor; k++) {
        const i = a * this.perAnchor + k;
        if (!live) {
          // Park, rather than resize the buffer every time a gift is taken.
          attr.setXYZ(i, 0, -9999, 0);
          continue;
        }
        const phase = (this.phases[i] ?? 0) + this.time * 0.9;
        const radius = this.radii[i] ?? 0.4;
        const t = ((this.heights[i] ?? 0) + this.time * 0.22) % 1;
        attr.setXYZ(
          i,
          anchor.x + Math.cos(phase) * radius,
          anchor.y + (t - 0.5) * 0.5,
          anchor.z + Math.sin(phase) * radius,
        );
      }
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.points.geometry.dispose();
    (this.points.material as PointsMaterial).dispose();
    this.points.removeFromParent();
  }
}

// ------------------------------------------------------- laser barrier ----

export interface LaserOptions {
  /** Span across the route, normally one lane width. */
  width?: number;
  height?: number;
  color?: number;
}

/**
 * Hazard barrier: a glowing beam across one lane.
 *
 * Chosen over a prop because a mesh at 25 units is an unreadable blob, whereas
 * a hard-edged emissive bar states which lane is blocked at any distance. Two
 * crossed quads keep it visible from the shallow gameplay camera angle without
 * a shader.
 */
export class LaserBarrier {
  readonly group = new Group();
  private readonly material: MeshBasicMaterial;
  private readonly glow: Sparkle;
  private time = 0;

  constructor(options: LaserOptions = {}) {
    const width = options.width ?? 1.5;
    const height = options.height ?? 0.09;

    this.material = new MeshBasicMaterial({
      color: new Color(options.color ?? HAZARD_RED),
      transparent: true,
      opacity: 0.92,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });

    // A flat quad vanishes when viewed edge-on, so pair a horizontal and a
    // vertical one: the beam stays solid from any gameplay camera angle.
    for (const rotate of [false, true]) {
      const plane = new Mesh(flatQuad(width, height), this.material);
      if (rotate) plane.rotation.x = Math.PI / 2;
      plane.position.y = 0.55;
      this.group.add(plane);
    }

    // Embers along the beam sell it as energy rather than a painted stripe.
    this.glow = new Sparkle({
      count: 10,
      radius: width * 0.42,
      rise: 0.22,
      size: 0.11,
      color: options.color ?? HAZARD_RED,
      speed: 1.6,
    });
    this.glow.points.position.y = 0.55;
    this.group.add(this.glow.points);
  }

  update(step: number): void {
    this.time += step;
    // Shallow pulse: enough to read as live, not enough to flicker-distract.
    this.material.opacity = 0.78 + Math.sin(this.time * 7) * 0.14;
    this.glow.update(step);
  }

  dispose(): void {
    this.material.dispose();
    this.glow.dispose();
    for (const child of [...this.group.children]) {
      (child as Mesh).geometry?.dispose();
    }
    this.group.removeFromParent();
  }
}

function flatQuad(width: number, height: number): BufferGeometry {
  const g = new BufferGeometry();
  const w = width / 2;
  const h = height / 2;
  g.setAttribute(
    'position',
    new Float32BufferAttribute([-w, -h, 0, w, -h, 0, w, h, 0, -w, -h, 0, w, h, 0, -w, h, 0], 3),
  );
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}

// --------------------------------------------------------- searchlight ----

export type SearchlightState = 'sweeping' | 'locked' | 'striking';

/**
 * Guard telegraph: a cone that sweeps, then commits to a lane before striking.
 *
 * The commit is the point. The doc forbids targeting a lane on hidden
 * last-millisecond input (§7), so the lock happens first and visibly, and the
 * strike follows a fixed delay later. `lockedLane` is what gameplay reads.
 */
export class Searchlight {
  readonly group = new Group();
  private readonly cone: Mesh;
  private readonly material: MeshBasicMaterial;
  private readonly pool: Mesh;
  private readonly poolMaterial: MeshBasicMaterial;

  private state: SearchlightState = 'sweeping';
  private time = 0;
  private lane = 0;

  constructor(
    private readonly laneCount = 3,
    private readonly laneWidth = 1.6,
    height = 5,
  ) {
    this.material = new MeshBasicMaterial({
      color: new Color(ROLE.hazard),
      transparent: true,
      opacity: 0.17,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });

    // Open-ended so the cone reads as a light shaft, not a solid object.
    this.cone = new Mesh(new ConeGeometry(laneWidth * 0.46, height, 20, 1, true), this.material);
    this.cone.position.y = height / 2;
    this.group.add(this.cone);

    this.poolMaterial = new MeshBasicMaterial({
      color: new Color(ROLE.hazard),
      transparent: true,
      opacity: 0.3,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.pool = new Mesh(flatQuad(laneWidth * 0.92, laneWidth * 0.92), this.poolMaterial);
    this.pool.rotation.x = -Math.PI / 2;
    this.pool.position.y = 0.02;
    this.group.add(this.pool);
  }

  /** The lane gameplay should treat as dangerous, or null while sweeping. */
  get lockedLane(): number | null {
    return this.state === 'sweeping' ? null : this.lane;
  }

  get currentState(): SearchlightState {
    return this.state;
  }

  /** Commit to a lane. Must happen before the strike, and visibly. */
  lockTo(lane: number): void {
    this.lane = Math.max(0, Math.min(this.laneCount - 1, lane));
    this.state = 'locked';
    this.time = 0;
  }

  strike(): void {
    this.state = 'striking';
    this.time = 0;
  }

  sweep(): void {
    this.state = 'sweeping';
    this.time = 0;
  }

  private laneX(lane: number): number {
    return (lane - (this.laneCount - 1) / 2) * this.laneWidth;
  }

  update(step: number): void {
    this.time += step;

    if (this.state === 'sweeping') {
      // Drift across the full lane span so the threat is legible before it
      // settles anywhere.
      const span = ((this.laneCount - 1) / 2) * this.laneWidth;
      this.group.position.x = Math.sin(this.time * 1.1) * span;
      this.material.opacity = 0.15;
      this.poolMaterial.opacity = 0.26;
      return;
    }

    // Snap to the committed lane and brighten, so the lock is unmistakable.
    const target = this.laneX(this.lane);
    this.group.position.x += (target - this.group.position.x) * Math.min(1, step * 14);

    if (this.state === 'locked') {
      const pulse = 0.5 + Math.sin(this.time * 16) * 0.5;
      this.material.opacity = 0.2 + pulse * 0.16;
      this.poolMaterial.opacity = 0.34 + pulse * 0.3;
    } else {
      this.material.opacity = 0.52;
      this.poolMaterial.opacity = 0.85;
    }
  }

  dispose(): void {
    this.cone.geometry.dispose();
    this.material.dispose();
    this.pool.geometry.dispose();
    this.poolMaterial.dispose();
    this.group.removeFromParent();
  }
}
