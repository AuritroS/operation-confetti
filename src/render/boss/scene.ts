import {
  AmbientLight, Color, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PointLight, Scene,
  BoxGeometry, DoubleSide, ACESFilmicToneMapping, NoToneMapping,
} from 'three';
import type { RendererHost } from '../renderer-host';
import type { BossPractice } from '../../levels/boss/practice';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import { BossCamera } from './camera';
import { BossEnvironment } from './environment';
import { BossActors } from './actors';
import { BossSky } from './sky';
import { BossMagic } from './magic';
import { BossCelebration } from './celebration';
import { BossEffects } from './effects';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BOSS_PROPS } from '../../assets/boss/catalog';
import type { BossCues } from '../../levels/boss/telegraph';
import { IDLE_CUES } from '../../levels/boss/telegraph';
import { AURORA_TORSO } from './targets';

export class BossScene {
  readonly camera = new BossCamera();
  readonly world = new Scene();
  readonly environment = new BossEnvironment();
  readonly actors = new BossActors();
  readonly sky = new BossSky();
  readonly magic = new BossMagic();
  readonly effects: BossEffects;
  private readonly celebration = new BossCelebration();
  private readonly bossLight: PointLight;
  private readonly shots: Group[] = [];
  private readonly confetti: InstancedMesh;
  private confettiTime = 0;
  private lastHits = 0;
  private unobserve: (() => void) | null = null;

  constructor(private readonly host: RendererHost) {
    // Tone mapping is renderer state, not scene state, and levels 1 and 2 do
    // not want it. Applied on mount and undone in dispose, so the shared
    // renderer goes back the way it was found.
    this.host.renderer.toneMapping = ACESFilmicToneMapping;
    this.host.renderer.toneMappingExposure = 1.25;
    this.world.background = new Color(0x081329);
    this.world.add(new HemisphereLight(0x8aa7ef, 0x271435, 1.5));
    this.world.add(new AmbientLight(0xffffff, 0.35));
    const key = new DirectionalLight(0xffc78a, 2.8);
    key.position.set(-4, 9, 6);
    this.world.add(key);
    const rim = new DirectionalLight(0x9561c9, 2.0);
    rim.position.set(3, 7, -8);
    this.world.add(rim);
    const cakeLight = new PointLight(0xffb765, 8, 8);
    cakeLight.position.set(BOSS_LAYOUT.cakeX, 3.5, BOSS_LAYOUT.cakeZ + 0.6);
    this.world.add(cakeLight);
    this.bossLight = new PointLight(0x9c45df, 7, 8);
    this.bossLight.position.set(-0.8, 3.2, BOSS_LAYOUT.bossZ - 1.2);
    this.world.add(this.bossLight);
    const deckLight = new PointLight(0xffbb77, 4, 9);
    deckLight.position.set(-3.8, 3.2, 1.5);
    this.world.add(deckLight);
    this.effects = new BossEffects(this.environment.cake);
    this.world.add(this.sky.root, this.environment.root, this.actors.root, this.magic.root, this.effects.root, this.celebration.mesh);

    for (let i = 0; i < 4; i++) {
      const group = new Group();
      const colors = [0xffd069, 0xe479ae, 0x8fd3f7, 0xf9ee9f];
      for (let j = 0; j < 4; j++) {
        const spark = new Mesh(new BoxGeometry(0.09, 0.16, 0.03), new MeshBasicMaterial({ color: colors[j]! }));
        spark.position.set((j - 1.5) * 0.1, Math.sin(j * 2) * 0.09, 0);
        spark.rotation.z = j * 0.62;
        group.add(spark);
      }
      group.visible = false;
      this.shots.push(group);
      this.world.add(group);
    }
    const pieces = new InstancedMesh(new BoxGeometry(0.08, 0.11, 0.02), new MeshBasicMaterial({ color: 0xffffff, side: DoubleSide }), 24);
    const colors = [0xf9c95f, 0xe9628f, 0x74b8e7, 0xb278d1];
    for (let i = 0; i < 24; i++) pieces.setColorAt(i, new Color(colors[i % colors.length]!));
    pieces.visible = false;
    this.confetti = pieces;
    this.world.add(pieces);

    this.unobserve = this.host.onResize(this.fit);
  }

  async load(): Promise<void> {
    // Only the actors, the cannon they carry, and the scored gift come from
    // GLBs; every environment prop is procedural.
    const gift = BOSS_PROPS.find((item) => item.id === 'collectibleGift');
    const [giftModel] = await Promise.all([
      gift ? new GLTFLoader().loadAsync(gift.url) : Promise.resolve(null),
      this.actors.load(),
    ]);
    if (giftModel && gift) {
      const model = giftModel.scene;
      model.scale.setScalar(gift.targetHeight / gift.nativeHeight);
      this.effects.attachGift(model);
    }
    this.environment.addProps(new Map(), BOSS_PROPS);
  }

  update(game: BossPractice, step: number, cues: BossCues = IDLE_CUES, practiceMode = false): void {
    this.sky.update(step);
    this.environment.update(step);
    this.magic.update(step);
    this.magic.applyEnding(cues.cake);
    this.actors.update(game, step, cues);
    this.celebration.update(cues.cake);
    this.effects.update(cues, step);
    this.environment.setCakeRingStrength(cues.cake.phase === 'recovered'
      ? Math.max(0, 1 - cues.cake.progress * 1.5) : 1);
    // The exposed state gets a distinct cool light on Aurora on the exact
    // simulation phase edge, reinforcing the absent shield without a timer.
    this.bossLight.color.setHex(cues.shield.phase === 'down' ? 0x6be6c8 : 0x9c45df);
    this.bossLight.intensity = cues.shield.phase === 'down' ? 8 : 7;
    for (let i = 0; i < this.shots.length; i++) {
      const mesh = this.shots[i]!;
      const shot = game.activeShots[i];
      mesh.visible = !!shot;
      if (!shot) continue;
      const t = shot.progress;
      const startX = BOSS_LAYOUT.laneCentres[shot.lane]!;
      mesh.position.set(
        startX * (1 - t),
        1.2 + t * (AURORA_TORSO.y - 1.2) + Math.sin(t * Math.PI) * 0.42,
        BOSS_LAYOUT.playerZ + t * (AURORA_TORSO.z - BOSS_LAYOUT.playerZ),
      );
      mesh.rotation.z += step * 8;
    }
    if (game.hitCount > this.lastHits) {
      this.lastHits = game.hitCount;
      // Practice always shows target feedback. In combat a shielded shot uses
      // the shield's own block flash; only an exposed hit bursts on her torso.
      if (practiceMode || cues.shield.phase === 'down') this.confettiTime = 0.65;
    }
    if (this.confettiTime > 0) {
      this.confettiTime = Math.max(0, this.confettiTime - step);
      const progress = 1 - this.confettiTime / 0.65;
      const matrix = new Matrix4();
      for (let i = 0; i < 24; i++) {
        const angle = i * 2.39996;
        const radius = 0.16 + progress * (0.45 + (i % 4) * 0.13);
        matrix.makeRotationZ(angle + progress * 3);
        matrix.setPosition(
          AURORA_TORSO.x + Math.cos(angle) * radius,
          AURORA_TORSO.y + Math.sin(angle) * radius - progress * 0.2,
          AURORA_TORSO.z,
        );
        this.confetti.setMatrixAt(i, matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      this.confetti.visible = true;
    } else {
      this.confetti.visible = false;
    }
  }

  private readonly fit = (width: number, height: number): void => {
    this.camera.resize(width, height);
    // The victory shower spans whatever the lens actually sees, so it stays
    // full-width at 360px and on desktop rather than only where it was tuned.
    // Recomputed here because this is where fov and aspect settle.
    const lens = this.camera.camera;
    const depth = Math.abs(lens.position.z - (BOSS_LAYOUT.playerZ + 2.9) / 2);
    const halfHeight = Math.tan((lens.fov * Math.PI) / 360) * depth;
    this.celebration.setSpread(halfHeight * lens.aspect);
  };

  render(): void {
    this.host.render(this.world, this.camera.camera);
  }

  get drawCalls(): number { return this.host.drawCalls; }
  get triangles(): number { return this.host.triangles; }
  reset(): void {
    this.lastHits = 0;
    this.confettiTime = 0;
    this.confetti.visible = false;
    this.actors.reset();
    this.effects.reset();
  }
  dispose(): void {
    this.unobserve?.();
    this.unobserve = null;
    // Hand the shared renderer back in the state levels 1 and 2 expect.
    this.host.renderer.toneMapping = NoToneMapping;
    this.host.renderer.toneMappingExposure = 1;
    this.celebration.dispose();
    this.effects.dispose();
    this.actors.dispose();
    this.sky.dispose();
    this.magic.dispose();
  }
}
