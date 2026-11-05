import {
  AmbientLight, Color, DirectionalLight, Group, HemisphereLight,
  InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PointLight, Scene,
  BoxGeometry, DoubleSide, WebGLRenderer, ACESFilmicToneMapping,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { BOSS_PROPS } from '../../assets/boss/catalog';
import type { BossPractice } from '../../levels/boss/practice';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import { BossCamera } from './camera';
import { BossEnvironment } from './environment';
import { BossActors } from './actors';
import { BossSky } from './sky';
import { BossMagic } from './magic';

export class BossScene {
  readonly camera = new BossCamera();
  readonly world = new Scene();
  readonly environment = new BossEnvironment();
  readonly actors = new BossActors();
  readonly sky = new BossSky();
  readonly magic = new BossMagic();
  readonly renderer: WebGLRenderer;
  private readonly shots: Group[] = [];
  private readonly confetti: InstancedMesh;
  private confettiTime = 0;
  private lastHits = 0;
  private width = 0;
  private height = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.25;
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
    const bossLight = new PointLight(0x9c45df, 7, 8);
    bossLight.position.set(-0.8, 3.2, BOSS_LAYOUT.bossZ - 1.2);
    this.world.add(bossLight);
    const deckLight = new PointLight(0xffbb77, 4, 9);
    deckLight.position.set(-3.8, 3.2, 1.5);
    this.world.add(deckLight);
    this.world.add(this.sky.root, this.environment.root, this.actors.root, this.magic.root);

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
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    const selected = BOSS_PROPS.filter((item) => ['decorGiftRed', 'decorGiftGreen'].includes(item.id));
    const [models] = await Promise.all([
      Promise.all(selected.map(async (item) => [item.id, (await loader.loadAsync(item.url)).scene] as const)),
      this.actors.load(),
    ]);
    this.environment.addProps(new Map(models), BOSS_PROPS);
  }

  update(game: BossPractice, step: number): void {
    this.sky.update(step);
    this.environment.update(step);
    this.magic.update(step, this.environment.cake.position.y);
    this.actors.update(game, step);
    for (let i = 0; i < this.shots.length; i++) {
      const mesh = this.shots[i]!;
      const shot = game.activeShots[i];
      mesh.visible = !!shot;
      if (!shot) continue;
      const t = shot.progress;
      const startX = BOSS_LAYOUT.laneCentres[shot.lane]!;
      mesh.position.set(startX * (1 - t), 1.2 + t * 2.05 + Math.sin(t * Math.PI) * 0.42, BOSS_LAYOUT.playerZ - t * (BOSS_LAYOUT.playerZ - BOSS_LAYOUT.bossZ));
      mesh.rotation.z += step * 8;
    }
    if (game.hitCount !== this.lastHits) {
      this.lastHits = game.hitCount;
      this.confettiTime = 0.65;
    }
    if (this.confettiTime > 0) {
      this.confettiTime = Math.max(0, this.confettiTime - step);
      const progress = 1 - this.confettiTime / 0.65;
      const matrix = new Matrix4();
      for (let i = 0; i < 24; i++) {
        const angle = i * 2.39996;
        const radius = 0.16 + progress * (0.45 + (i % 4) * 0.13);
        matrix.makeRotationZ(angle + progress * 3);
        matrix.setPosition(Math.cos(angle) * radius, 3.25 + Math.sin(angle) * radius - progress * 0.2, BOSS_LAYOUT.bossZ + 0.45);
        this.confetti.setMatrixAt(i, matrix);
      }
      this.confetti.instanceMatrix.needsUpdate = true;
      this.confetti.visible = true;
    } else {
      this.confetti.visible = false;
    }
  }

  render(): void {
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.renderer.setSize(width, height, false);
      this.camera.resize(width, height);
    }
    this.renderer.render(this.world, this.camera.camera);
  }

  get drawCalls(): number { return this.renderer.info.render.calls; }
  get triangles(): number { return this.renderer.info.render.triangles; }
  dispose(): void {
    this.actors.dispose();
    this.sky.dispose();
    this.magic.dispose();
    this.renderer.dispose();
  }
}
