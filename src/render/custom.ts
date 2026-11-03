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
  BoxGeometry,
  CylinderGeometry,
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

  // Antenna spire.
  const spire = new Mesh(new CylinderGeometry(0.004, height * 0.012, height * 0.24, 6), concrete);
  spire.position.y = height * 0.89;
  tower.add(spire);

  const beacon = new Mesh(new SphereGeometry(height * 0.012, 6, 5), glow(PALETTE.magenta));
  beacon.position.y = height * 1.01;
  tower.add(beacon);

  return tower;
}

// ------------------------------------------------------ grapple gadget ----

/**
 * The gold cable in Matthew's reference arcs from a wrist gadget.
 *
 * The cable is one cylinder restretched each frame rather than rebuilt, so
 * swinging costs no allocation. `setSpan` points it from the gadget to the
 * anchor; the geometry is a unit-length cylinder scaled along Y.
 */
export class GrappleCable {
  readonly mesh: Mesh;

  // Scratch vectors, so setSpan allocates nothing per frame.
  private static readonly _a = new Vector3();
  private static readonly _b = new Vector3();

  constructor(thickness = 0.022) {
    const geometry = new CylinderGeometry(thickness, thickness, 1, 6, 1, true);
    // Move the origin to one end so scaling stretches toward the anchor.
    geometry.translate(0, 0.5, 0);
    this.mesh = new Mesh(geometry, matte(PALETTE.gold, 0.4));
    this.mesh.visible = false;
  }

  /** Point the cable from `from` to `to`, both in world space. */
  setSpan(from: Object3D, to: Object3D): void {
    const start = from.getWorldPosition(GrappleCable._a);
    const end = to.getWorldPosition(GrappleCable._b);
    this.mesh.position.copy(start);
    this.mesh.scale.set(1, start.distanceTo(end), 1);
    this.mesh.lookAt(end);
    // lookAt aims -Z; the cylinder runs along +Y, so rotate into place.
    this.mesh.rotateX(Math.PI / 2);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
    this.mesh.removeFromParent();
  }
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
 * Matthew's gold bandit-mask logo, which appears as the title treatment in his
 * reference and on a banner in Aurora's. Reused on the vault door, and
 * available for the HUD and loading screen.
 *
 * Built as two eye holes cut visually into a bar, rather than true CSG, which
 * keeps it to a handful of triangles.
 */
export function buildMaskEmblem(width = 1): Group {
  const emblem = new Group();
  const gold = matte(PALETTE.gold, 0.35);
  const h = width * 0.34;

  const bar = new Mesh(new BoxGeometry(width, h, width * 0.06), gold);
  emblem.add(bar);

  // Swept points at each outer edge give it the mask silhouette.
  for (const side of [-1, 1]) {
    const point = new Mesh(new CylinderGeometry(0.001, h * 0.5, width * 0.26, 3), gold);
    point.rotation.z = side * -Math.PI / 2;
    point.position.x = side * (width * 0.5 + width * 0.11);
    emblem.add(point);
  }

  // Eye holes punched with the background colour, so the shape reads at size.
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(h * 0.26, 10, 8), matte(PALETTE.ink, 1));
    eye.scale.set(1.5, 1, 0.6);
    eye.position.set(side * width * 0.21, 0, width * 0.035);
    emblem.add(eye);
  }

  return emblem;
}

// -------------------------------------------------------- vault door -----

/** The level 1 route endpoint. Carries the emblem so the payoff is legible. */
export function buildVaultDoor(width = 4.8, height = 3.4): Group {
  const vault = new Group();

  const frame = new Mesh(new BoxGeometry(width, height, 0.4), matte(0x2a3354, 0.8));
  frame.position.y = height / 2;
  vault.add(frame);

  const door = new Mesh(new CylinderGeometry(height * 0.36, height * 0.36, 0.28, 24), matte(0x3b4766, 0.6));
  vault.add(door);

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
