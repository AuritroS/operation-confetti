/**
 * Custom procedural assets (design doc §10).
 *
 * The things no pack supplies. All built from primitives in code rather than
 * modelled, which keeps them editable, costs no download, and needs no DCC
 * tool. Each is shaped from the supplied reference art — `assets/matthew.png`
 * and `assets/aurora.png` — not invented.
 *
 * Triangle budgets here are deliberately small: the whole custom set should
 * cost less than a single character.
 */
import {
  AdditiveBlending,
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Path,
  Quaternion,
  Shape,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { PALETTE, ROLE } from './palette';
import { Sparkle } from './effects';

/** Matte surface in a palette colour. */
function matte(color: number, roughness = 0.75): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, roughness, metalness: 0.05 });
}

/** Self-lit surface, for anything that should glow rather than be lit. */
function glow(color: number, opacity = 1): MeshBasicMaterial {
  return new MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
}

// ------------------------------------------------------------- the cake --

/**
 * Aurora is holding a red velvet cake with white frosting and lit candles in
 * the reference, so that is what this is. The entire plot object.
 */
export function buildCake(): Group {
  const cake = new Group();

  const sponge = matte(0x8e1f2d);
  const frosting = matte(0xf4ece2, 0.6);

  // Two tiers, each a sponge layer capped with frosting.
  const tiers = [
    { r: 0.5, h: 0.26, y: 0.13 },
    { r: 0.34, h: 0.22, y: 0.43 },
  ];
  for (const t of tiers) {
    const layer = new Mesh(new CylinderGeometry(t.r, t.r, t.h, 20), sponge);
    layer.position.y = t.y;
    cake.add(layer);

    const ice = new Mesh(new CylinderGeometry(t.r * 1.04, t.r * 1.04, 0.07, 20), frosting);
    ice.position.y = t.y + t.h / 2;
    cake.add(ice);
  }

  // Candles: a ring of thin cylinders with a glowing tip each.
  const wax = matte(PALETTE.gold, 0.5);
  const flameMat = glow(0xffd98a);
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const x = Math.cos(angle) * 0.19;
    const z = Math.sin(angle) * 0.19;

    const candle = new Mesh(new CylinderGeometry(0.022, 0.022, 0.2, 6), wax);
    candle.position.set(x, 0.68, z);
    cake.add(candle);

    const flame = new Mesh(new SphereGeometry(0.038, 8, 6), flameMat);
    flame.position.set(x, 0.81, z);
    flame.scale.y = 1.6;
    cake.add(flame);
  }

  return cake;
}

// ---------------------------------------------------------- the crown ----

/**
 * Aurora wears a gold spiked crown in the reference, not the Mage hat. The
 * hat mesh is hidden at runtime and this takes its place on the head node.
 */
export function buildCrown(radius = 0.2): Group {
  const crown = new Group();
  const gold = matte(PALETTE.gold, 0.35);

  const band = new Mesh(new CylinderGeometry(radius, radius, 0.07, 16, 1, true), gold);
  crown.add(band);

  // Alternating tall and short points, which is what reads as a crown rather
  // than a cog from a distance.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const tall = i % 2 === 0;
    const spike = new Mesh(new CylinderGeometry(0.005, 0.03, tall ? 0.16 : 0.1, 4), gold);
    spike.position.set(
      Math.cos(angle) * radius,
      0.035 + (tall ? 0.08 : 0.05),
      Math.sin(angle) * radius,
    );
    crown.add(spike);

    if (tall) {
      const jewel = new Mesh(new SphereGeometry(0.022, 6, 5), glow(PALETTE.magenta));
      jewel.position.set(Math.cos(angle) * radius, 0.135, Math.sin(angle) * radius);
      crown.add(jewel);
    }
  }

  return crown;
}

// -------------------------------------------------------- the CN Tower ----

/**
 * Appears in both reference images and is what makes the skyline Toronto
 * rather than a generic city. Built tall and thin so it reads in silhouette at
 * any distance; `height` is in world units.
 */
export function buildCnTower(height = 14): Group {
  const tower = new Group();
  const concrete = matte(0x9aa6b8, 0.85);
  const lit = glow(PALETTE.cyan, 0.9);

  // Tapered shaft.
  const shaft = new Mesh(new CylinderGeometry(height * 0.012, height * 0.035, height * 0.72, 10), concrete);
  shaft.position.y = height * 0.36;
  tower.add(shaft);

  // Observation pod: the detail that identifies it.
  const pod = new Mesh(new CylinderGeometry(height * 0.055, height * 0.07, height * 0.05, 12), concrete);
  pod.position.y = height * 0.66;
  tower.add(pod);

  const podRing = new Mesh(new TorusGeometry(height * 0.062, height * 0.008, 6, 14), lit);
  podRing.rotation.x = Math.PI / 2;
  podRing.position.y = height * 0.645;
  tower.add(podRing);

  const upper = new Mesh(new CylinderGeometry(height * 0.022, height * 0.03, height * 0.1, 10), concrete);
  upper.position.y = height * 0.74;
  tower.add(upper);

  // Antenna spire, lit rather than concrete.
  //
  // `assets/aurora.png` shows the tower at night as a pale mass with a glowing
  // magenta needle, and the tower is a motif in all three levels — level 1
  // sees it on the skyline, level 2 runs down a street toward it, level 3
  // stands on it. A grey needle at distance is simply invisible, so the one
  // part that has to carry at any range is the part that emits.
  const spire = new Mesh(new CylinderGeometry(0.004, height * 0.012, height * 0.24, 6), glow(PALETTE.magenta));
  spire.position.y = height * 0.89;
  tower.add(spire);

  const spireGlow = new Mesh(
    new CylinderGeometry(height * 0.012, height * 0.03, height * 0.24, 6),
    new MeshBasicMaterial({
      color: 0xff5ae8, transparent: true, opacity: 0.26,
      depthWrite: false, blending: AdditiveBlending,
    }),
  );
  spireGlow.position.y = height * 0.89;
  tower.add(spireGlow);

  const beacon = new Mesh(new SphereGeometry(height * 0.012, 6, 5), glow(PALETTE.magenta));
  beacon.position.y = height * 1.01;
  tower.add(beacon);

  return tower;
}

// ------------------------------------------------------ grapple gadget ----

/**
 * The gold cable in Matthew's reference, arcing from a wrist gadget.
 *
 * A chain of straight segments bowed along a parabola, which reads as one
 * curved cable while staying cheap. Scratch vectors mean a swing allocates
 * nothing per frame.
 */
export class GrappleCable {
  readonly group = new Group();

  private readonly segments: Mesh[] = [];
  private readonly hook: Group;

  private static readonly _from = new Vector3();
  private static readonly _to = new Vector3();
  private static readonly _a = new Vector3();
  private static readonly _b = new Vector3();
  private static readonly _up = new Vector3(0, 1, 0);
  private static readonly _quat = new Quaternion();

  constructor(segmentCount = 6, thickness = 0.018) {
    const material = matte(PALETTE.gold, 0.4);
    for (let i = 0; i < segmentCount; i++) {
      // Taper toward the hook so it reads as cable rather than rod.
      const t = 1 - (i / segmentCount) * 0.35;
      const geometry = new CylinderGeometry(thickness * t, thickness * t, 1, 5, 1, true);
      geometry.translate(0, 0.5, 0);
      const seg = new Mesh(geometry, material);
      this.segments.push(seg);
      this.group.add(seg);
    }

    this.hook = buildGrappleHook(thickness);
    this.group.add(this.hook);
    this.group.visible = false;
  }

  /**
   * Point the cable from `from` to `to`, both in world space.
   *
   * Orientation comes from a quaternion built off the direction vector. The
   * first version used `lookAt` then `rotateX(+90deg)`, which aims -Z at the
   * target and then maps +Y onto +Z — pointing the cable directly AWAY from
   * the anchor. That sign error is invisible in code and obvious only once
   * rendered, so the direction is explicit now.
   *
   * `sag` bows the cable downward as a fraction of its span; 0 is taut.
   */
  setSpan(from: Object3D, to: Object3D, sag = 0.12): void {
    const start = from.getWorldPosition(GrappleCable._from);
    const end = to.getWorldPosition(GrappleCable._to);
    const span = start.distanceTo(end);
    if (span < 1e-4) {
      this.group.visible = false;
      return;
    }

    const n = this.segments.length;
    const droop = sag * span;

    for (let i = 0; i < n; i++) {
      const seg = this.segments[i];
      if (!seg) continue;

      const t0 = i / n;
      const t1 = (i + 1) / n;
      const p0 = GrappleCable._a.copy(start).lerp(end, t0);
      p0.y -= droop * 4 * t0 * (1 - t0);
      const p1 = GrappleCable._b.copy(start).lerp(end, t1);
      p1.y -= droop * 4 * t1 * (1 - t1);

      seg.position.copy(p0);
      seg.scale.set(1, p0.distanceTo(p1), 1);
      // Rotate the cylinder's +Y axis onto the segment direction.
      GrappleCable._quat.setFromUnitVectors(GrappleCable._up, p1.sub(p0).normalize());
      seg.quaternion.copy(GrappleCable._quat);
    }

    // Seat the hook at the anchor, aligned with the last segment.
    this.hook.position.copy(end);
    this.hook.quaternion.copy(GrappleCable._quat);
    this.group.visible = true;
  }

  hide(): void {
    this.group.visible = false;
  }

  dispose(): void {
    for (const seg of this.segments) seg.geometry.dispose();
    (this.segments[0]?.material as MeshStandardMaterial | undefined)?.dispose();
    this.segments.length = 0;
    this.group.removeFromParent();
  }
}

/**
 * The hook on the end of the cable: a candy cane, which is both a hooked cane
 * — the Sly signature — and birthday-appropriate rather than borrowed. The
 * pack's `candycane_small` is the runtime asset; this is the procedural form.
 */
function buildGrappleHook(thickness: number): Group {
  const hook = new Group();
  const gold = matte(PALETTE.gold, 0.35);
  const r = thickness * 4.5;

  const shank = new Mesh(new CylinderGeometry(thickness * 1.3, thickness * 1.3, r * 1.8, 6), gold);
  shank.position.y = r * 0.9;
  hook.add(shank);

  // Most of a torus makes the crook.
  const crook = new Mesh(new TorusGeometry(r, thickness * 1.3, 6, 14, Math.PI * 1.15), gold);
  crook.rotation.y = Math.PI / 2;
  crook.rotation.z = Math.PI * 0.42;
  hook.add(crook);

  return hook;
}

// ---------------------------------------------------------- magic orb ----

/**
 * The level 2 moving hazard: a magenta orb Aurora throws during the chase.
 *
 * Procedural rather than a prop because it is her magic, so it must be her
 * colour and share the sparkle system. Replaces an earlier lantern pick that
 * read as set dressing rather than a threat.
 */
export class MagicOrb {
  readonly group = new Group();
  private readonly sparkle: Sparkle;
  private readonly core: Mesh;
  private time = 0;

  constructor(radius = 0.26) {
    this.core = new Mesh(new SphereGeometry(radius, 14, 10), glow(ROLE.hazard));
    this.group.add(this.core);

    // A faint larger shell reads as energy rather than a solid ball.
    const shell = new Mesh(new SphereGeometry(radius * 1.5, 14, 10), glow(ROLE.hazard, 0.22));
    this.group.add(shell);

    this.sparkle = new Sparkle({
      count: 12,
      radius: radius * 2.1,
      rise: radius * 2,
      size: 0.13,
      color: ROLE.hazard,
      speed: 1.5,
    });
    this.group.add(this.sparkle.points);
  }

  update(step: number): void {
    this.time += step;
    this.sparkle.update(step);
    // Shallow breathing pulse, matched to the laser so hazards feel related.
    const pulse = 1 + Math.sin(this.time * 6) * 0.08;
    this.core.scale.setScalar(pulse);
  }

  dispose(): void {
    this.sparkle.dispose();
    this.core.geometry.dispose();
    this.group.removeFromParent();
  }
}


// ------------------------------------------------------- mask emblem -----

/**
 * Matthew's gold bandit-mask logo — his title treatment, and a banner in
 * Aurora's image. Reused on the vault door, available for the HUD.
 *
 * An extruded `Shape` with two hole paths, which is the only way to get
 * genuine cut-out eyes and a real mask outline. The first attempt stacked
 * boxes and spheres and read as a gold plank with two dots: the silhouette
 * was a rectangle and the eyes sat on the surface rather than through it.
 *
 * The outline is what carries it — wide, dipped at the brow, with swept-up
 * outer points.
 */
export function buildMaskEmblem(width = 1): Group {
  const emblem = new Group();
  const w = width / 2;
  const h = width * 0.3;

  const outline = new Shape();
  outline.moveTo(-w * 1.18, h * 0.42);
  outline.quadraticCurveTo(-w * 0.72, h * 1.02, -w * 0.3, h * 0.66);
  outline.quadraticCurveTo(0, h * 0.26, w * 0.3, h * 0.66);
  outline.quadraticCurveTo(w * 0.72, h * 1.02, w * 1.18, h * 0.42);
  outline.lineTo(w * 0.92, -h * 0.26);
  outline.quadraticCurveTo(w * 0.52, -h * 1.0, 0, -h * 0.72);
  outline.quadraticCurveTo(-w * 0.52, -h * 1.0, -w * 0.92, -h * 0.26);
  outline.closePath();

  // Angled almond eyes, cut clean through.
  for (const side of [-1, 1]) {
    const eye = new Path();
    const cx = side * w * 0.46;
    const rx = w * 0.23;
    const ry = h * 0.3;
    eye.moveTo(cx - rx, 0);
    eye.quadraticCurveTo(cx - rx * 0.3, ry * 1.3, cx + rx, ry * 0.3);
    eye.quadraticCurveTo(cx + rx * 0.3, -ry * 1.0, cx - rx, 0);
    outline.holes.push(eye);
  }

  const geometry = new ExtrudeGeometry(outline, {
    depth: width * 0.05,
    bevelEnabled: true,
    bevelThickness: width * 0.014,
    bevelSize: width * 0.012,
    bevelSegments: 2,
    curveSegments: 10,
  });
  geometry.center();

  emblem.add(new Mesh(geometry, matte(PALETTE.gold, 0.32)));
  return emblem;
}

// -------------------------------------------------------- vault door -----

/**
 * The level 1 route endpoint, carrying the emblem so the payoff is legible.
 *
 * The emblem is sized against the door rather than fixed, and the dial stands
 * proud of the frame — the first version buried the dial halfway into the wall
 * and put a postage-stamp emblem on a large blank slab.
 */
export function buildVaultDoor(width = 4.8, height = 3.4): Group {
  const vault = new Group();

  const wall = matte(PALETTE.slate, 0.85);
  const steel = matte(PALETTE.steel, 0.5);

  // Surrounding wall, recessed behind the door.
  const frame = new Mesh(new BoxGeometry(width, height, 0.35), wall);
  frame.position.set(0, height / 2, -0.2);
  vault.add(frame);

  // Door face: a disc proud of the wall, so it reads as a vault.
  const radius = Math.min(width, height) * 0.38;
  const door = new Mesh(new CylinderGeometry(radius, radius, 0.3, 32), steel);
  door.rotation.x = Math.PI / 2;
  door.position.set(0, height * 0.5, 0);
  vault.add(door);

  // Rim, a touch wider, to catch the light along the edge.
  const rim = new Mesh(new TorusGeometry(radius * 1.04, 0.07, 8, 36), matte(PALETTE.gold, 0.35));
  rim.position.set(0, height * 0.5, 0.08);
  vault.add(rim);

  // Spokes radiating from the centre, the locking-bolt read.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new Mesh(new BoxGeometry(radius * 0.78, 0.05, 0.06), steel);
    spoke.position.set(
      Math.cos(angle) * radius * 0.48,
      height * 0.5 + Math.sin(angle) * radius * 0.48,
      0.17,
    );
    spoke.rotation.z = angle;
    vault.add(spoke);
  }

  // The emblem sized to the door, centred on it, standing off the face.
  const emblem = buildMaskEmblem(radius * 1.15);
  emblem.position.set(0, height * 0.5, 0.22);
  vault.add(emblem);

  return vault;
}

// ---------------------------------------------------------- confetti -----

/**
 * Gold confetti, as in both reference images.
 *
 * Decorative only — the doc is explicit that confetti is never a physical
 * damage object (§11) — so this is a capped, pooled particle burst with no
 * collision of any kind.
 */
export class Confetti {
  readonly group = new Group();
  private readonly pieces: Mesh[] = [];
  private readonly velocities: Vector3[] = [];
  private readonly spins: Vector3[] = [];
  private life = 0;
  private running = false;

  constructor(count = 40) {
    const colours = [PALETTE.gold, PALETTE.blueLight, PALETTE.magenta, 0xffffff];
    for (let i = 0; i < count; i++) {
      const piece = new Mesh(
        new BoxGeometry(0.07, 0.015, 0.045),
        glow(colours[i % colours.length] ?? PALETTE.gold),
      );
      piece.visible = false;
      this.pieces.push(piece);
      this.velocities.push(new Vector3());
      this.spins.push(new Vector3());
      this.group.add(piece);
    }
  }

  burst(at: Vector3): void {
    this.life = 0;
    this.running = true;
    for (const [i, piece] of this.pieces.entries()) {
      piece.position.copy(at);
      piece.visible = true;
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.4 + Math.random() * 2.2;
      this.velocities[i]?.set(
        Math.cos(angle) * speed * 0.5,
        2 + Math.random() * 2.4,
        Math.sin(angle) * speed * 0.5,
      );
      this.spins[i]?.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
    }
  }

  update(step: number): void {
    if (!this.running) return;
    this.life += step;

    for (const [i, piece] of this.pieces.entries()) {
      if (!piece.visible) continue;
      const v = this.velocities[i];
      const spin = this.spins[i];
      if (!v || !spin) continue;
      v.y -= 7.5 * step;
      piece.position.addScaledVector(v, step);
      piece.rotation.x += spin.x * step;
      piece.rotation.y += spin.y * step;
      piece.rotation.z += spin.z * step;
    }

    if (this.life > 2.6) {
      this.running = false;
      for (const piece of this.pieces) piece.visible = false;
    }
  }

  get isRunning(): boolean {
    return this.running;
  }

  dispose(): void {
    for (const piece of this.pieces) piece.geometry.dispose();
    this.pieces.length = 0;
    this.group.removeFromParent();
  }
}
