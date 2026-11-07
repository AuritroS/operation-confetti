import {
  BoxGeometry, Color, FogExp2, Group,
  DirectionalLight,
  InstancedMesh, Mesh, MeshBasicMaterial, MeshStandardMaterial,
  Object3D, OctahedronGeometry, PlaneGeometry, Vector2, Vector3,
} from 'three';
import { Stage } from './stage';
import type { RendererHost } from './renderer-host';
import { GATE_GAP } from './look';
import { SkylineCamera } from './skyline-camera';

/** How long the arrival shot takes to settle. The level holds at least this long. */
export const ARRIVAL_SHOT_S = 2.0;
/** Fall rate after the line, in u/s². Brisk: a drop, not a float. */
const FALL_GRAVITY = 34;
import { SkylineStreet } from './skyline-street';
import { SkylineBoxes, SHOW_BOXES } from './skyline-boxes';
import { INSPECTING, InspectLabels } from './skyline-inspect';
import { SkyLayer } from './environment/sky';
import { buildCnTower, buildMoon, buildStreetGate } from './custom';
import { FACADE_X } from '../levels/skyline/scene';
import { MOON } from './look';
import { GiftGlowField, shadowTexture } from './effects';
import { PALETTE } from './palette';
import { darken, disposeTree, unfog } from './environment/skyline';
import type { EnvironmentLayer } from './environment/layer';
import type { StreetAssets } from './skyline-assets';
import { CAMERA_FAR, CAMERA_NEAR, ENTITY_DRAW_AHEAD, FOG_DENSITY } from './skyline-view';
import { ObstacleKit } from './skyline-obstacles';
import type { SkylineHero } from './skyline-hero';
import { SkylineRope } from './skyline-rope';
import { LANES } from '../levels/skyline/types';
import { BAY, LAND_TIME, ROUTE_LENGTH } from '../levels/skyline/config';
import type { Course, Point3, Snapshot } from '../levels/skyline/types';

/** Anchor markers drawn at once, across all three state pools. */
const ANCHOR_POOL = 36;

/** Shared with the asset probe so the landmark uses the actual game model. */
export function buildSkylineLandmark(): Group {
  const landmark = new Group();
  const tower = buildCnTower(78);
  tower.position.set(-19, -2, -150);
  darken(tower, 0.45);
  unfog(tower);
  landmark.add(tower);

  // The Toronto night moon, framed high above the Queen West canyon
  const moon = buildMoon(MOON.skyline.size);
  moon.position.set(MOON.skyline.x, MOON.skyline.y, MOON.skyline.z);
  unfog(moon);
  landmark.add(moon);

  return landmark;
}

export class SkylineScene {
  readonly stage: Stage;
  private camera: SkylineCamera;
  private root = new Group();
  private hero = new Group();
  private torso = new Group();
  private arms: Group[] = [];
  private legs: Group[] = [];
  private box = new BoxGeometry();
  private diamond = new OctahedronGeometry(0.25);
  private city = new MeshStandardMaterial({ color: 0x29394e, roughness: 1 });
  private windowMat = new MeshBasicMaterial({ color: 0x547a96 });
  private groundMat = new MeshStandardMaterial({ color: 0x182337, roughness: 1 });
  private blue = new MeshStandardMaterial({ color: 0x448cfa, emissive: 0x102a59, roughness: 0.7, fog: false });
  private gold = new MeshBasicMaterial({ color: 0xe6b86a, fog: false });
  private pale = new MeshBasicMaterial({ color: 0xfff0c9, fog: false });
  private cyan = new MeshBasicMaterial({ color: 0x4aaeb8, fog: false });
  /** The level-end marker, shared with level 1. Moves with the scroll. */
  private readonly finishDoor: Group;
  private idle = new MeshBasicMaterial({ color: 0x3d4f66, transparent: true, opacity: 0.5 });
  private pink = new MeshBasicMaterial({ color: 0xff609f, fog: false });
  private darkPink = new MeshStandardMaterial({ color: 0x562b49, roughness: 0.85 });
  private blocks: InstancedMesh;
  private trims: InstancedMesh;
  /**
   * Anchor markers, as three instanced pools rather than 18 meshes.
   *
   * They share one geometry and differ only by state colour, so one mesh
   * each was 18 draw calls for 18 small diamonds — a third of the whole
   * frame's budget. Pooling by state costs three.
   */
  private anchorPools: InstancedMesh[] = [];
  private contents = new Map<string, Group>();
  private rope = new SkylineRope();
  /**
   * Where the rope was last drawn from, for the debug panel.
   *
   * Exposed because a screenshot cannot tell a line leaving the muzzle from
   * one leaving the top of his head — with an anchor overhead both land in
   * roughly the same pixels, which is how the fallback went unnoticed.
   */
  ropeOriginSource: 'muzzle' | 'hands' | 'fallback' = 'fallback';
  private dummy = new Object3D();
  private probe = new Vector3();
  private grip = new Vector3();
  private anchorAt = new Vector3();
  private latest: Snapshot | null = null;
  private latestScrollZ = 0;
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
  private boxes: SkylineBoxes | null = null;
  private labels: InspectLabels | null = null;
  /**
   * Unfogged markers, so the player can read what is coming.
   *
   * The meshes themselves fade with distance — that is the depth cue and it
   * should stay. What must not fade is the SIGNAL. Gold sparkle on a gift is
   * level 1's own language, dropped in the level 2 rebuild and restored
   * here; the rose marker does the same job for a hazard.
   */
  private giftMarks = new GiftGlowField(10, {
    color: PALETTE.gold, size: 3.2,
  });
  private markBuffer: Vector3[] = [];
  private landmark: Object3D | null = null;
  private gameplayVisible = true;
  /** Seconds into the arrival shot, or -1 while the chase is still on. */
  private arrival = -1;
  /**
   * A finish crossed in the air: he lets go and falls under the chase's own
   * gravity, lands with the landing clip and a camera dip, and the arrival
   * shot starts from the landing. On the ground at the line, none of this
   * runs and the shot starts at once.
   */
  private falling = false;
  private fallY = 0;
  private fallV = 0;
  private dip = 0;
  private playerShadow: Mesh;

  setGameplayVisible(visible: boolean): void {
    this.gameplayVisible = visible;
    this.hero.visible = visible && !this.rigged;
    if (this.rigged) this.rigged.object.visible = visible;
    this.playerShadow.visible = visible;
    this.rope.object.visible = visible && this.rope.currentPhase !== 'idle';
    this.giftMarks.group.visible = visible;
    for (const pool of this.anchorPools) pool.visible = visible;
    for (const group of this.contents.values()) group.visible = visible;
  }

  constructor(host: RendererHost, private course: Course) {
    this.stage = new Stage(host); this.camera = new SkylineCamera(this.stage.camera);
    // Review hook: lets a headless check read the hero's pose each frame.
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug')) {
      Object.assign(window, { __skyline: this });
    }
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
    /**
     * `?inspect` thins the fog and lifts the lights.
     *
     * The night palette is right for play and wrong for a contact sheet:
     * you cannot judge which way a lamp arm points if the lamp is a
     * silhouette. Review legibility beats atmosphere here.
     */
    this.stage.scene.fog = new FogExp2(0x111e32, INSPECTING ? FOG_DENSITY * 0.25 : FOG_DENSITY);
    this.stage.camera.far = CAMERA_FAR;
    this.stage.camera.near = CAMERA_NEAR;
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
    const fill = new DirectionalLight(0xbcd2ff, INSPECTING ? 3.2 : 1.25);
    fill.position.set(INSPECTING ? 30 : 3, INSPECTING ? 34 : 14, 26);
    this.fill = fill;
    this.stage.scene.add(fill);
    this.stage.scene.add(this.root); this.stage.observe();
    this.blocks = new InstancedMesh(this.box, this.city, 100);
    /*
     * The end of the street is a vault door, the same one level 1 finishes on.
     *
     * It used to be three bare trim bars framing nothing, so the chase ended
     * on an empty gap with the environment visibly running out behind it.
     * A solid door blocks the view, and reusing level 1's makes "you reach a
     * door at the end of a level" a beat the player has already learned —
     * which is also the thing a transition can fade from.
     *
     * Sized to span the canyon the trims used to frame: 24 wide, 17 tall.
     */
    // The street ends at a building: the door in a façade that spans to the
    // flanking towers and leaves the top of the frame.
    this.finishDoor = buildStreetGate(16, 13, FACADE_X + 4, 46);
    this.stage.scene.add(this.finishDoor);

    this.trims = new InstancedMesh(this.box, this.windowMat, 500);
    for (const mesh of [this.blocks, this.trims]) { mesh.frustumCulled = false; this.root.add(mesh); }
    this.ground = this.cube(this.root, this.groundMat, 0, -1, -60, 28, 2, 260);
    this.root.add(this.giftMarks.group);
    for (const layer of [new SkyLayer()]) {
      this.backdrop.push(layer);
      this.root.add(layer.object);
    }
    this.hero.add(this.torso); this.root.add(this.hero);
    // Contact drop shadow on the asphalt road surface
    const shadowGeom = new PlaneGeometry(1.6, 1.6);
    shadowGeom.rotateX(-Math.PI / 2);
    const shadowMat = new MeshBasicMaterial({
      map: shadowTexture(),
      transparent: true,
      opacity: 0.60,
      depthWrite: false,
    });
    this.playerShadow = new Mesh(shadowGeom, shadowMat);
    this.playerShadow.position.set(0, 0.008, 0);
    this.root.add(this.playerShadow);
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
    this.root.add(this.rope.object);
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
  /**
   * Arrival: the hero settles to the ground and cheers, the rope goes, the
   * vault leaf swings open, and the camera pulls back to frame him and the
   * door together. Eased over `ARRIVAL_SHOT_S`; the level holds the ending
   * at least that long.
   */
  celebrate(): void {
    const s = this.latest;
    if (s && s.p.y > this.course.groundY + 0.05) {
      this.falling = true;
      this.fallY = s.p.y;
      this.fallV = Math.min(0, s.v.y);
      return;
    }
    this.rigged?.celebrate?.();
    this.land();
  }

  /** Feet on the ground: the shot begins. The hero's own clip is already chosen. */
  private land(): void {
    this.falling = false;
    this.arrival = 0;
  }

  useHero(hero: SkylineHero): void {
    if (this.rigged) return;
    this.rigged = hero;
    this.root.add(hero.object);
    this.hero.visible = false;
    hero.object.visible = this.gameplayVisible;
  }

  useAssets(assets: StreetAssets): void {
    if (this.street) return;
    /**
     * `?inspect` swaps the layout, not the code path: the contact sheet is
     * built by the same resolver and the same street builder, so what is
     * reviewed is what ships.
     */
    this.street = new SkylineStreet(assets);
    this.root.add(this.street.object);
    if (SHOW_BOXES) {
      this.boxes = new SkylineBoxes(assets, this.street.anchors, this.course.entities);
      this.root.add(this.boxes.object);
    }
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
    const tower = buildSkylineLandmark();
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
    const crouch = landing ? 0.14 * Math.sin(Math.PI * Math.min(1, s.landingAge / LAND_TIME)) : 0;
    this.hero.position.set(s.p.x, s.p.y - crouch, 0);

    // A finish crossed in the air: fall, then land with impact.
    if (this.falling) {
      this.fallV -= FALL_GRAVITY * dt;
      this.fallY += this.fallV * dt;
      if (this.fallY <= this.course.groundY) {
        this.fallY = this.course.groundY;
        this.dip = 1;
        this.rigged?.land?.();
        this.land();
      }
      this.hero.position.y = this.fallY - crouch;
    }
    this.dip = Math.max(0, this.dip - dt / 0.35);
    this.camera.setDip(this.dip * (1 - this.dip) * 4);

    // The arrival shot's progress.
    let arrive = 0;
    if (this.arrival >= 0) {
      this.arrival += dt;
      const t = Math.min(1, this.arrival / ARRIVAL_SHOT_S);
      arrive = 1 - (1 - t) * (1 - t);
      this.hero.position.y = this.course.groundY - crouch;
      const leaf = this.finishDoor.getObjectByName('leaf');
      if (leaf) leaf.rotation.y = -1.15 * arrive;
    }
    this.camera.setArrival(arrive);
    // Past the line the snapshot is frozen; the body settles upright.
    const settled = this.falling || this.arrival >= 0;

    // Target pitch:
    // Diving forward into the ground when descending (v.y < 0): negative rotation around X (nose-down dive)
    // Soaring into the air when ascending (v.y > 0): positive rotation around X (nose-up climb)
    // Running: -0.12 (athletic forward lean)
    // Landing: -0.28 (impact crouch)
    const rawPitch = running ? -0.12 : landing ? -0.28 : Math.atan2(s.v.y, s.v.z) * 0.95;
    const targetPitch = Math.max(-0.65, Math.min(0.35, rawPitch));

    // Target yaw & roll: clamp lateral banking to avoid sudden 60-degree snap
    const rawYaw = -Math.atan2(s.v.x, s.v.z);
    const rawRoll = -Math.atan2(s.v.x, s.v.z);
    const targetYaw = Math.max(-0.28, Math.min(0.28, rawYaw * 0.45));
    const targetRoll = Math.max(-0.46, Math.min(0.46, rawRoll * 0.65))
      + (reduced ? 0 : Math.sin(s.hitAge * 35) * hit * 0.2);

    // Smooth rotational changes across frames to eliminate twitch
    const rotSmooth = 1 - Math.exp(-dt / 0.08);
    this.hero.rotation.x += ((settled ? 0 : targetPitch) - this.hero.rotation.x) * rotSmooth;
    this.hero.rotation.y += ((settled ? 0 : targetYaw) - this.hero.rotation.y) * rotSmooth;
    this.hero.rotation.z += ((settled ? 0 : targetRoll) - this.hero.rotation.z) * rotSmooth;
    this.hero.visible = this.gameplayVisible && !this.rigged;
    if (this.rigged) {
      this.rigged.object.visible = this.gameplayVisible;
      // Same transform as the stand-in, so swapping the art cannot move the
      // character relative to the colliders the runner is testing.
      this.rigged.object.position.copy(this.hero.position);
      this.rigged.object.rotation.copy(this.hero.rotation);
      this.rigged.update(s, dt, reduced);
    }
    // Update player contact drop shadow
    const altitude = Math.max(0, s.p.y - this.course.groundY);
    const shadowScale = 1.0 + Math.min(1.5, altitude * 0.12);
    const shadowOpacity = Math.max(0.12, 0.60 - altitude * 0.045);
    this.playerShadow.position.set(s.p.x, 0.008, 0);
    this.playerShadow.scale.set(shadowScale, 1, shadowScale * 1.15);
    (this.playerShadow.material as MeshBasicMaterial).opacity = shadowOpacity;
    this.playerShadow.visible = this.gameplayVisible;
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
    // ---- grapple line ----------------------------------------------------
    // The line starts at the blaster muzzle when Matthew is in, at his hands
    // if the blaster failed to load, and at a point above the stand-in's
    // shoulders if neither resolved. Which one was used is recorded rather
    // than assumed; see `ropeOriginSource`.
    const source = this.rigged?.ropeOrigin(this.grip) ?? 'none';
    if (source === 'none') {
      this.grip.set(s.p.x, s.p.y + (s.anchor?.kind === 'lower' ? 0.4 : 1), 0);
      this.ropeOriginSource = 'fallback';
    } else {
      this.ropeOriginSource = source;
    }
    const cyclePhase = (2 * Math.PI / this.course.cycle) * s.elapsed;
    const surgeZ = s.mode === 'swing'
      ? 1.35 * (Math.sin(cyclePhase) - 0.10 * (Math.cos(2 * cyclePhase) - 1))
      : s.phase === 'land'
      ? -0.15 * (1 - Math.min(1, s.landingAge / LAND_TIME))
      : 0;
    const scrollZ = s.p.z + surgeZ;
    this.latestScrollZ = scrollZ;

    const live = s.anchor && !s.complete;
    if (live) this.anchorAt.set(s.anchor!.x, s.anchor!.y, scrollZ - s.anchor!.z);
    this.rope.update(this.grip, live ? this.anchorAt : null, dt);
    if (!this.gameplayVisible || settled) this.rope.object.visible = false;
    let b = 0, w = 0;
    if (this.street) {
      this.street.update(scrollZ);
      this.boxes?.update(scrollZ);
    } else {
      // Primitive stand-in, used only until the GLBs resolve.
      const base = Math.floor(scrollZ / 20) * 20;
      for (let i = -2; i < 10; i++) {
        const z = base + i * 20;
        for (const side of [-1, 1]) {
          const h = 26 + Math.sin(z * 0.12 + side) * 7;
          this.instance(this.blocks, b++, side * 17, h / 2, scrollZ - z, 6, h, 17);
          for (let y = 4; y < h - 1; y += 4) {
            this.instance(this.trims, w++, side * 13.96, y, scrollZ - z, 0.06, 0.16, 13);
            this.instance(this.trims, w++, side * 17, y, scrollZ - z + 8.55, 4.5, 0.16, 0.06);
          }
        }
        for (const x of [-3, 3]) this.instance(this.trims, w++, x, 0.03, scrollZ - z, 0.08, 0.05, 10);
      }
    }
    /**
     * The cyan lane markers are gone.
     *
     * They were authored for the pre-rescale 6-unit lanes: offsets of +/-1.8
     * reached 113% of the way across a 3.2-unit lane, so they MISREPORTED
     * which lane was selected — and sat at y=0.06, which after the datum fix
     * floated them above the carriageway. The Kenney road carries its own
     * painted markings, so there is nothing left for them to do.
     */
    const bayPitch = this.course.duration === 45 ? BAY : this.course.cycle * this.course.speed;
    const playerBay = Math.floor(scrollZ / bayPitch);
    const targetBay = playerBay + 1;
    const activeId = s.anchor?.id;

    const anchorCounts = [0, 0, 0];
    for (let bay = Math.max(0, playerBay - 1); bay <= playerBay + 8; bay++) {
      const wireZ = bay * bayPitch;
      for (const lane of LANES) {
        const id = `anchor-${bay}-${lane}`;
        const pos = this.street?.anchors.get(id) ?? {
          x: lane * this.course.laneWidth,
          y: 17.6,
          z: wireZ,
        };
        const active = activeId === id;
        const slot = active ? 0 : bay === targetBay && lane === s.lane ? 1 : 2;
        const pool = this.anchorPools[slot];
        const n = anchorCounts[slot] ?? 0;
        if (pool && n < ANCHOR_POOL) {
          this.dummy.position.set(pos.x, pos.y, scrollZ - pos.z);
          this.dummy.rotation.set(0, 0, 0);
          this.dummy.scale.setScalar(active ? 1.1 : 0.75);
          this.dummy.updateMatrix();
          pool.setMatrixAt(n, this.dummy.matrix);
          anchorCounts[slot] = n + 1;
        }
      }
    }
    if (s.anchor && s.anchor.kind === 'lower') {
      const pool = this.anchorPools[0];
      const n = anchorCounts[0] ?? 0;
      if (pool && n < ANCHOR_POOL) {
        this.dummy.position.set(s.anchor.x, s.anchor.y, scrollZ - s.anchor.z);
        this.dummy.rotation.set(0, 0, 0);
        this.dummy.scale.setScalar(1.2);
        this.dummy.updateMatrix();
        pool.setMatrixAt(n, this.dummy.matrix);
        anchorCounts[0] = n + 1;
      }
    }
    this.anchorPools.forEach((pool, i) => {
      pool.count = anchorCounts[i] ?? 0;
      pool.instanceMatrix.needsUpdate = true;
    });
    const finish = scrollZ - (this.course.duration === 45 ? ROUTE_LENGTH : this.course.duration * this.course.speed);
    // Well short of the endpoint, so he arrives in front of the gate with
    // room to celebrate, and so the run-up never puts the door face across
    // the whole frame: at 26 units wide it fills a 12.5-unit camera stand-off
    // from six units away.
    this.finishDoor.position.z = finish - GATE_GAP * 2;
    for (const [mesh, count] of [[this.blocks, b], [this.trims, w]] as const) {
      mesh.count = count; mesh.instanceMatrix.needsUpdate = true;
    }
    this.visibleEntities.clear();
    const giftAt: Vector3[] = [];
    for (const e of this.course.entities) {
      const mesh = this.contents.get(e.id)!;
      mesh.visible = !states.has(e.id) && e.z > scrollZ - 3 && e.z < scrollZ + ENTITY_DRAW_AHEAD;
      mesh.position.set(e.x, e.y, scrollZ - e.z);
      if (mesh.visible) {
        this.visibleEntities.add(e.id);
        if (e.kind === 'gift') {
          const marker = this.markBuffer[giftAt.length] ??= new Vector3();
          marker.set(e.x, e.y, scrollZ - e.z);
          giftAt.push(marker);
        }
      }
      // Gift bounds stay aligned with the visible box; no rotating collider mismatch.
    }
    this.giftMarks.setAnchors(giftAt);
    this.giftMarks.update(dt);
    if (!this.gameplayVisible) {
      this.giftMarks.group.visible = false;
      for (const pool of this.anchorPools) pool.visible = false;
      for (const mesh of this.contents.values()) mesh.visible = false;
      this.rope.object.visible = false;
    }
    for (const layer of this.backdrop) layer.update(scrollZ, dt);
    this.camera.update(s, dt, reduced);
  }
  framing() {
    const s = this.latest;
    const project = (p: Point3) => this.probe.set(p.x, p.y, (s ? this.latestScrollZ : 0) - p.z).project(this.stage.camera).toArray();
    return { player: s ? project(s.p) : [], anchor: s?.anchor ? project(s.anchor) : null,
      entities: this.course.entities.filter((e) => this.visibleEntities.has(e.id)).map((e) => ({ id: e.id, point: project(e) })),
      draws: this.stage.drawCalls, triangles: this.stage.triangles };
  }
  render(): void {
    if (this.labels) {
      const size = this.stage.renderer.getSize(new Vector2());
      this.labels.update(this.stage.camera, size.x, size.y, this.street?.object.position.z ?? 0);
    }
    this.stage.render();
  }
  reset(): void {
    this.arrival = -1;
    this.falling = false;
    this.dip = 0;
    this.rigged?.reset?.();
    const leaf = this.finishDoor.getObjectByName('leaf');
    if (leaf) leaf.rotation.y = 0;
    this.camera.reset();
    this.rope.reset();
  }
  dispose(): void {
    this.root.removeFromParent(); this.box.dispose(); this.diamond.dispose();
    this.rope.dispose();
    for (const m of [this.city, this.windowMat, this.groundMat, this.blue, this.gold, this.pale, this.cyan, this.idle, this.pink, this.darkPink]) m.dispose();
    for (const m of [this.blocks, this.trims, ...this.anchorPools]) m.dispose();
    this.fill.removeFromParent();
    this.fill.dispose();
    this.street?.dispose();
    this.boxes?.dispose();
    this.labels?.dispose();
    this.giftMarks.dispose();
    this.playerShadow.geometry.dispose();
    (this.playerShadow.material as MeshBasicMaterial).dispose();
    this.playerShadow.removeFromParent();
    if (this.landmark) disposeTree([this.landmark]);
    this.rigged?.dispose();
    for (const layer of this.backdrop) layer.dispose();
    this.backdrop.length = 0;
    this.stage.dispose();
  }
}
