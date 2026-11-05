/**
 * The grapple line: a tube, and the throw that puts it there.
 *
 * What this replaces was a two-vertex `Line`, switched on whenever
 * `Snapshot.anchor` existed and off when it did not. With a 3.2-second swing
 * cycle that is a hard pop roughly every three seconds, and nothing in
 * between that says he threw anything.
 *
 * ---- why a tube rather than the gallery's GrappleCable --------------------
 *
 * `custom.ts` already has a finished cable — tapered segments, parabolic
 * sag, hook on the end — but it is six separate meshes, so six draw calls
 * and six straight chunks. The measured frame is 29 draws of a 60 budget and
 * the obstacles are still to come, so the line gets ONE: a single
 * BufferGeometry whose vertices are rewritten each frame. That also buys a
 * real curve instead of six facets, which matters more here than it did in
 * a gallery tile.
 *
 * ---- render only ----------------------------------------------------------
 *
 * Nothing in this file is read by `motion.ts`, the course or the colliders.
 * The anchor is calculated by the simulation and the rope is drawn to it
 * afterwards, exactly as before. A rope that could push the player would put
 * presentation inside the thing the route solver has to predict.
 */
import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial, Vector3,
} from 'three';

// ---- tuning --------------------------------------------------------------
// One block, module scope, so a change is a hot reload rather than a build.

/** Tube radius at the muzzle, in world units. */
const ROPE_RADIUS = 0.038;
/** Radius multiplier at the hook end, so it reads as a line and not a rod. */
const ROPE_TAPER = 0.75;
/** Radial segments. Eight gives a smooth round silhouette. */
const ROPE_SIDES = 8;
/** Segments along the length. */
const ROPE_SEGMENTS = 14;

/** How long the hook takes to reach the anchor, in seconds. */
const FIRE_TIME = 0.04;
/** How long the line takes to snap back once the anchor is released. */
const RELEASE_TIME = 0.06;

/**
 * Dynamic cable tension parameters:
 * - SAG_SLACK: Initial flexible catenary droop at apex float before full body weight catches.
 * - SAG_TAUT: Laser-taut droop under high-speed pull tension.
 * - SNAP_START & SNAP_DURATION: Window where cable catches mass and snaps laser-taut.
 */
const SAG_SLACK = 0.030;
const SAG_TAUT = 0.0018;
const SNAP_START = 0.07;
const SNAP_DURATION = 0.09;

/**
 * There is deliberately no hook model on the far end.
 *
 * `candycane_small` was tried there and dropped: at the anchor's 26-to-46
 * units it is a handful of pixels sitting underneath the gold anchor
 * marker, so it added a draw call and a second object in the same place
 * without reading as anything. The line ending cleanly at the marker says
 * what it needs to.
 */

export type RopePhase = 'idle' | 'fire' | 'attached' | 'release';

export class SkylineRope {
  readonly object = new Group();

  private readonly geometry = new BufferGeometry();
  private readonly position: BufferAttribute;
  private readonly normal: BufferAttribute;
  private readonly material: MeshBasicMaterial;
  private readonly mesh: Mesh;

  private phase: RopePhase = 'idle';
  private elapsed = 0;
  private attachedElapsed = 0;
  /** Where the far end of the line currently is, which is not always the anchor. */
  private readonly tip = new Vector3();
  /** The last anchor seen, so a release has somewhere to retract from. */
  private readonly held = new Vector3();

  private readonly a = new Vector3();
  private readonly tangent = new Vector3();
  private readonly side = new Vector3();
  private readonly up = new Vector3();
  private readonly radial = new Vector3();

  constructor() {
    const rings = ROPE_SEGMENTS + 1;
    const count = rings * ROPE_SIDES;
    this.position = new BufferAttribute(new Float32Array(count * 3), 3);
    this.normal = new BufferAttribute(new Float32Array(count * 3), 3);
    this.position.setUsage(35048 /* DynamicDrawUsage */);
    this.normal.setUsage(35048);
    this.geometry.setAttribute('position', this.position);
    this.geometry.setAttribute('normal', this.normal);

    // The index never changes, so it is built once here rather than per frame.
    const index: number[] = [];
    for (let i = 0; i < ROPE_SEGMENTS; i++) {
      for (let j = 0; j < ROPE_SIDES; j++) {
        const k = (j + 1) % ROPE_SIDES;
        const a = i * ROPE_SIDES + j, b = i * ROPE_SIDES + k;
        const c = (i + 1) * ROPE_SIDES + k, d = (i + 1) * ROPE_SIDES + j;
        index.push(a, b, c, a, c, d);
      }
    }
    this.geometry.setIndex(index);

    /**
     * Unlit, like every other piece of signal in this scene.
     *
     * The first version used a MeshStandardMaterial, which is the obvious
     * choice for something meant to look like metal and the wrong one here:
     * the street is lit for night, so a lit gold tube renders nearly black
     * and the line was harder to see than the flat pale `Line` it replaced.
     * `skyline-scene.ts` already settles this — its gold trim, gift and
     * hazard markers are all MeshBasicMaterial with fog off, because a cue
     * that dims with the lighting or fades at 27 units has stopped being a
     * cue.
     */
    this.material = new MeshBasicMaterial({ color: 0xffea88, fog: false });
    this.mesh = new Mesh(this.geometry, this.material);
    // The tube is rebuilt in world space each frame, so a bounding sphere
    // computed once would cull it the moment the player moved.
    this.mesh.frustumCulled = false;
    this.object.add(this.mesh);
    this.object.visible = false;
  }

  get currentPhase(): RopePhase {
    return this.phase;
  }

  /**
   * `from` is the muzzle, `to` the anchor, both already in the scene's
   * player-relative frame. `to` is null the moment the player lets go.
   */
  update(from: Vector3, to: Vector3 | null, dt: number): void {
    // A tab that was backgrounded hands back a large step. Clamping keeps
    // the throw from completing in the frame the player returns.
    const step = Math.min(dt, 1 / 30);
    this.advance(to, step);

    if (this.phase === 'idle') {
      this.object.visible = false;
      return;
    }
    this.object.visible = true;

    if (this.phase === 'fire') {
      // Ease out: the hook leaves fast and arrives gently, which reads as
      // thrown rather than extruded.
      const u = Math.min(1, this.elapsed / FIRE_TIME);
      this.tip.copy(from).lerp(this.held, 1 - (1 - u) * (1 - u));
    } else if (this.phase === 'attached') {
      this.attachedElapsed += step;
      this.tip.copy(this.held);
    } else {
      // Release: the far end comes home rather than the whole line vanishing.
      const u = Math.min(1, this.elapsed / RELEASE_TIME);
      this.tip.copy(this.held).lerp(from, u * u);
    }

    this.build(from, this.tip);
  }

  /** Phase transitions, driven purely by the anchor appearing and clearing. */
  private advance(to: Vector3 | null, step: number): void {
    this.elapsed += step;
    if (to) {
      const moved = this.phase === 'attached' && this.held.distanceToSquared(to) > 0.5;
      this.held.copy(to);
      if (this.phase === 'idle' || this.phase === 'release' || moved) {
        this.phase = 'fire';
        this.elapsed = 0;
      } else if (this.phase === 'fire' && this.elapsed >= FIRE_TIME) {
        this.phase = 'attached';
        this.attachedElapsed = 0;
      }
      return;
    }
    if (this.phase === 'fire' || this.phase === 'attached') {
      this.phase = 'release';
      this.elapsed = 0;
    } else if (this.phase === 'release' && this.elapsed >= RELEASE_TIME) {
      this.phase = 'idle';
    }
  }

  /** Write one tube between two points, plus the hook on the far end. */
  private build(from: Vector3, to: Vector3): void {
    const span = from.distanceTo(to);
    if (span < 1e-4) {
      this.object.visible = false;
      return;
    }

    const isGroundPull = to.y < from.y + 0.5;
    let sag = SAG_TAUT;
    if (!isGroundPull && this.phase === 'attached') {
      if (this.attachedElapsed < SNAP_START) {
        sag = SAG_SLACK;
      } else if (this.attachedElapsed < SNAP_START + SNAP_DURATION) {
        const t = (this.attachedElapsed - SNAP_START) / SNAP_DURATION;
        const ease = 1 - Math.pow(1 - t, 3);
        sag = SAG_SLACK + (SAG_TAUT - SAG_SLACK) * ease;
        // Layer in 2 cycles of high-frequency tension shudder
        const shudder = 0.005 * Math.exp(-t * 3.5) * Math.sin(t * Math.PI * 4);
        sag += shudder;
      } else {
        const postT = this.attachedElapsed - (SNAP_START + SNAP_DURATION);
        if (postT < 0.25) {
          const microShudder = 0.001 * Math.exp(-postT * 6) * Math.sin(postT * Math.PI * 16);
          sag = SAG_TAUT + microShudder;
        }
      }
    }

    // Material tension pulse on snap
    if (!isGroundPull && this.phase === 'attached' && this.attachedElapsed >= SNAP_START && this.attachedElapsed < SNAP_START + SNAP_DURATION + 0.10) {
      const flashT = Math.min(1, (this.attachedElapsed - SNAP_START) / (SNAP_DURATION + 0.10));
      const flash = Math.sin(flashT * Math.PI);
      const g = (234 + flash * 20) / 255;
      const b = (136 + flash * 90) / 255;
      this.material.color.setRGB(1.0, g, b);
    } else {
      this.material.color.setHex(0xffea88);
    }

    const droop = sag * span;
    this.tangent.copy(to).sub(from).normalize();

    // A fixed reference up degenerates when the line points at it, which a
    // near-vertical rope does; swap axes rather than produce a NaN frame.
    this.up.set(0, 1, 0);
    if (Math.abs(this.tangent.y) > 0.9) this.up.set(0, 0, 1);
    this.side.copy(this.tangent).cross(this.up).normalize();
    this.up.copy(this.side).cross(this.tangent).normalize();

    const pos = this.position.array as Float32Array;
    const nor = this.normal.array as Float32Array;

    for (let i = 0; i <= ROPE_SEGMENTS; i++) {
      const u = i / ROPE_SEGMENTS;
      this.a.copy(from).lerp(to, u);
      this.a.y -= droop * 4 * u * (1 - u);
      const radius = ROPE_RADIUS * (1 + (ROPE_TAPER - 1) * u);

      for (let j = 0; j < ROPE_SIDES; j++) {
        const th = (j / ROPE_SIDES) * Math.PI * 2;
        this.radial.copy(this.side).multiplyScalar(Math.cos(th))
          .addScaledVector(this.up, Math.sin(th));
        const k = (i * ROPE_SIDES + j) * 3;
        pos[k] = this.a.x + this.radial.x * radius;
        pos[k + 1] = this.a.y + this.radial.y * radius;
        pos[k + 2] = this.a.z + this.radial.z * radius;
        nor[k] = this.radial.x; nor[k + 1] = this.radial.y; nor[k + 2] = this.radial.z;
      }
    }
    this.position.needsUpdate = true;
    this.normal.needsUpdate = true;
  }

  reset(): void {
    this.phase = 'idle';
    this.elapsed = 0;
    this.attachedElapsed = 0;
    this.material.color.setHex(0xffea88);
    this.object.visible = false;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
