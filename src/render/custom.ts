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
  CanvasTexture,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Path,
  PlaneGeometry,
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
  Color,
  ConeGeometry,
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
 *
 * Upgraded with Level 3's high-fidelity architecture:
 * - Multi-stage tapered concrete shaft with structural vertical fins/ribs.
 * - Flared observation SkyPod with illuminated cyan window band and cyan bloom additive sleeve.
 * - Tapered antenna spire with neon magenta riser sleeve.
 * - Summit beacon with pulsing additive magenta bloom aura.
 */
export function buildCnTower(height = 14): Group {
  const tower = new Group();
  const concrete = matte(0xc6cde0, 0.74);
  const concreteDark = matte(0x97a0ba, 0.8);
  const neon = new MeshBasicMaterial({ color: 0xcc29c3, fog: false });
  const cyan = new MeshBasicMaterial({ color: 0x53a6f9, fog: false });
  const cyanBloom = new MeshBasicMaterial({
    color: 0x6cc0ff,
    transparent: true,
    opacity: 0.35,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
  const magentaBloom = new MeshBasicMaterial({
    color: 0xff5ae8,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: AdditiveBlending,
    fog: false,
  });
  const beaconMat = new MeshBasicMaterial({ color: 0xff7bf0, fog: false });

  // Tapered shaft.
  const shaft = new Mesh(new CylinderGeometry(height * 0.016, height * 0.032, height * 0.65, 12), concrete);
  shaft.position.y = height * 0.325;
  tower.add(shaft);

  // Structural vertical ribs / buttresses
  for (const offset of [-1, 1]) {
    const rib = new Mesh(new CylinderGeometry(height * 0.003, height * 0.006, height * 0.65, 5), concreteDark);
    rib.position.set(offset * height * 0.022, height * 0.325, -height * 0.008);
    tower.add(rib);
  }

  // Observation SkyPod: flared underside
  const flare = new Mesh(new CylinderGeometry(height * 0.052, height * 0.025, height * 0.028, 16), concreteDark);
  flare.position.y = height * 0.664;
  tower.add(flare);

  // Lit cyan observation deck window band
  const windowBand = new Mesh(new CylinderGeometry(height * 0.052, height * 0.052, height * 0.016, 16), cyan);
  windowBand.position.y = height * 0.686;
  windowBand.userData.isNeon = true;
  tower.add(windowBand);

  // Additive cyan bloom sleeve
  const bloomSleeve = new Mesh(new CylinderGeometry(height * 0.058, height * 0.058, height * 0.032, 16), cyanBloom);
  bloomSleeve.position.y = height * 0.686;
  bloomSleeve.userData.isNeon = true;
  tower.add(bloomSleeve);

  // Saucer cap
  const cap = new Mesh(new CylinderGeometry(height * 0.038, height * 0.052, height * 0.012, 16), concrete);
  cap.position.y = height * 0.700;
  tower.add(cap);

  // Cyan neon collar ring
  const collar = new Mesh(new TorusGeometry(height * 0.054, height * 0.003, 6, 20), cyan);
  collar.rotation.x = Math.PI / 2;
  collar.position.y = height * 0.695;
  collar.userData.isNeon = true;
  tower.add(collar);

  // Upper pod (radome)
  const upperPod = new Mesh(new CylinderGeometry(height * 0.018, height * 0.024, height * 0.035, 10), concreteDark);
  upperPod.position.y = height * 0.725;
  tower.add(upperPod);

  // Antenna equipment mast
  const mast = new Mesh(new CylinderGeometry(height * 0.008, height * 0.014, height * 0.065, 8), concreteDark);
  mast.position.y = height * 0.775;
  tower.add(mast);

  // Antenna spire needle in neon magenta
  const spire = new Mesh(new CylinderGeometry(0.002, height * 0.007, height * 0.18, 6), neon);
  spire.position.y = height * 0.898;
  spire.userData.isNeon = true;
  tower.add(spire);

  // Magenta bloom sleeve
  const spireBloom = new Mesh(new CylinderGeometry(height * 0.006, height * 0.015, height * 0.18, 6), magentaBloom);
  spireBloom.position.y = height * 0.898;
  spireBloom.userData.isNeon = true;
  tower.add(spireBloom);

  // Summit beacon sphere
  const beacon = new Mesh(new SphereGeometry(height * 0.008, 8, 6), beaconMat);
  beacon.position.y = height * 0.995;
  beacon.userData.isNeon = true;
  tower.add(beacon);

  // Beacon glow halo
  const beaconGlow = new Mesh(new SphereGeometry(height * 0.022, 10, 8), magentaBloom);
  beaconGlow.position.y = height * 0.995;
  beaconGlow.userData.isNeon = true;
  tower.add(beaconGlow);

  return tower;
}

// ----------------------------------------------------------- the Moon ----

/**
 * Stylized Toronto night moon, shared across all levels.
 *
 * A soft, painted moon with radial glow and subtle procedural cratering
 * that matches the night silhouette from the reference art.
 */
export function buildMoon(size = 18): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sky = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    sky.addColorStop(0, '#fcf9da');
    sky.addColorStop(0.72, '#d7e9ff');
    sky.addColorStop(0.9, '#91b8ec');
    sky.addColorStop(1, 'rgba(145, 184, 236, 0)');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt(((i * 37) % 97) / 97) * 89;
      ctx.beginPath();
      ctx.fillStyle = i % 3 ? 'rgba(154, 185, 209, 0.13)' : 'rgba(129, 159, 192, 0.17)';
      ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + (i % 9), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = 'srgb';
  const mat = new MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    fog: false,
  });
  const moon = new Mesh(new PlaneGeometry(size, size), mat);
  moon.userData.isNeon = true;
  /*
   * It tests depth, like anything else in the world.
   *
   * An earlier attempt turned the depth test off and set a low render order,
   * reasoning that a moon should be behind everything by construction. That
   * is wrong for this material: `transparent` puts it in three's transparent
   * queue, which runs after the *whole* opaque pass, so the render order only
   * sorted it early among other transparent objects. With no depth test it
   * then painted straight over every building in the scene — the moon ended
   * up in the foreground, which is the opposite of what was intended.
   *
   * Depth sorting does the job honestly. The problem it was meant to solve —
   * level 1's moon wandering into the city's depth band — is fixed at the
   * cause instead: the drift is gone, and `look.ts` places the moon above the
   * skyline rather than across it.
   *
   * `depthWrite` stays off so the moon never occludes anything behind it, and
   * the render order keeps it first among transparent objects, where a thing
   * this distant belongs.
   */
  moon.renderOrder = -9;
  return moon;
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

/**
 * The gift emblem on Aurora's gates.
 *
 * It replaced a bandit mask. The mask was a reference to Matthew's disguise,
 * and he does not wear one — he is the unhooded Rogue with his own hair — so
 * the symbol pointed at nothing. A present is what the gates are actually
 * about: Aurora's line is "your presents are in the vault", and the same
 * shape is the collectible the player chases through all three levels.
 *
 * Built from relief rather than a cut silhouette like the mask. A present
 * reads by its ribbon crossing its lid, and a flat extruded outline loses
 * exactly that.
 *
 * Relief alone was not enough: the mask could be one flat colour because its
 * eyes are cut clean through, and a present has no holes, so a single-tone
 * version came out a gold blob with a bow. The ribbon takes a deeper shade of
 * the same gold, which separates it from any angle instead of relying on a
 * highlight the lighting may not provide.
 */
export function buildGiftEmblem(width = 1): Group {
  const emblem = new Group();
  const gold = matte(PALETTE.gold, 0.32);
  /** The same gold, shaded down, so the ribbon is legible without a new hue. */
  const bronze = matte(0xa06a28, 0.4);
  const depth = width * 0.08;

  const add = (w: number, h: number, d: number, x: number, y: number, z = 0,
    material = gold): Mesh => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    emblem.add(mesh);
    return mesh;
  };

  // Box, then a lid a little wider so the silhouette has a shoulder.
  add(width * 0.84, width * 0.62, depth, 0, -width * 0.12);
  add(width * 0.96, width * 0.16, depth * 1.2, 0, width * 0.27);

  // Ribbon: shaded and proud of both, so it reads from any angle.
  add(width * 0.15, width * 0.92, depth * 1.9, 0, 0, depth * 0.5, bronze);
  add(width * 0.86, width * 0.13, depth * 1.7, 0, -width * 0.12, depth * 0.42, bronze);

  // Two bow loops and a knot.
  for (const side of [-1, 1]) {
    const loop = new Mesh(new TorusGeometry(width * 0.15, width * 0.045, 6, 18), bronze);
    loop.position.set(side * width * 0.17, width * 0.46, depth * 0.3);
    loop.rotation.z = side * 0.5;
    loop.scale.set(1, 0.78, 0.6);
    emblem.add(loop);
  }
  add(width * 0.13, width * 0.13, depth * 2.0, 0, width * 0.4, depth * 0.5, bronze);

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

  // Surrounding wall, recessed behind the door, with an opening the size of
  // the door behind the leaf. A solid slab meant opening the door revealed
  // a wall; this reveals whatever is beyond, which is the point of a door.
  const opening = Math.min(width, height) * 0.38 * 2.1;
  const pillarW = (width - opening) / 2;
  const bandH = (height - opening) / 2;
  for (const [w, h, x, y] of [
    [pillarW, height, -(opening + pillarW) / 2, height / 2],
    [pillarW, height, (opening + pillarW) / 2, height / 2],
    [opening, bandH, 0, height - bandH / 2],
    [opening, bandH, 0, bandH / 2],
  ] as const) {
    const part = new Mesh(new BoxGeometry(w, Math.max(0.05, h), 0.35), wall);
    part.position.set(x, y, -0.2);
    vault.add(part);
  }

  // Everything that swings — face, rim, spokes, emblem — hangs on one
  // hinged leaf at the door's left edge, so an arrival can open it. The
  // level finds it by name; a door that cannot open is just a wall with a
  // badge on it, and both levels end by walking through one.
  const radius = Math.min(width, height) * 0.38;
  const hinge = -radius * 1.04;
  const leaf = new Group();
  leaf.name = 'leaf';
  leaf.position.set(hinge, height * 0.5, 0);
  vault.add(leaf);

  // Door face: a disc proud of the wall, so it reads as a vault.
  const door = new Mesh(new CylinderGeometry(radius, radius, 0.3, 32), steel);
  door.rotation.x = Math.PI / 2;
  door.position.set(-hinge, 0, 0);
  leaf.add(door);

  // Rim, a touch wider, to catch the light along the edge.
  const rim = new Mesh(new TorusGeometry(radius * 1.04, 0.07, 8, 36), matte(PALETTE.gold, 0.35));
  rim.position.set(-hinge, 0, 0.08);
  leaf.add(rim);

  // Spokes radiating from the centre, the locking-bolt read.
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const spoke = new Mesh(new BoxGeometry(radius * 0.78, 0.05, 0.06), steel);
    spoke.position.set(
      Math.cos(angle) * radius * 0.48 - hinge,
      Math.sin(angle) * radius * 0.48,
      0.17,
    );
    spoke.rotation.z = angle;
    leaf.add(spoke);
  }

  // The emblem sized to the door, centred on it, standing off the face.
  const emblem = buildGiftEmblem(radius * 1.15);
  emblem.position.set(-hinge, 0, 0.22);
  leaf.add(emblem);

  return vault;
}

/**
 * A lantern: a warm self-lit box on a bracket. Two flank every gate so the
 * emblem is lit from both sides, and the light spill is a glow plane rather
 * than a real light, which keeps the draw cost at two meshes.
 */
function buildLantern(): Group {
  const lantern = new Group();
  const cage = new Mesh(new BoxGeometry(0.42, 0.62, 0.42), matte(PALETTE.steel, 0.55));
  lantern.add(cage);
  const pane = new Mesh(new BoxGeometry(0.3, 0.44, 0.3), glow(0xffd58a));
  lantern.add(pane);
  const cap = new Mesh(new ConeGeometry(0.34, 0.22, 4), matte(PALETTE.steel, 0.55));
  cap.position.y = 0.42;
  cap.rotation.y = Math.PI / 4;
  lantern.add(cap);
  const halo = new Mesh(new PlaneGeometry(2.6, 2.6), glow(0xffb85a, 0.16));
  halo.position.z = 0.24;
  lantern.add(halo);
  return lantern;
}

/**
 * What is behind a gate once it opens: a lit room a few units deep.
 *
 * Both levels end at a door, and a door that opens onto the rest of the map
 * shows an empty map. The arrival shot looks straight at the opening, so a
 * small chamber is all the camera ever sees through it. `kind` picks the
 * dressing: the gift vault with its stacked presents, or the stairwell up to
 * the rooftop with light spilling down it.
 */
export function buildGateInterior(width: number, height: number, kind: 'vault' | 'stairs'): Group {
  const room = new Group();
  const depth = Math.max(4, width * 0.45);
  // Lit, not luminous: the room has to read as a room with things in it,
  // and a wall glowing like a lamp turned the whole opening into a slab.
  const warm = new MeshStandardMaterial({
    color: 0x5a3a24, roughness: 0.9, metalness: 0.05, emissive: new Color(0xff8a2c), emissiveIntensity: 0.06,
  });
  // Back wall, side walls, floor and ceiling, all facing inward.
  const back = new Mesh(new PlaneGeometry(width, height), warm);
  back.position.set(0, height / 2, -depth);
  room.add(back);
  for (const sign of [-1, 1] as const) {
    const side = new Mesh(new PlaneGeometry(depth, height), warm);
    side.position.set(sign * width / 2, height / 2, -depth / 2);
    side.rotation.y = -sign * Math.PI / 2;
    room.add(side);
  }
  const floor = new Mesh(new PlaneGeometry(width, depth), matte(0x2a1a10, 0.95));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, 0.01, -depth / 2);
  room.add(floor);
  const ceiling = new Mesh(new PlaneGeometry(width, depth), warm);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.set(0, height, -depth / 2);
  room.add(ceiling);
  // The light itself: a glowing slab on the ceiling and its spill on the floor.
  const lamp = new Mesh(new PlaneGeometry(width * 0.4, 0.3), glow(0xffd9a0, 0.9));
  lamp.rotation.x = Math.PI / 2;
  lamp.position.set(0, height - 0.02, -depth / 2);
  room.add(lamp);
  const spill = new Mesh(new PlaneGeometry(width * 0.7, depth * 0.7), glow(0xffb060, 0.12));
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.02, -depth / 2);
  room.add(spill);

  if (kind === 'vault') {
    // Presents stacked against the walls, the same gold as the collectible.
    const gift = matte(PALETTE.gold, 0.5);
    const ribbon = matte(0xa06a28, 0.45);
    const u = width / 12;
    const spots: Array<[number, number, number]> = [
      [-0.36, 0, 1.0], [-0.22, 0, 0.8], [-0.3, 1, 0.75], [0.34, 0, 1.1], [0.2, 0, 0.85], [0.3, 1, 0.8], [0.0, 0, 0.9],
    ];
    for (const [fx, tier, size] of spots) {
      const sz = u * size;
      const box = new Mesh(new BoxGeometry(sz, sz, sz), gift);
      box.position.set(fx * width, sz / 2 + tier * sz * 1.02, -depth * 0.62 - sz * 0.5);
      room.add(box);
      const band = new Mesh(new BoxGeometry(sz * 1.02, sz * 0.22, sz * 1.02), ribbon);
      band.position.copy(box.position);
      room.add(band);
    }
  } else {
    // A stair rising to the back wall, each tread a step higher and deeper.
    const tread = matte(0x4a3324, 0.9);
    const steps = 6;
    const rise = (height * 0.55) / steps;
    const run = (depth * 0.7) / steps;
    for (let i = 0; i < steps; i++) {
      const step = new Mesh(new BoxGeometry(width * 0.6, rise, run), tread);
      step.position.set(0, rise * (i + 0.5), -depth * 0.3 - run * (i + 0.5));
      room.add(step);
    }
    // Light from the top of the stair, where the roof door would be.
    const top = new Mesh(new PlaneGeometry(width * 0.4, height * 0.3), glow(0xfff0c0, 0.45));
    top.position.set(0, height * 0.72, -depth + 0.05);
    room.add(top);
  }
  return room;
}

/**
 * The level 2 gatehouse: a façade spanning the street, with the vault door
 * set into it over a stepped plinth.
 *
 * The door used to stand in the road with nothing holding it. Now the
 * street ends at a building: pilasters either side of the door, a lantern
 * on each, a cornice over it, and the façade wide enough to meet the
 * flanking buildings and tall enough to leave the frame. The plinth is
 * three steps up to a threshold he stops on, so the door has a floor.
 */
export function buildGatehouse(doorWidth: number, doorHeight: number, spanX: number, facadeHeight: number): Group {
  const house = new Group();
  const brick = new MeshStandardMaterial({ color: 0x7a4a40, roughness: 0.92, metalness: 0.02 });
  const stone = matte(0x6e6a72, 0.85);
  const trim = matte(PALETTE.gold, 0.4);

  const door = buildVaultDoor(doorWidth, doorHeight);
  house.add(door);
  const interior = buildGateInterior(doorWidth * 0.76, doorHeight * 0.8, 'stairs');
  interior.position.z = -0.4;
  house.add(interior);

  // Façade either side of the door, up to the flanking buildings.
  const wingW = spanX - doorWidth / 2;
  for (const sign of [-1, 1] as const) {
    const wing = new Mesh(new BoxGeometry(wingW, facadeHeight, 1.2), brick);
    wing.position.set(sign * (doorWidth / 2 + wingW / 2), facadeHeight / 2, -0.5);
    house.add(wing);
    // Windows: a column of warm panes up each wing, clear of the pilaster.
    if (wingW > 2.4) {
      for (let row = 0; row < 5; row++) {
        const pane = new Mesh(new PlaneGeometry(1.4, 2.0), glow(0xffc784, 0.7));
        pane.position.set(sign * (doorWidth / 2 + 1.3 + (wingW - 1.3) / 2), doorHeight * 0.45 + row * 3.4, 0.12);
        house.add(pane);
      }
    }
  }
  // Over the door: brick up to the top, with a gold cornice line.
  const lintel = new Mesh(new BoxGeometry(doorWidth, facadeHeight - doorHeight, 1.2), brick);
  lintel.position.set(0, doorHeight + (facadeHeight - doorHeight) / 2, -0.5);
  house.add(lintel);
  const cornice = new Mesh(new BoxGeometry(doorWidth + 2.4, 0.5, 0.6), trim);
  cornice.position.set(0, doorHeight + 0.6, 0.2);
  house.add(cornice);

  // Pilasters framing the door, each carrying a lantern.
  for (const sign of [-1, 1] as const) {
    const pilaster = new Mesh(new BoxGeometry(1.2, doorHeight + 1.1, 1.0), stone);
    pilaster.position.set(sign * (doorWidth / 2 + 0.6), (doorHeight + 1.1) / 2, 0.3);
    house.add(pilaster);
    const lantern = buildLantern();
    lantern.position.set(sign * (doorWidth / 2 + 0.6), doorHeight * 0.62, 0.95);
    house.add(lantern);
  }

  // The plinth: three steps up to a threshold, wider than the door.
  const steps = 3;
  for (let i = 0; i < steps; i++) {
    const w = doorWidth + 3.0 + (steps - 1 - i) * 1.2;
    const d = 1.1 + (steps - 1 - i) * 1.0;
    const step = new Mesh(new BoxGeometry(w, 0.28, d), stone);
    step.position.set(0, 0.14 + i * 0.28, 0.9 + d / 2 + (steps - 1 - i) * 0.0);
    house.add(step);
  }
  // Raise the door and everything on it onto the top step.
  const lift = steps * 0.28;
  door.position.y = lift;
  interior.position.y = lift;
  return house;
}

/**
 * The level 1 bulkhead: a rooftop penthouse block the parapets run into,
 * with the vault door set in its face.
 *
 * The vault stood on the roof with sky on three sides. A block as wide as
 * the roof plus its parapets, taller than the door, with a threshold slab
 * and a lantern each side, makes the roof end at a wall rather than at a
 * door standing in air.
 */
export function buildBulkhead(doorWidth: number, doorHeight: number, roofHalfWidth: number): Group {
  const block = new Group();
  const render = new MeshStandardMaterial({ color: 0x3a3e5c, roughness: 0.92, metalness: 0.02 });
  const stone = matte(0x6a6878, 0.85);
  // At least the roof and its parapets, and always wider than the door.
  const w = Math.max(roofHalfWidth * 2 + 1.2, doorWidth + 4.4);
  const h = doorHeight + 1.6;
  const depth = 6;

  const door = buildVaultDoor(doorWidth, doorHeight);
  block.add(door);
  const interior = buildGateInterior(doorWidth * 0.76, doorHeight * 0.8, 'vault');
  interior.position.z = -0.4;
  block.add(interior);

  // The block: a wall either side of the door, a lintel over it, and a
  // body behind, so it reads as a room and not a sheet.
  const wingW = (w - doorWidth) / 2;
  for (const sign of [-1, 1] as const) {
    const wing = new Mesh(new BoxGeometry(wingW, h, depth), render);
    wing.position.set(sign * (doorWidth / 2 + wingW / 2), h / 2, -depth / 2);
    block.add(wing);
  }
  const lintel = new Mesh(new BoxGeometry(doorWidth, h - doorHeight, depth), render);
  lintel.position.set(0, doorHeight + (h - doorHeight) / 2, -depth / 2);
  block.add(lintel);
  // A dim window in each wing, so it reads as a room and not a wall.
  for (const sign of [-1, 1] as const) {
    const pane = new Mesh(new PlaneGeometry(0.7, 0.9), glow(0xffc784, 0.5));
    pane.position.set(sign * (doorWidth / 2 + wingW / 2), doorHeight * 0.62, 0.02);
    block.add(pane);
  }
  // A coping along the top edge, like the parapets' own.
  const coping = new Mesh(new BoxGeometry(w + 0.3, 0.16, depth + 0.3), stone);
  coping.position.set(0, h + 0.08, -depth / 2);
  block.add(coping);
  // Threshold slab in front of the door.
  const sill = new Mesh(new BoxGeometry(doorWidth + 1.0, 0.1, 1.4), stone);
  sill.position.set(0, 0.05, 0.75);
  block.add(sill);
  for (const sign of [-1, 1] as const) {
    const lantern = buildLantern();
    lantern.scale.setScalar(0.55);
    lantern.position.set(sign * (doorWidth / 2 + 0.45), doorHeight * 0.6, 0.35);
    block.add(lantern);
  }
  return block;
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
