import { Box3, CircleGeometry, Group, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { AssetBundle, type Actor } from '../../assets/characters';
import { BOSS_ACTORS, BOSS_ANIMATION_LIBRARIES, BOSS_CANNON_MOUNT, BOSS_PROPS } from '../../assets/boss/catalog';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import { buildCrown } from '../custom';
import type { BossPractice } from '../../levels/boss/practice';

function fitActor(actor: Actor, targetHeight: number): void {
  const root = actor.root;
  const original = new Box3().setFromObject(root);
  root.scale.setScalar(targetHeight / Math.max(0.001, original.getSize(new Vector3()).y));
  const fitted = new Box3().setFromObject(root);
  root.position.y -= fitted.min.y;
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
    const crown = buildCrown(0.22);
    crown.position.y = 0.42;
    aurora.attach('head', crown);
    const bossHolder = new Group();
    bossHolder.position.set(0, BOSS_LAYOUT.bossStageY + 0.08, BOSS_LAYOUT.bossZ);
    // A slight forward lean aims her crown and shoulders down the runway.
    bossHolder.rotation.x = 0.065;
    bossHolder.add(aurora.root);
    this.root.add(bossHolder);

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
    this.matthewHolder.position.set(game.renderX, 0.08, BOSS_LAYOUT.playerZ);
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
