import {
  AdditiveBlending, BackSide, Box3, CircleGeometry, Group, Mesh, MeshBasicMaterial, Object3D,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetBundle, type Actor } from '../../assets/characters';
import { BOSS_ACTORS, BOSS_ANIMATION_LIBRARIES, BOSS_CANNON_MOUNT, BOSS_PROPS } from '../../assets/boss/catalog';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import { buildCrown } from '../custom';
import type { BossPractice } from '../../levels/boss/practice';

const _point = new Vector3();

/**
 * Bounds of what will actually be drawn.
 *
 * `Box3.setFromObject` ignores `visible`, so a hidden mesh still inflates the
 * box. Aurora's hidden Mage hat is a 2.9 x 2.0 x 3.1 bind-pose slab: fitting
 * against it made her 18% shorter on screen than the number asked for, which
 * is why she measured 4.15 units tall and still read as Matthew's size.
 */
function visibleBox(root: Object3D): Box3 {
  const box = new Box3();
  root.updateWorldMatrix(true, true);
  const visit = (object: Object3D): void => {
    if (!object.visible) return;
    const geometry = (object as Mesh).geometry;
    const position = geometry?.getAttribute?.('position');
    if (position) {
      for (let i = 0; i < position.count; i++) {
        box.expandByPoint(_point.fromBufferAttribute(position, i).applyMatrix4(object.matrixWorld));
      }
    }
    for (const child of object.children) visit(child);
  };
  visit(root);
  return box;
}

function fitActor(actor: Actor, targetHeight: number): void {
  const root = actor.root;
  const original = visibleBox(root);
  root.scale.setScalar(targetHeight / Math.max(0.001, original.getSize(new Vector3()).y));
  const fitted = visibleBox(root);
  root.position.y -= fitted.min.y;
}

/**
 * Aurora's crown, hovering clear above her hair.
 *
 * `buildCrown` makes a flat ring of constant radius; her hair is a tilted,
 * non-cylindrical dome. There is no height at which such a ring fits it — it
 * is either inside the dome and invisible, or outside it and reading as a
 * halo, which is what three passes of radius tuning kept trading between.
 *
 * So it does not sit on her at all: it floats above the hair with a magenta
 * underglow, which suits a self-appointed queen and, more practically, cannot
 * clip. The hair is skinned, so anything conformed to the bind pose would
 * break the moment she animates into a cast.
 */
function floatCrown(actor: Actor, head: Object3D): Group | null {
  const headMesh = actor.root.getObjectByName('Mage_Head');
  if (!headMesh) return null;
  const bounds = visibleBox(headMesh);
  const size = bounds.getSize(new Vector3());
  const centre = bounds.getCenter(new Vector3());
  const boneScale = head.getWorldScale(_point).x || 1;
  const radius = (size.x * 0.38) / boneScale;

  const crown = buildCrown(radius);
  // The aura is the crown's own geometry again, grown slightly and drawn
  // back-faces-only in additive magenta. That traces the band and every point
  // instead of hanging a blob behind them, and it costs one extra draw rather
  // than a texture. A flat ring was tried first and fails here: the lens is
  // nearly level with her crown, so a horizontal torus is seen edge-on and
  // reads as a drawn line.
  const aura = buildCrown(radius);
  const auraMaterial = new MeshBasicMaterial({
    color: 0xcc29c3, transparent: true, opacity: 0.34,
    side: BackSide, depthWrite: false, blending: AdditiveBlending,
  });
  aura.traverse((object) => {
    if (object instanceof Mesh) object.material = auraMaterial;
  });
  aura.scale.setScalar(1.12);
  crown.add(aura);

  head.updateWorldMatrix(true, false);
  // Barely clear of the hair: enough that nothing intersects when she casts,
  // little enough that it still reads as hers rather than as scenery.
  crown.position.copy(head.worldToLocal(
    new Vector3(centre.x, bounds.max.y + size.y * 0.025, centre.z),
  ));
  crown.updateMatrixWorld(true);
  return mergeByLook(crown);
}

/**
 * Collapse a prop into one mesh per distinct look.
 *
 * `buildCrown` is thirteen separate meshes — a band, eight points and four
 * jewels — and it builds a fresh material per jewel, so the crown and its
 * aura together cost about 26 draw calls for an object a centimetre tall on
 * screen. That was a fifth of the whole scene's budget. Grouping by appearance
 * rather than by material identity also folds the per-jewel materials into one.
 */
function mergeByLook(group: Group): Group {
  const buckets = new Map<string, Mesh[]>();
  group.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const material = object.material as MeshBasicMaterial;
    const key = [
      material.type, material.color?.getHexString() ?? '', material.opacity,
      material.transparent, material.blending, material.side, material.depthWrite,
    ].join('|');
    const bucket = buckets.get(key) ?? [];
    bucket.push(object);
    buckets.set(key, bucket);
  });
  const merged = new Group();
  merged.position.copy(group.position);
  merged.rotation.copy(group.rotation);
  merged.scale.copy(group.scale);
  for (const meshes of buckets.values()) {
    const parts = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone();
      mesh.updateMatrix();
      // Local to the prop's own root, so the merged mesh can replace it.
      geometry.applyMatrix4(mesh.matrixWorld.clone().premultiply(group.matrixWorld.clone().invert()));
      return geometry;
    });
    const combined = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!combined) continue;
    merged.add(new Mesh(combined, meshes[0]!.material));
  }
  for (const mesh of meshes(group)) mesh.geometry.dispose();
  return merged;
}

function meshes(group: Group): Mesh[] {
  const found: Mesh[] = [];
  group.traverse((object) => { if (object instanceof Mesh) found.push(object); });
  return found;
}

function shadow(): Mesh {
  const mesh = new Mesh(new CircleGeometry(0.53, 24), new MeshBasicMaterial({ color: 0x07111f, transparent: true, opacity: 0.4, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

export class BossActors {
  readonly root = new Group();
  private bundle: AssetBundle | null = null;
  private matthew: Actor | null = null;
  private aurora: Actor | null = null;
  private matthewHolder = new Group();
  private readonly bossHolder = new Group();
  private hover = 0;
  private shotPose = 0;
  private lastShotCount = 0;
  private readonly matthewShadow = shadow();

  constructor() {
    this.root.add(this.matthewHolder);
    this.root.add(this.matthewShadow);
    const auroraShadow = shadow();
    auroraShadow.position.set(0, BOSS_LAYOUT.bossStageY + 0.02, BOSS_LAYOUT.bossZ);
    this.root.add(auroraShadow);
  }

  async load(): Promise<void> {
    const bundle = new AssetBundle();
    await bundle.loadAll([BOSS_ACTORS.matthew.url, BOSS_ACTORS.aurora.url, ...BOSS_ANIMATION_LIBRARIES]);
    const matthew = bundle.actor(BOSS_ACTORS.matthew.url);
    matthew.hideMeshes(BOSS_ACTORS.matthew.hideMeshes);
    matthew.root.rotation.y = Math.PI;
    fitActor(matthew, BOSS_ACTORS.matthew.targetHeight);
    matthew.play(BOSS_ACTORS.matthew.clips.idle);
    this.matthewHolder.add(matthew.root);

    const aurora = bundle.actor(BOSS_ACTORS.aurora.url);
    aurora.hideMeshes(BOSS_ACTORS.aurora.hideMeshes);
    fitActor(aurora, BOSS_ACTORS.aurora.targetHeight);
    aurora.play(BOSS_ACTORS.aurora.clips.idle);
    const headBone = aurora.root.getObjectByName('head');
    if (!headBone) throw new Error('Aurora head node missing');
    const crown = floatCrown(aurora, headBone);
    if (!crown) throw new Error('Aurora head mesh missing');
    headBone.add(crown);
    this.bossHolder.position.set(0, BOSS_LAYOUT.bossStageY + 0.08 + BOSS_LAYOUT.bossFloat, BOSS_LAYOUT.bossZ);
    // A slight forward lean aims her crown and shoulders down the runway.
    this.bossHolder.rotation.x = 0.065;
    this.bossHolder.add(aurora.root);
    this.root.add(this.bossHolder);

    const cannon = await new GLTFLoader().loadAsync(BOSS_PROPS.find((item) => item.id === 'cannon')!.url);
    const mount = BOSS_CANNON_MOUNT;
    cannon.scene.position.set(...mount.position);
    cannon.scene.rotation.set(...mount.rotationEuler);
    cannon.scene.scale.setScalar(mount.scale);
    if (!matthew.attach(mount.handNode, cannon.scene)) throw new Error('Matthew hand slot missing');

    this.bundle = bundle;
    this.matthew = matthew;
    this.aurora = aurora;
  }

  update(game: BossPractice, step: number): void {
    // She hovers: a slow, shallow drift that never changes her hit position
    // enough to matter, but stops her reading as standing on furniture.
    this.hover += step;
    this.bossHolder.position.y = BOSS_LAYOUT.bossStageY + 0.08 + BOSS_LAYOUT.bossFloat
      + Math.sin(this.hover * 0.9) * 0.07;
    this.matthewHolder.position.set(game.renderX, BOSS_LAYOUT.playerY, BOSS_LAYOUT.playerZ);
    this.matthewHolder.rotation.z = -game.lanes.lean * 0.09;
    this.matthewShadow.position.set(game.renderX, 0.05, BOSS_LAYOUT.playerZ);
    if (game.shotCount !== this.lastShotCount) {
      this.lastShotCount = game.shotCount;
      this.shotPose = 0.34;
      this.matthew?.play(BOSS_ACTORS.matthew.clips.shoot, { fade: 0.07, loop: false, clampWhenFinished: true });
    }
    if (this.shotPose > 0) {
      this.shotPose = Math.max(0, this.shotPose - step);
      if (this.shotPose === 0) this.matthew?.play(BOSS_ACTORS.matthew.clips.idle);
    }
    this.matthew?.update(step);
    this.aurora?.update(step);
  }

  dispose(): void {
    this.matthew?.dispose();
    this.aurora?.dispose();
    this.bundle?.dispose(BOSS_ACTORS.matthew.url);
    this.bundle?.dispose(BOSS_ACTORS.aurora.url);
    this.bundle = null;
    this.root.removeFromParent();
  }
}
