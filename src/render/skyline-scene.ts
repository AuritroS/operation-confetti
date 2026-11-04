import {
  BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, FogExp2, Group,
  DirectionalLight,
  InstancedMesh, Line, LineBasicMaterial, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, OctahedronGeometry, Vector3,
} from 'three';
import { Stage } from './stage';
import { SkylineCamera } from './skyline-camera';
import { SkylineStreet } from './skyline-street';
import { SkyLayer } from './environment/sky';
import { buildCnTower } from './custom';
import { darken, disposeTree, unfog } from './environment/skyline';
import type { EnvironmentLayer } from './environment/layer';
import type { StreetAssets } from './skyline-assets';
import { CAMERA_FAR, FOG_DENSITY } from './skyline-view';
import { ObstacleKit } from './skyline-obstacles';
import type { SkylineHero } from './skyline-hero';
import { upperAnchor } from '../levels/skyline/motion';
import { LANES } from '../levels/skyline/types';
import type { Course, Point3, Snapshot } from '../levels/skyline/types';

/** Anchor markers drawn at once, across all three state pools. */
const ANCHOR_POOL = 18;

export class SkylineScene {
  readonly stage: Stage;
  private camera: SkylineCamera;
  private root = new Group();
  private hero = new Group();
  private torso = new Group();
  private arms: Group[] = [];
  private legs: Group[] = [];
  private box = new BoxGeometry();
  private diamond = new OctahedronGeometry(0.55);
  private city = new MeshStandardMaterial({ color: 0x29394e, roughness: 1 });
  private windowMat = new MeshBasicMaterial({ color: 0x547a96 });
  private groundMat = new MeshStandardMaterial({ color: 0x182337, roughness: 1 });
  private blue = new MeshStandardMaterial({ color: 0x448cfa, emissive: 0x102a59, roughness: 0.7, fog: false });
  private gold = new MeshBasicMaterial({ color: 0xffcd78, fog: false });
  private pale = new MeshBasicMaterial({ color: 0xfff0c9, fog: false });
  private cyan = new MeshBasicMaterial({ color: 0x7ce6ee, fog: false });
  private idle = new MeshBasicMaterial({ color: 0x54738b });
  private pink = new MeshBasicMaterial({ color: 0xff609f, fog: false });
  private darkPink = new MeshStandardMaterial({ color: 0x562b49, roughness: 0.85 });
  private blocks: InstancedMesh;
  private trims: InstancedMesh;
  private runway: InstancedMesh;
  /**
   * Anchor markers, as three instanced pools rather than 18 meshes.
   *
   * They share one geometry and differ only by state colour, so one mesh
   * each was 18 draw calls for 18 small diamonds — a third of the whole
   * frame's budget. Pooling by state costs three.
   */
  private anchorPools: InstancedMesh[] = [];
  private contents = new Map<string, Group>();
  private cable: Line;
  private dummy = new Object3D();
  private probe = new Vector3();
  private grip = new Vector3();
  private latest: Snapshot | null = null;
  private visibleEntities = new Set<string>();
  /** Null until the street assets land; the primitives stand in until then. */
  private street: SkylineStreet | null = null;
  /** Null until Matthew lands; the box stand-in runs until then. */
  private rigged: SkylineHero | null = null;
  private ground: Mesh;
  /**
   * Sky comes straight from level 1: no constructor arguments, no corridor
   * geometry, and a gradient-plus-moon that reads correctly at any scale.
   *
   * Clouds and the skyline band are deliberately NOT reused. Clouds author a
   * low band at y -5.5 for a rooftop, which in a street canyon is below the
   * road; the skyline band would drag level 1's unit scale in here and the
   * canyon walls occlude it anyway.
   */
  private backdrop: EnvironmentLayer[] = [];
  private fill: DirectionalLight;
  private kit: ObstacleKit | null = null;
  /** Anchor gantries, instanced: one per visible anchor. */
  private gantries: InstancedMesh | null = null;
  private landmark: Object3D | null = null;

  constructor(canvas: HTMLCanvasElement, private course: Course) {
    this.stage = new Stage(canvas); this.camera = new SkylineCamera(this.stage.camera);
    this.stage.scene.background = new Color(0x111e32);
    /**
     * Thinner fog than level 1, and a further clip plane.
     *
     * Both of level 1's values assume its camera, which sits just behind the
     * player's shoulder. Level 2's sits 36 units back, so at 0.012 the hero
     * himself was 35% fogged before anything else was considered and he read
     * as a silhouette. 0.0085 still buries the far seam — 150 units ahead is
     * 72% fogged — without draining the thing the player is watching.
     *
     * The default 160 far plane cut the street at 124 units ahead, inside
     * the fog's reach, so the clip edge was visible. 230 puts it past where
     * anything is drawn.
     */
    this.stage.scene.fog = new FogExp2(0x111e32, FOG_DENSITY);
    this.stage.camera.far = CAMERA_FAR;
    this.stage.camera.updateProjectionMatrix();

    /**
     * Camera-side fill.
     *
     * The shared rig has a warm key and a strong blue rim, both aimed from
     * in FRONT of a character who runs away from the lens — so the side the
     * player actually sees gets only the hemisphere term. Level 1 gets away
     * with it because its camera is close; here it made Matthew a cut-out.
     * Local to this scene, so level 1's lighting is untouched.
     */
    const fill = new DirectionalLight(0xbcd2ff, 1.25);
    fill.position.set(3, 14, 26);
    this.fill = fill;
    this.stage.scene.add(fill);
    this.stage.scene.add(this.root); this.stage.observe();
    this.blocks = new InstancedMesh(this.box, this.city, 100);
    this.trims = new InstancedMesh(this.box, this.windowMat, 500);
    this.runway = new InstancedMesh(this.box, this.cyan, 100);
    for (const mesh of [this.blocks, this.trims, this.runway]) { mesh.frustumCulled = false; this.root.add(mesh); }
    this.ground = this.cube(this.root, this.groundMat, 0, -1, -60, 28, 2, 260);
    for (const layer of [new SkyLayer()]) {
      this.backdrop.push(layer);
      this.root.add(layer.object);
    }
    this.hero.add(this.torso); this.root.add(this.hero);
    this.cube(this.torso, this.blue, 0, 0.1, 0, 0.75, 0.9, 0.45);
    this.cube(this.torso, this.blue, 0, 0.87, 0, 0.5, 0.55, 0.5);
    this.cube(this.torso, this.gold, 0, 0.85, -0.26, 0.42, 0.13, 0.04);
    this.cube(this.torso, this.gold, 0, -0.23, 0.25, 0.65, 0.14, 0.07);
    for (const side of [-1, 1]) {
      const arm = new Group(); arm.position.set(side * 0.48, 0.45, 0);
      this.cube(arm, this.blue, 0, -0.35, 0, 0.23, 0.7, 0.25);
      this.cube(arm, this.gold, 0, -0.74, 0, 0.23, 0.18, 0.25);
      this.torso.add(arm); this.arms.push(arm);
      const leg = new Group(); leg.position.set(side * 0.22, -0.35, 0);
      this.cube(leg, this.blue, 0, -0.37, 0, 0.28, 0.75, 0.3);
      this.cube(leg, this.blue, 0, -0.8, -0.1, 0.29, 0.18, 0.45);
      this.hero.add(leg); this.legs.push(leg);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(new Float32Array(6), 3));
    this.cable = new Line(geometry, new LineBasicMaterial({ color: 0xffefc3, fog: false }));
    this.cable.frustumCulled = false; this.root.add(this.cable);
    for (const material of [this.gold, this.cyan, this.idle]) {
      const pool = new InstancedMesh(this.diamond, material, ANCHOR_POOL);
      pool.frustumCulled = false;
      this.anchorPools.push(pool);
      this.root.add(pool);
    }
    for (const e of course.entities) {
      const group = new Group();
      if (e.kind === 'gift') {
        this.cube(group, this.gold, 0, 0, 0, 1.4, 1.4, 1.4);
        this.cube(group, this.pale, 0, 0, 0, 0.22, 1.45, 1.45);
        this.cube(group, this.pale, 0, 0, 0, 1.45, 0.22, 1.45);
      } else {
        this.cube(group, this.darkPink, 0, 0, 0, e.halfX * 2, e.halfY * 2, e.halfZ * 2);
        for (const side of [-1, 1]) {
          this.cube(group, this.pink, side * e.halfX, 0, e.halfZ + 0.01, 0.12, e.halfY * 2, 0.1);
          this.cube(group, this.pink, 0, side * e.halfY, e.halfZ + 0.01, e.halfX * 2, 0.12, 0.1);
        }
      }
      this.contents.set(e.id, group); this.root.add(group);
    }
  }
  private cube(parent: Group, material: MeshBasicMaterial | MeshStandardMaterial,
    x: number, y: number, z: number, sx: number, sy: number, sz: number): Mesh {
    const mesh = new Mesh(this.box, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    parent.add(mesh); return mesh;
  }
  private instance(mesh: InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    this.dummy.position.set(x, y, z); this.dummy.scale.set(sx, sy, sz); this.dummy.updateMatrix(); mesh.setMatrixAt(i, this.dummy.matrix);
  }
  /**
   * Swap the primitive canyon for the real street.
   *
   * Called once, after the GLBs resolve. Deliberately NOT awaited by the
   * constructor: play starts on the primitives and upgrades in place, so a
   * slow or failed asset load degrades to a playable level instead of a
   * stalled screen. Level 1 makes the same promise about the Rogue.
   */
  /**
   * Swap the box stand-in for Matthew.
   *
   * The stand-in is hidden rather than removed: it is what the level falls
   * back to, and a failed reload should not leave an empty street.
   */
  useHero(hero: SkylineHero): void {
    if (this.rigged) return;
    this.rigged = hero;
    this.root.add(hero.object);
    this.hero.visible = false;
  }

  useAssets(assets: StreetAssets): void {
    if (this.street) return;
    this.street = new SkylineStreet(assets);
    this.root.add(this.street.object);
    // The flat box floor and the instanced blocks were standing in for the
    // road and the canyon. Both are now real, so retire the stand-ins rather
    // than leaving them to z-fight with what replaced them.
    this.ground.visible = false;

    /**
     * Swap each entity's primitive for its built form, IN PLACE.
     *
     * The group itself is kept and only its children are replaced, because
     * the frame loop holds these groups by id and positions them every
     * frame. Rebuilding the map here would silently detach the visuals from
     * the entities the runner is resolving.
     */
    this.kit = new ObstacleKit(assets);

    // Anchor gantries: a carrier spanning the street at the anchor line, so
    // the cable the player grabs has a visible reason to be strung there.
    this.gantries = assets.batch('anchorSpan', ANCHOR_POOL);
    if (this.gantries) this.root.add(this.gantries);

    /**
     * The CN Tower, ahead down the street.
     *
     * Continuity with level 1, which already builds it for its skyline, and
     * a destination: the chase is running toward something rather than along
     * a corridor. Unfogged and far back, so it reads as distance rather than
     * as scenery the player might hit.
     */
    // Inside the far plane: at 150 units ahead the camera is ~168 away, and
    // CAMERA_FAR is 180. The first attempt put it at -1150 where it was
    // clipped entirely and simply never appeared.
    const tower = buildCnTower(74);
    tower.position.set(-27, -11, -150);
    darken(tower, 0.45);
    unfog(tower);
    this.landmark = tower;
    this.root.add(tower);
    for (const e of this.course.entities) {
      const group = this.contents.get(e.id);
      if (!group) continue;
      const built = e.kind === 'gift' ? this.kit.gift(e) : this.kit.hazard(e);
      if (!built) continue;
      group.clear();
      group.add(built);
    }
  }

  update(s: Snapshot, dt: number, reduced: boolean, states: ReadonlyMap<string, 'collected' | 'hit' | 'missed'>): void {
    this.latest = s;
    const running = s.phase === 'run';
    const landing = s.phase === 'land';
    const stride = running ? Math.sin(s.elapsed * 18) : 0;
    const hit = Math.max(0, 1 - s.hitAge / 0.4);
    const crouch = landing ? 0.14 * Math.sin(Math.PI * Math.min(1, s.landingAge / 0.28)) : 0;
    this.hero.position.set(s.p.x, s.p.y - crouch, 0);
    this.hero.rotation.set(running ? -0.12 : -Math.atan2(s.v.y, s.v.z) * 0.65,
      -Math.atan2(s.v.x, s.v.z) * 0.55, -Math.atan2(s.v.x, s.v.z) * 0.5 + (reduced ? 0 : Math.sin(s.hitAge * 35) * hit * 0.2));
    if (this.rigged) {
      // Same transform as the stand-in, so swapping the art cannot move the
      // character relative to the colliders the runner is testing.
      this.rigged.object.position.copy(this.hero.position);
      this.rigged.object.rotation.copy(this.hero.rotation);
      this.rigged.update(s, dt, reduced);
    }
    this.torso.rotation.x = landing ? -0.35 : hit * 0.3;
    this.blue.emissive.setHex(s.protection > 0 ? 0x50324d : 0x102a59);
    this.arms.forEach((arm, i) => {
      const side = i === 0 ? -1 : 1;
      arm.rotation.set(running ? stride * side * 0.7 : s.anchor?.kind === 'lower' ? -1.3 : s.anchor ? -2.7 : -0.7,
        0, running ? side * 0.1 : side * 0.35);
    });
    this.legs.forEach((leg, i) => {
      leg.rotation.set(running ? stride * (i === 0 ? 1 : -1) * 0.8 : landing ? 0.55 : 0.25 + i * 0.18,
        0, running ? 0 : (i === 0 ? -0.12 : 0.12));
    });
    this.cable.visible = !!s.anchor && !s.complete;
    if (s.anchor) {
      const attr = this.cable.geometry.getAttribute('position');
      // Start at the HANDS when the rigged model is in, not at a point above
      // the head. The stand-in had no hands to speak of, so a fixed offset
      // was fine; with a real rig the cable visibly missed his grip, which
      // is the one detail that says whether he is holding on or falling.
      if (this.rigged?.gripPoint(this.grip)) {
        attr.setXYZ(0, this.grip.x, this.grip.y, this.grip.z);
      } else {
        attr.setXYZ(0, s.p.x, s.p.y + (s.anchor.kind === 'lower' ? 0.4 : 1), 0);
      }
      attr.setXYZ(1, s.anchor.x, s.anchor.y, s.p.z - s.anchor.z); attr.needsUpdate = true;
    }
    let b = 0, w = 0, r = 0;
    if (this.street) {
      this.street.update(s.p.z, this.camera.position.z);
    } else {
      // Primitive stand-in, used only until the GLBs resolve.
      const base = Math.floor(s.p.z / 20) * 20;
      for (let i = -2; i < 10; i++) {
        const z = base + i * 20;
        for (const side of [-1, 1]) {
          const h = 26 + Math.sin(z * 0.12 + side) * 7;
          this.instance(this.blocks, b++, side * 17, h / 2, s.p.z - z, 6, h, 17);
          for (let y = 4; y < h - 1; y += 4) {
            this.instance(this.trims, w++, side * 13.96, y, s.p.z - z, 0.06, 0.16, 13);
            this.instance(this.trims, w++, side * 17, y, s.p.z - z + 8.55, 4.5, 0.16, 0.06);
          }
        }
        for (const x of [-3, 3]) this.instance(this.trims, w++, x, 0.03, s.p.z - z, 0.08, 0.05, 10);
      }
    }
    // All lanes have a continuous street; illuminate the selected running route.
    if (s.requestedMode === 'run' || s.mode === 'run') for (let i = -2; i < 19; i++) {
      const z = Math.floor(s.p.z / 6) * 6 + i * 6;
      for (const offset of [-1.8, 1.8]) this.instance(this.runway, r++, s.lane * this.course.laneWidth + offset,
        0.06, s.p.z - z, 0.12, 0.06, 2.5);
    }
    const cycle = Math.floor(s.elapsed / this.course.cycle);
    const list = [
      ...(s.anchor ? [s.anchor] : []),
      ...Array.from({ length: 5 }, (_, i) => LANES.map((lane) => upperAnchor(this.course, lane, cycle + i))).flat(),
    ].filter((a, i, all) => all.findIndex((b) => b.id === a.id) === i && a.z > s.p.z - 22 && a.z < s.p.z + 150);
    const anchorCounts = [0, 0, 0];
    let gantryCount = 0;
    list.slice(0, ANCHOR_POOL).forEach((a) => {
      const active = a.id === s.anchor?.id;
      // 0 gold (attached), 1 cyan (reachable, same lane), 2 idle.
      const slot = active ? 0 : a.lane === s.lane ? 1 : 2;
      const pool = this.anchorPools[slot];
      const n = anchorCounts[slot] ?? 0;
      if (pool) {
        this.dummy.position.set(a.x, a.y, s.p.z - a.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(active ? 1.2 : 0.8);
        this.dummy.updateMatrix();
        pool.setMatrixAt(n, this.dummy.matrix);
        anchorCounts[slot] = n + 1;
      }
      // One gantry per anchor line, centred: the carrier spans every lane,
      // so the three lane anchors share a single prop rather than each
      // sprouting its own bar.
      if (a.kind !== 'lower' && a.lane === 0 && this.gantries && gantryCount < ANCHOR_POOL) {
        this.dummy.position.set(0, a.y, s.p.z - a.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1);
        this.dummy.updateMatrix();
        this.gantries.setMatrixAt(gantryCount++, this.dummy.matrix);
      } else if (!this.street && a.kind === 'lower') {
        // Primitive stand-in only; the road itself marks the low route once
        // the real street is in.
        this.instance(this.blocks, b++, a.x, 0.25, s.p.z - a.z, 1.5, 0.5, 1.5);
      }
    });
    this.anchorPools.forEach((pool, i) => {
      pool.count = anchorCounts[i] ?? 0;
      pool.instanceMatrix.needsUpdate = true;
    });
    if (this.gantries) {
      this.gantries.count = gantryCount;
      this.gantries.instanceMatrix.needsUpdate = true;
    }
    const finish = s.p.z - this.course.duration * this.course.speed;
    this.instance(this.trims, w++, 0, 17, finish, 24, 0.5, 0.5);
    for (const side of [-1, 1]) this.instance(this.trims, w++, side * 12, 8.5, finish, 0.5, 17, 0.5);
    for (const [mesh, count] of [[this.blocks, b], [this.trims, w], [this.runway, r]] as const) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
    }
    this.visibleEntities.clear();
    for (const e of this.course.entities) {
      const mesh = this.contents.get(e.id)!;
      mesh.visible = !states.has(e.id) && e.z > s.p.z - 3 && e.z < s.p.z + 135;
      mesh.position.set(e.x, e.y, s.p.z - e.z);
      if (mesh.visible) this.visibleEntities.add(e.id);
      // Gift bounds stay aligned with the visible box; no rotating collider mismatch.
    }
    for (const layer of this.backdrop) layer.update(s.p.z, dt);
    this.camera.update(s, dt, reduced);
  }
  framing() {
    const s = this.latest;
    const project = (p: Point3) => this.probe.set(p.x, p.y, (s?.p.z ?? 0) - p.z).project(this.stage.camera).toArray();
    return { player: s ? project(s.p) : [], anchor: s?.anchor ? project(s.anchor) : null,
      entities: this.course.entities.filter((e) => this.visibleEntities.has(e.id)).map((e) => ({ id: e.id, point: project(e) })),
      draws: this.stage.drawCalls, triangles: this.stage.triangles };
  }
  render(): void { this.stage.render(); }
  reset(): void { this.camera.reset(); }
  dispose(): void {
    this.root.removeFromParent(); this.box.dispose(); this.diamond.dispose();
    this.cable.geometry.dispose(); (this.cable.material as LineBasicMaterial).dispose();
    for (const m of [this.city, this.windowMat, this.groundMat, this.blue, this.gold, this.pale, this.cyan, this.idle, this.pink, this.darkPink]) m.dispose();
    for (const m of [this.blocks, this.trims, this.runway, ...this.anchorPools]) m.dispose();
    this.fill.removeFromParent();
    this.fill.dispose();
    this.street?.dispose();
    this.gantries?.dispose();
    if (this.landmark) disposeTree([this.landmark]);
    this.rigged?.dispose();
    for (const layer of this.backdrop) layer.dispose();
    this.backdrop.length = 0;
    this.stage.dispose();
  }
}
