import {
  BoxGeometry, BufferAttribute, BufferGeometry, CanvasTexture, CatmullRomCurve3,
  Color, CylinderGeometry, DoubleSide, Group, InstancedMesh, LineSegments,
  Matrix4, Mesh, MeshBasicMaterial, MeshStandardMaterial, Object3D, PlaneGeometry,
  SphereGeometry, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import { buildCake } from '../custom';
import {
  citySlab, cream, deckStone, gold, lampGlow, luminous, midnight,
  paleGold, plumDeep, satin, velvet, wine,
} from './materials';
import { makeTower } from './tower';
import type { BossProp } from '../../assets/boss/catalog';

// Materials come from the shared cache so tower and terrace geometry batch together.

function block(parent: Group, size: [number, number, number], at: [number, number, number], mat: MeshStandardMaterial | MeshBasicMaterial): Mesh {
  const mesh = new Mesh(new BoxGeometry(...size), mat);
  mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

function cylinder(parent: Group, rTop: number, rBottom: number, height: number, at: [number, number, number], mat: MeshStandardMaterial | MeshBasicMaterial, sides = 24): Mesh {
  const mesh = new Mesh(new CylinderGeometry(rTop, rBottom, height, sides), mat);
  mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

function orb(parent: Group, radius: number, at: [number, number, number], mat: MeshStandardMaterial | MeshBasicMaterial, segments = 16): Mesh {
  const mesh = new Mesh(new SphereGeometry(radius, segments, Math.max(8, segments / 2)), mat);
  mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

function ribbon(parent: Group, points: Vector3[], radius: number, mat: MeshStandardMaterial | MeshBasicMaterial): void {
  parent.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(points), Math.max(12, points.length * 5), radius, 5, false), mat));
}

/** The long clear run is a dark inlaid carpet; its fine gold boundaries reveal the lane perspective. */
/**
 * Near edge of the deck.
 *
 * The low camera sits at z 15 and its bottom ray meets the floor plane around
 * z 11, so a deck ending at the old 7.35 left a band of void across the bottom
 * of the frame. The floor has to run past the lens, not stop behind it.
 */
/**
 * Toronto, seen from the pod.
 *
 * Far enough away to sit just under the horizon and low enough that we look
 * down on every roofline — the camera eye is at y 2.9, so nothing may rise
 * above that or the city reads as standing beside us again. The first attempt
 * dropped the band straight down at its old distance, which put it behind the
 * deck's far edge and showed nothing at all.
 */
const CITY_BASE_Y = -11.0;
const CITY_Z = -50;
const CITY_SPREAD = 2.6;
const CITY_SCALE = 1.78;
const DECK_NEAR_Z = 12.2;
const DECK_FAR_Z = -9.15;
const DECK_LENGTH = DECK_NEAR_Z - DECK_FAR_Z;
const DECK_CENTRE_Z = (DECK_NEAR_Z + DECK_FAR_Z) / 2;

function makeDeck(parent: Group): void {
  block(parent, [9.2, 0.38, DECK_LENGTH], [0, -0.25, DECK_CENTRE_Z], deckStone);
  block(parent, [8.8, 0.07, DECK_LENGTH - 0.7], [0, -0.025, DECK_CENTRE_Z], deckStone);
  const laneMats = [satin(0x202b47), satin(0x263454), satin(0x202b47)];
  const laneLength = DECK_NEAR_Z - (-5.1);
  const laneCentreZ = (DECK_NEAR_Z + -5.1) / 2;
  for (let lane = 0; lane < 3; lane++) {
    const x = BOSS_LAYOUT.laneCentres[lane]!;
    block(parent, [2.06, 0.025, laneLength], [x, 0.02, laneCentreZ], laneMats[lane]!);
    block(parent, [1.84, 0.009, 0.07], [x, 0.041, 5.47], gold);
  }
  // Lane dividers in warm stone, not pink.
  //
  // src/render/palette.ts states the rule the whole game rests on: magenta is
  // Aurora's, and means every hazard and all her magic. A pink divider in the
  // one level where magenta finally means incoming damage leaves her attacks
  // nothing to contrast against on the surface they land on.
  for (const x of [-3.32, -1.1, 1.1, 3.32]) {
    block(parent, [0.025, 0.014, laneLength], [x, 0.048, laneCentreZ], satin(0x7c8398));
  }
  for (const x of [-4.45, 4.45]) {
    block(parent, [0.27, 0.22, DECK_LENGTH - 0.7], [x, 0.1, DECK_CENTRE_Z], midnight);
    block(parent, [0.16, 0.06, DECK_LENGTH - 0.7], [x, 0.23, DECK_CENTRE_Z], gold);
    for (const z of [-4.6, -2.3, 0, 2.3, 4.6, 7.4, 10.2]) {
      cylinder(parent, 0.08, 0.11, 0.92, [x, 0.68, z], midnight, 10);
      orb(parent, 0.09, [x, 1.18, z], lampGlow, 8);
    }
  }
  // The small paving joints are concentrated on the shoulders and never mask a warning.
  const joint = satin(0x7c8398);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      const z = -4.4 + i * 1.16;
      block(parent, [1.18, 0.009, 0.025], [side * 3.9, 0.039, z], joint);
    }
  }
}

/** Height of the authored stepped cap; anything above that is plinth. */
const DAIS_STEPS_HEIGHT = 1.07;
/** How far the whole stage sits above the deck beyond its own steps. */
const STAGE_LIFT = Math.max(0, BOSS_LAYOUT.bossStageY - DAIS_STEPS_HEIGHT);

/**
 * A three-step oval dais reads as a theatrical boss stage rather than a bare box.
 *
 * The steps keep their authored proportions; the extra elevation the low camera
 * needs comes from a plinth underneath, because stretching the steps themselves
 * to 2.6 units turns a dais into a wedding cake.
 */
function makeDais(parent: Group): void {
  if (STAGE_LIFT > 0.01) {
    const plinth = cylinder(parent, 4.62, 4.78, STAGE_LIFT, [0, STAGE_LIFT / 2, -6.2], plumDeep, 48);
    plinth.scale.z = 0.48;
    const reveal = cylinder(parent, 4.66, 4.66, 0.1, [0, STAGE_LIFT - 0.05, -6.2], gold, 48);
    reveal.scale.z = 0.48;
  }
  const tiers = [
    { r: 4.5, y: 0.17, h: 0.34, z: -6.25, mat: plumDeep },
    { r: 4.18, y: 0.46, h: 0.28, z: -6.43, mat: gold },
    { r: 3.95, y: 0.74, h: 0.3, z: -6.48, mat: velvet },
    { r: 3.82, y: 0.96, h: 0.12, z: -6.48, mat: paleGold },
    { r: 3.68, y: 1.035, h: 0.07, z: -6.48, mat: satin(0x4d245a) },
  ];
  for (const tier of tiers) {
    const mesh = cylinder(parent, tier.r, tier.r, tier.h, [0, tier.y + STAGE_LIFT, tier.z], tier.mat, 48);
    mesh.scale.z = 0.48;
  }
  // Inset medallion behind Aurora, thin enough to keep shots and spell cues legible.
  const medallion = cylinder(parent, 1.4, 1.4, 0.018, [0, BOSS_LAYOUT.bossStageY + 0.035, BOSS_LAYOUT.bossZ], satin(0x7d4474, 0.2), 32);
  medallion.scale.z = 0.64;
}

/** Velvet folds and golden architrave form a tall birthday gala proscenium. */
function makeArchitecture(parent: Group): void {
  const z = -8.7;
  // No backdrop wall. What stands behind Aurora is the tower shaft, and the
  // open night either side of it is the only thing that can say "350 m up".
  // The arch, its columns and the velvet stay; they now read as her dressing
  // hung on the tower rather than as a stage flat.
  for (const side of [-1, 1]) {
    const x = side * 3.75;
    cylinder(parent, 0.32, 0.4, 4.25, [x, 2.95, z + 0.12], velvet, 20);
    for (const y of [0.94, 1.08, 4.92, 5.13]) {
      cylinder(parent, 0.43, 0.43, 0.12, [x, y, z + 0.12], gold, 20);
    }
    // Tall velvet panels with alternating lit and shadowed folds.
    for (let i = 0; i < 4; i++) {
      const foldX = x + side * (0.18 + i * 0.17);
      const top = 5.45 - i * 0.075;
      const bottom = 1.05 + i * 0.13;
      block(parent, [0.21, top - bottom, 0.12], [foldX, (top + bottom) / 2, z + 0.45 + (i % 2) * 0.08], i % 2 ? wine : velvet);
    }
    const swag = Array.from({ length: 9 }, (_, i) => {
      const u = i / 8;
      return new Vector3(side * (2.7 + u * 1.8), 5.15 - Math.sin(u * Math.PI) * 1.0, z + 0.63);
    });
    ribbon(parent, swag, 0.055, gold);
    orb(parent, 0.21, [side * 4.5, 5.17, z + 0.65], paleGold, 10);
  }
  const arch = Array.from({ length: 21 }, (_, i) => {
    const a = Math.PI - i / 20 * Math.PI;
    return new Vector3(Math.cos(a) * 3.75, 5.03 + Math.sin(a) * 1.35, z + 0.17);
  });
  ribbon(parent, arch, 0.16, gold);
  ribbon(parent, arch.map((p) => new Vector3(p.x * 0.93, p.y - 0.16, p.z + 0.09)), 0.045, paleGold);
  for (const side of [-1, 1]) {
    block(parent, [1.45, 0.24, 0.85], [side * 4.38, 5.4, z + 0.25], gold);
    block(parent, [1.1, 1.1, 0.65], [side * 4.38, 6.04, z + 0.16], midnight);
    const crest = cylinder(parent, 0.26, 0.36, 0.68, [side * 4.38, 6.63, z + 0.2], gold, 12);
    crest.rotation.z = side * -0.12;
    orb(parent, 0.13, [side * 4.38, 7.1, z + 0.2], luminous(0xf0a7ff), 10);
  }
  const lamps = new InstancedMesh(new SphereGeometry(0.08, 8, 5), lampGlow, 25);
  const matrix = new Matrix4();
  for (let i = 0; i < 25; i++) {
    const a = Math.PI - i / 24 * Math.PI;
    matrix.makeTranslation(Math.cos(a) * 3.68, 5.02 + Math.sin(a) * 1.31, z + 0.36);
    lamps.setMatrixAt(i, matrix);
  }
  parent.add(lamps);
}

/*
 * The rooftop side wings are gone.
 *
 * They were banner pylons 3.25 units tall standing at x +/-4.4, designed to
 * frame a flat roof. On the pod they stood exactly in the one strip of sky
 * the geometry lets us see: the deck occludes everything steeper than ~10
 * degrees below horizontal at the frame edge, so the air between the horizon
 * and that line is the entire altitude cue, and the wings filled it. The
 * parapet in tower.ts does the edge-framing job now.
 */

function makeMoonAndSkyline(parent: Group): void {
  // A soft, painted moon sets the same city-at-night silhouette as the references.
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const sky = ctx.createRadialGradient(128, 128, 0, 128, 128, 126);
    sky.addColorStop(0, '#fcf9da'); sky.addColorStop(0.72, '#d7e9ff'); sky.addColorStop(0.9, '#91b8ec'); sky.addColorStop(1, '#91b8ec00');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996;
      const r = Math.sqrt((i * 37 % 97) / 97) * 89;
      ctx.beginPath();
      ctx.fillStyle = i % 3 ? '#9ab9d121' : '#819fc02c';
      ctx.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 4 + i % 9, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = 'srgb';
    const moon = new Mesh(new PlaneGeometry(3.25, 3.25), new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: DoubleSide }));
    moon.position.set(2.35, 8.0, -22);
    moon.lookAt(0, 7, 13);
    parent.add(moon);
  }
  const buildings = [
    [-14, 4.1, 2.4], [-12, 6.0, 2.1], [-9.8, 4.4, 2.6], [-7.3, 7.3, 2.7],
    [-4.8, 5.5, 1.9], [-2.4, 4.2, 2.4], [0, 5.0, 2.1], [2.7, 4.7, 2.5],
    [5.1, 6.9, 2.3], [7.9, 5.6, 2.8], [10.6, 7.2, 2.2], [13.1, 4.9, 2.5],
  ] as const;
  // One slab tone for the whole skyline: three navies a kilometre away are
  // three draw calls and one colour to the eye.
  const cityMaterials = [citySlab, citySlab, citySlab];
  const windows: number[] = [];
  for (let i = 0; i < buildings.length; i++) {
    const [rawX, rawHeight, rawWidth] = buildings[i]!;
    const x = rawX * CITY_SPREAD;
    const height = rawHeight * CITY_SCALE;
    const width = rawWidth * CITY_SCALE;
    const z = CITY_Z - (i % 3) * 2.2;
    // Toronto is below us now. Dropping the band under the deck plane is what
    // turns "a plaza with buildings behind it" into "a platform in the air".
    const base = CITY_BASE_Y;
    block(parent, [width, height, 3.5], [x, base + height / 2, z], cityMaterials[i % 3]!);
    block(parent, [width + 0.3, 0.3, 3.7], [x, base + height - 0.05, z], citySlab);
    if (i % 3 === 0) block(parent, [0.08, 0.65, 0.08], [x, base + height + 0.52, z], citySlab);
    for (let row = 0; row < Math.floor(height / 0.48) - 1; row++) {
      for (let col = 0; col < Math.floor(width / 0.34) - 1; col++) {
        if ((row * 7 + col * 11 + i * 3) % 5 === 0) continue;
        windows.push(x - width / 2 + 0.46 + col * 0.56, CITY_BASE_Y + row * 0.78 + 1.2, z + 1.8);
      }
    }
  }
  const windowMesh = new InstancedMesh(new PlaneGeometry(0.2, 0.32), luminous(0xcf9a62, 0.62), windows.length / 3);
  const dummy = new Object3D();
  for (let i = 0; i < windows.length / 3; i++) {
    dummy.position.set(windows[i * 3]!, windows[i * 3 + 1]!, windows[i * 3 + 2]!);
    dummy.updateMatrix();
    windowMesh.setMatrixAt(i, dummy.matrix);
  }
  parent.add(windowMesh);
  // No distant CN Tower: this scene is on top of it.
  // Sparse high stars, behind the moon and architecture.
  const stars = new InstancedMesh(new SphereGeometry(0.05, 5, 4), luminous(0x8fb7fb, 0.7), 32);
  const matrix = new Matrix4();
  for (let i = 0; i < 32; i++) {
    const x = -13 + (i * 17 % 31) / 31 * 26;
    const y = 4.6 + (i * 23 % 29) / 29 * 12;
    matrix.makeTranslation(x, y, -22);
    stars.setMatrixAt(i, matrix);
  }
  parent.add(stars);
}

function makeBalloons(parent: Group): void {
  const balloon = new InstancedMesh(new SphereGeometry(0.32, 12, 9), satin(0xffffff, 0.02, 0.58), 24);
  const palette = [0x5f2470, 0x8c4a93, 0x7b3a86, 0xc79a52, 0xa9733f, 0xe0c184];
  const dummy = new Object3D();
  const lines: number[] = [];
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x = side * (3.92 + col * 0.25 + (row % 2) * 0.08);
      const y = 2.2 + STAGE_LIFT + row * 0.58 + (col % 2) * 0.18;
      const z = -7.1 + (col - 1) * 0.29;
      dummy.position.set(x, y, z);
      dummy.scale.set(0.91, 1.18, 0.83);
      dummy.updateMatrix();
      balloon.setMatrixAt(index, dummy.matrix);
      balloon.setColorAt(index, new Color(palette[(i + (side + 1) * 2) % palette.length]!));
      lines.push(x, y - 0.35, z, x + side * 0.14, 1.08 + STAGE_LIFT * 0.4, z);
      index++;
    }
  }
  parent.add(balloon);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(lines), 3));
  parent.add(new LineSegments(geometry, luminous(0x8c7e98, 0.65)));
  // Gold ribbon cascades visually tie balloons to the stage without entering lanes.
  for (const side of [-1, 1]) {
    ribbon(parent, Array.from({ length: 12 }, (_, i) => {
      const t = i / 11;
      return new Vector3(side * (4.02 + Math.sin(t * Math.PI * 3) * 0.15), 1.3 + STAGE_LIFT * 0.4 + t * (3.9 + STAGE_LIFT), -6.75 + Math.sin(t * Math.PI * 4) * 0.12);
    }), 0.018, paleGold);
  }
}

function makeCandelabra(parent: Group, x: number, z: number): void {
  const baseY = BOSS_LAYOUT.bossStageY;
  cylinder(parent, 0.27, 0.34, 0.16, [x, baseY + 0.08, z], gold, 16);
  cylinder(parent, 0.045, 0.08, 1.65, [x, baseY + 0.96, z], gold, 10);
  for (const dx of [-0.45, -0.23, 0, 0.23, 0.45]) {
    const y = baseY + 1.75 - Math.abs(dx) * 0.65;
    if (dx !== 0) ribbon(parent, [
      new Vector3(x, baseY + 1.25, z), new Vector3(x + dx * 0.6, baseY + 1.46, z),
      new Vector3(x + dx, y - 0.23, z),
    ], 0.036, gold);
    cylinder(parent, 0.035, 0.035, 0.28, [x + dx, y, z], cream, 8);
    orb(parent, 0.07, [x + dx, y + 0.21, z], lampGlow, 8).scale.y = 1.5;
  }
}

/**
 * The stolen cake, held in her magic.
 *
 * It had a gold plinth and sat beside her as an equal exhibit. The plot says
 * otherwise: she took it, victory recovers it, defeat leaves with it. Airborne
 * and tethered, it is visibly hers and visibly out of reach, and both endings
 * stage themselves — the tether snaps and it falls, or it leaves with her.
 */
function makeCakeDisplay(parent: Group, cake: Group, cakeRings: Mesh[]): void {
  const top = BOSS_LAYOUT.cakeY;
  cake.position.set(BOSS_LAYOUT.cakeX, top, BOSS_LAYOUT.cakeZ);
  const sponge = buildCake();
  sponge.scale.setScalar(1.72);
  cake.add(sponge);
  parent.add(cake);
  // Piped cream and red berries turn the small shared cake into the hero prop.

  const berry = satin(0xb80e36, 0.06, 0.36);
  for (const [radius, y, count] of [[0.84, 0.45, 24], [0.59, 0.98, 16]] as const) {
    for (let i = 0; i < count; i++) {
      const a = i / count * Math.PI * 2;
      const px = Math.cos(a) * radius;
      const pz = Math.sin(a) * radius;
      const swirl = orb(cake, 0.095, [px, y, pz], cream, 8);
      swirl.scale.y = 0.72;
      if (i % 3 === 0) orb(cake, 0.067, [px, y + 0.09, pz], berry, 8);
    }
  }
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * Math.PI * 2;
    orb(cake, 0.075, [Math.cos(a) * 0.47, 1.2, Math.sin(a) * 0.47], berry, 8);
  }
  /*
   * Three rings it rests in, widest at the top and tapering to a point below.
   *
   * A compact, quiet cone keeps the cake visibly resting just above the top
   * ring. Equal short gaps preserve the levitation read without a tall funnel.
   * They live in the cake group so both endings carry them with the cake.
   */
  for (const [radius, drop] of [[1.4, -0.14], [0.95, -0.34], [0.5, -0.54]] as const) {
    // Bake the lie-flat rotation into the geometry rather than the mesh. With
    // it on the transform, animating rotation.z tipped each ring out of its
    // own plane instead of spinning it, and they read as loose crossing
    // ellipses rather than a stack.
    const geometry = new TorusGeometry(radius, 0.055, 7, 44);
    geometry.rotateX(Math.PI / 2);
    const ring = new Mesh(geometry, luminous(0xd07bff, 0.66));
    ring.position.set(0, drop, 0);
    cake.add(ring);
    cakeRings.push(ring);
  }
}

/**
 * Fallen party paper.
 *
 * Gold, cream and amber only. It previously scattered magenta, violet and
 * blue across the whole playable deck — both signal colours, on the exact
 * surface lane warnings have to read against. Gold is already the "take it"
 * colour, but a collectible is distinguished by its animated sparkle rather
 * than by hue, so still paper on the floor cannot be mistaken for one.
 */
function makeScatteredPartyPaper(parent: Group): void {
  const paper = new InstancedMesh(new PlaneGeometry(0.095, 0.17), luminous(0xffffff, 0.95), 64);
  const colors = [0xf8c776, 0xf2e3c4, 0xe0a860, 0xfff4de];
  const dummy = new Object3D();
  for (let i = 0; i < 64; i++) {
    // Shoulders only. The lane corridor stays bare so an attack marking has
    // a clean surface to land on.
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (3.5 + (i * 19 % 67) / 67 * 1.0);
    const z = -8.25 + (i * 23 % 61) / 61 * 17.5;
    dummy.position.set(x, 0.058, z);
    dummy.rotation.set(-Math.PI / 2, 0, i * 2.1);
    dummy.updateMatrix();
    paper.setMatrixAt(i, dummy.matrix);
    paper.setColorAt(i, new Color(colors[i % colors.length]!));
  }
  parent.add(paper);
}

/** Collapse repeated static trim into material batches; the cake stays movable. */
function batchArchitecture(root: Group, cake: Group, animated: ReadonlySet<Object3D> = new Set()): void {
  root.updateMatrixWorld(true);
  const worldToRoot = root.matrixWorld.clone().invert();
  const groups = new Map<string, Mesh[]>();
  const visit = (object: Object3D): void => {
    if (object === cake || animated.has(object) || object instanceof InstancedMesh) return;
    if (object instanceof Mesh && !Array.isArray(object.material)) {
      const group = groups.get(object.material.uuid) ?? [];
      group.push(object);
      groups.set(object.material.uuid, group);
    }
    for (const child of object.children) visit(child);
  };
  for (const child of [...root.children]) visit(child);
  for (const meshes of groups.values()) {
    if (meshes.length < 2) continue;
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      geometry.applyMatrix4(new Matrix4().multiplyMatrices(worldToRoot, mesh.matrixWorld));
      return geometry;
    });
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) continue;
    const combined = new Mesh(merged, meshes[0]!.material);
    root.add(combined);
    for (const mesh of meshes) {
      mesh.removeFromParent();
      mesh.geometry.dispose();
    }
  }
}

/**
 * A wrapped gift, built rather than imported.
 *
 * The Holiday Bits presents are Christmas red and green, and tinting cannot
 * fix that: their colour lives in a texture atlas, and a material tint
 * multiplies, so red only ever becomes darker red — it cannot gain the blue
 * that purple needs. `aurora.png` wraps its gifts in plum and gold, so they
 * are boxes and ribbons here instead. It also keeps the pack's blue present
 * unique to the scored collectible, which must never share a silhouette with
 * scenery.
 */
function makeGift(parent: Group, x: number, y: number, z: number, size: number, plum: boolean, spin = 0): void {
  const gift = new Group();
  // Light boxes on a dark stage.
  //
  // The first pass wrapped them plum (0x4a1a56) and stood them on a velvet
  // dais (0x40194e) — the same hue at the same value, which is camouflage,
  // not decoration. Hue cannot fix that while the dais is also purple, so
  // these jump the value instead: luminance around 230 against the dais's 34.
  const wrap = plum ? cream : satin(0xffd28a, 0.32, 0.42);
  const ribbon = plum ? satin(0x7b2f8c, 0.05, 0.6) : satin(0x5f2470, 0.05, 0.64);
  const w = size;
  const h = size * 0.82;
  gift.add(new Mesh(new BoxGeometry(w, h, w), wrap));
  for (const axis of [0, 1]) {
    const band = new Mesh(
      new BoxGeometry(axis ? w * 1.02 : w * 0.17, h * 1.02, axis ? w * 0.17 : w * 1.02),
      ribbon,
    );
    gift.add(band);
  }
  // Two loops and a knot read as a bow at this distance; petals do not.
  for (const side of [-1, 1]) {
    const loop = new Mesh(new SphereGeometry(w * 0.17, 7, 5), ribbon);
    loop.position.set(side * w * 0.17, h * 0.56, 0);
    loop.scale.set(1, 0.62, 0.7);
    gift.add(loop);
  }
  gift.position.set(x, y + h / 2, z);
  gift.rotation.y = spin;
  parent.add(gift);
  // A contact shadow, so each box sits on the step instead of hovering over it.
  const shade = new Mesh(new CylinderGeometry(w * 0.72, w * 0.72, 0.012, 10), plumDeep);
  shade.position.set(x, y + 0.008, z);
  parent.add(shade);
}

/**
 * Gift stacks on the dais steps and at the wings.
 *
 * The deck in front of her reads bare, but it cannot be dressed: that floor
 * is where lane warnings and her strikes land, and anything standing on it
 * competes with a cue the player has under a second to read. The dais face is
 * the one surface directly beneath her that play never touches.
 */
function makeGiftStacks(parent: Group): void {
  const step = BOSS_LAYOUT.bossStageY - 1.07;
  const stage = BOSS_LAYOUT.bossStageY;
  const placements: readonly (readonly [number, number, number, number, boolean, number])[] = [
    // Dais steps, directly under her.
    [-2.46, step, -4.42, 0.88, true, 0.34],
    [-1.68, step, -4.14, 0.66, false, -0.22],
    [-3.04, step + 0.6, -4.68, 0.58, false, 0.5],
    [2.42, step, -4.42, 0.84, false, -0.3],
    [1.64, step, -4.12, 0.64, true, 0.26],
    [3.02, step + 0.56, -4.68, 0.56, true, -0.46],
    // Wings, well clear of the corridor.
    [-3.86, stage, -6.1, 0.78, true, 0.2],
    [-4.18, stage, -7.2, 0.96, false, -0.2],
    [-4.46, stage, -7.85, 0.54, false, 0.4],
    [3.9, stage, -6.55, 0.88, false, 0.2],
    [4.26, stage, -7.4, 0.68, true, -0.1],
  ];
  for (const [x, y, z, size, plum, spin] of placements) makeGift(parent, x, y, z, size, plum, spin);
}

/**
 * Confetti hanging in the air, which is the other half of the party the deck
 * cannot carry.
 *
 * Both side volumes only: `BOSS_LAYOUT.sideDressingMinX` outward. The air over
 * the lanes is where her magic will travel and where the player has under a
 * second to read a warning, so nothing decorative drifts through it. Gold and
 * cream, never the hazard magenta, and one instanced mesh so the whole field
 * is a single draw.
 */
class DriftingConfetti {
  readonly mesh: InstancedMesh;
  private readonly seeds: Float32Array;
  private readonly dummy = new Object3D();
  private time = 0;
  private static readonly COUNT = 44;
  private static readonly TOP = 7.5;
  private static readonly FALL = 9.0;

  constructor() {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(0.1, 0.16),
      new MeshBasicMaterial({ side: DoubleSide, transparent: true, opacity: 0.92 }),
      DriftingConfetti.COUNT,
    );
    const colors = [0xf6c86f, 0xfff0d4, 0xd9a24e, 0xc9a7dd];
    this.seeds = new Float32Array(DriftingConfetti.COUNT * 4);
    for (let i = 0; i < DriftingConfetti.COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      this.seeds[i * 4] = side * (BOSS_LAYOUT.sideDressingMinX + 0.3 + (i * 13 % 29) / 29 * 2.2);
      this.seeds[i * 4 + 1] = (i * 17 % 37) / 37;
      this.seeds[i * 4 + 2] = -7.5 + (i * 23 % 41) / 41 * 17;
      this.seeds[i * 4 + 3] = 0.45 + (i * 11 % 19) / 19 * 0.5;
      this.mesh.setColorAt(i, new Color(colors[i % colors.length]!));
    }
    this.mesh.frustumCulled = false;
    this.update(0);
  }

  update(step: number): void {
    this.time += step;
    for (let i = 0; i < DriftingConfetti.COUNT; i++) {
      const x = this.seeds[i * 4]!;
      const phase = this.seeds[i * 4 + 1]!;
      const z = this.seeds[i * 4 + 2]!;
      const speed = this.seeds[i * 4 + 3]!;
      const fall = (phase + this.time * speed * 0.055) % 1;
      this.dummy.position.set(
        x + Math.sin(this.time * speed + phase * 9) * 0.3,
        DriftingConfetti.TOP - fall * DriftingConfetti.FALL,
        z,
      );
      this.dummy.rotation.set(this.time * speed * 1.6, this.time * speed * 2.1 + phase * 6, phase * 3);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class BossEnvironment {
  readonly root = new Group();
  readonly cake = new Group();
  private readonly cakeRings: Mesh[] = [];
  private readonly confetti = new DriftingConfetti();
  private time = 0;

  constructor() {
    makeMoonAndSkyline(this.root);
    makeDeck(this.root);
    makeDais(this.root);
    // The proscenium is authored for a 1.05 stage. Scaling it vertically keeps
    // its base on the deck while its arch still clears Aurora's crown.
    const architecture = new Group();
    makeArchitecture(architecture);
    architecture.scale.y = (6.38 + STAGE_LIFT * 1.95) / 6.38;
    this.root.add(architecture);
    makeTower(this.root, DECK_NEAR_Z, DECK_FAR_Z);
    makeBalloons(this.root);
    makeCandelabra(this.root, -3.55, -5.5);
    makeCandelabra(this.root, 3.55, -5.5);
    makeCakeDisplay(this.root, this.cake, this.cakeRings);
    makeGiftStacks(this.root);
    makeScatteredPartyPaper(this.root);
    batchArchitecture(this.root, this.cake);
    // The rings rotate and release during recovery; batching them would leave
    // `cakeRings` pointing at detached meshes and freeze their visible geometry.
    batchArchitecture(this.cake, new Group(), new Set(this.cakeRings));
    // Added after batching: it animates per frame, so it must stay its own mesh.
    this.root.add(this.confetti.mesh);
  }

  update(step: number): void {
    this.time += step;
    this.confetti.update(step);
    // The cake itself is driven by BossEffects: its endings move it, and two
    // writers would fight. Only its rings are animated here.
    // Each ring turns at its own rate, and the middle one against the others.
    for (let i = 0; i < this.cakeRings.length; i++) {
      this.cakeRings[i]!.rotation.y = this.time * (i === 1 ? -0.5 : 0.3 + i * 0.16);
    }
  }

  /** Aurora's levitation rings release the cake as Matthew recovers it. */
  setCakeRingStrength(strength: number): void {
    for (const ring of this.cakeRings) ring.scale.setScalar(strength);
  }

  addProps(models: ReadonlyMap<string, Group>, catalog: readonly BossProp[]): void {
    void models;
    void catalog;
    // The City Builder flanks are gone. They are Level 2's street-canyon
    // assets, and standing them beside the gala made the arena read as more
    // of the chase rather than somewhere we had arrived. The skyline band far
    // below does the city's job now.
    // The wreath and bell are intentionally omitted: their winter motifs would
    // displace the stronger birthday cake, balloons, and candle silhouette.
  }
}
