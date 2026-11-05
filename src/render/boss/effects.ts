import {
  AdditiveBlending, BoxGeometry, Color, ConeGeometry, DoubleSide, Group,
  InstancedMesh, Mesh, MeshBasicMaterial, Object3D, PlaneGeometry,
  Shape, ShapeGeometry, SphereGeometry, TorusGeometry, Vector3,
} from 'three';
import { BOSS_LAYOUT } from '../../levels/boss/layout';
import type { BossCues, CakeSnapshot, OrbImpactSnapshot, OrbSnapshot, ShieldSnapshot, StrikeSnapshot } from '../../levels/boss/telegraph';
import { endingEase, escapeOffset } from './endings';
import { AURORA_TORSO, MATTHEW_ORB_IMPACT } from './targets';

/**
 * Combat presentation.
 *
 * Every view here is a pure function of the snapshot it is handed. Nothing
 * counts time for itself, so a telegraph can never drift out of step with the
 * damage it predicts, and a pause freezes the picture exactly where the
 * simulation froze.
 *
 * Shape carries the meaning, not just colour. Her ambient sigil is already
 * magenta and already glowing, and the deck is lit in her palette, so an
 * attack that differed only in hue would have to shout to be seen. Attacks are
 * hard-edged and vertical and they descend; the ambient magic is soft,
 * concentric and level. That difference survives both a small screen and a
 * player who cannot separate the two colours.
 */

const STRIKE_DEPTH = 5.4;
const STRIKE_CENTRE_Z = BOSS_LAYOUT.playerZ - 0.4;
/**
 * Deliberately short.
 *
 * At 4.6 the column's top projected into the middle of Aurora's body and
 * washed her out — the thing the whole frame is built around. Ending it near
 * her feet keeps the cue loud on the deck, where the player is looking, and
 * off the boss.
 */
const COLUMN_HEIGHT = 3.0;
/** Bright enough to be the loudest thing on the deck, which is the point. */
const DANGER = 0xff3ddd;

/**
 * Effect materials, created once and shared by every pooled view.
 *
 * Pools were building their own: three strike views meant three copies of
 * four materials, so three simultaneous warnings cost twelve draw calls
 * instead of four, and the budget would have failed exactly when the fight
 * got busiest. Shared instances let the renderer batch them whatever the pool
 * is doing.
 *
 * The cost is that per-view opacity has to be animated on the mesh, not the
 * material — so the views below write `mesh.material.opacity` only where a
 * single view can own it, and use scale or visibility elsewhere.
 */
const MAT = {
  footprint: new MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.3, depthWrite: false, side: DoubleSide }),
  rim: new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
  column: new MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.17, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
  chevron: new MeshBasicMaterial({ color: 0xffd0f6, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }),
  orbCore: new MeshBasicMaterial({ color: DANGER }),
  orbShell: new MeshBasicMaterial({ color: 0xff8ae8, transparent: true, opacity: 0.3, depthWrite: false, blending: AdditiveBlending }),
  orbTrail: new MeshBasicMaterial({ color: 0xff9eee, transparent: true, opacity: 0.4, depthWrite: false, blending: AdditiveBlending }),
  orbMarker: new MeshBasicMaterial({ color: DANGER, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending }),
} as const;

function laneX(lane: number): number {
  return BOSS_LAYOUT.laneCentres[Math.max(0, Math.min(2, lane))] ?? 0;
}

/**
 * Every lane strike, drawn as four instanced meshes.
 *
 * These were a mesh per part per pooled view: four meshes times three views,
 * so three simultaneous warnings cost twelve draw calls. Sharing the materials
 * was not enough — three.js issues one draw per mesh however alike the
 * materials are — so the pool is instanced instead. Three strikes now cost the
 * same four draws as one.
 *
 * The footprint alone cannot carry the cue. This camera sits 2.9 units up and
 * looks very nearly along the deck, so floor markings foreshorten into thin
 * slivers; the column is what the player reads, and the chevrons falling
 * inside it say "down here, soon" without relying on colour.
 */
class StrikePool {
  readonly root = new Group();
  private readonly footprints: InstancedMesh;
  private readonly rims: InstancedMesh;
  private readonly columns: InstancedMesh;
  private readonly chevrons: InstancedMesh;
  private readonly dummy = new Object3D();
  private static readonly MAX = 3;
  private static readonly CHEVRONS = 3;

  constructor() {
    const footprint = new PlaneGeometry(BOSS_LAYOUT.laneWidth * 0.88, STRIKE_DEPTH);
    footprint.rotateX(-Math.PI / 2);
    this.footprints = new InstancedMesh(footprint, MAT.footprint, StrikePool.MAX);

    // A hard outline. The inside may glow, but the edge states exactly how
    // wide the danger is, and a soft edge would leave that ambiguous.
    const rim = new TorusGeometry(1, 0.035, 4, 4);
    rim.rotateZ(Math.PI / 4);
    rim.rotateX(-Math.PI / 2);
    this.rims = new InstancedMesh(rim, MAT.rim, StrikePool.MAX);

    const column = new BoxGeometry(BOSS_LAYOUT.laneWidth * 0.84, COLUMN_HEIGHT, STRIKE_DEPTH * 0.92);
    column.translate(0, COLUMN_HEIGHT / 2, 0);
    this.columns = new InstancedMesh(column, MAT.column, StrikePool.MAX);

    const chevron = new ConeGeometry(BOSS_LAYOUT.laneWidth * 0.3, 0.42, 4);
    chevron.rotateX(Math.PI);
    this.chevrons = new InstancedMesh(chevron, MAT.chevron, StrikePool.MAX * StrikePool.CHEVRONS);

    for (const mesh of [this.footprints, this.rims, this.columns, this.chevrons]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
    }
  }

  apply(strikes: readonly StrikeSnapshot[]): void {
    let feet = 0;
    let rims = 0;
    let columns = 0;
    let chevrons = 0;
    const rimBase = BOSS_LAYOUT.laneWidth * 0.63;

    for (const strike of strikes.slice(0, StrikePool.MAX)) {
      const x = laneX(strike.lane);
      const p = strike.progress;

      if (strike.phase === 'warning') {
        // Builds steadily, then holds: a cue still growing at the moment of
        // impact reads as "not yet".
        const build = Math.min(1, p * 1.35);
        this.place(this.footprints, feet++, x, 0.06, 1, 0.3 + build * 0.7, 1);
        this.place(this.rims, rims++, x, 0.07, rimBase * (0.82 + build * 0.18), 1, rimBase * (0.82 + build * 0.18));
        this.place(this.columns, columns++, x, 0, 0.55 + build * 0.45, 1, 0.55 + build * 0.45);
        for (let i = 0; i < StrikePool.CHEVRONS; i++) {
          const fall = (p * 1.6 + i / StrikePool.CHEVRONS) % 1;
          const scale = 0.7 + (1 - fall) * 0.4;
          this.place(this.chevrons, chevrons++, x, COLUMN_HEIGHT * (1 - fall) + 0.3, scale, scale, scale);
        }
        continue;
      }

      if (strike.phase === 'strike') {
        this.place(this.footprints, feet++, x, 0.06, 1, 1, 1);
        this.place(this.rims, rims++, x, 0.07, rimBase, 1, rimBase);
        // Slams down rather than fading in place.
        this.place(this.columns, columns++, x, 0, 1, Math.max(0.06, 1 - p), 1);
        continue;
      }

      const fade = 1 - p;
      if (fade <= 0.08) continue;
      this.place(this.footprints, feet++, x, 0.06, 1, fade, 1);
      this.place(this.rims, rims++, x, 0.07, rimBase * fade, 1, rimBase * fade);
    }

    this.footprints.count = feet;
    this.rims.count = rims;
    this.columns.count = columns;
    this.chevrons.count = chevrons;
    for (const mesh of [this.footprints, this.rims, this.columns, this.chevrons]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private place(mesh: InstancedMesh, index: number, x: number, y: number, sx: number, sy: number, sz: number): void {
    this.dummy.position.set(x, y, STRIKE_CENTRE_Z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.set(sx, sy, sz);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}

/**
 * Every orb, instanced for the same reason.
 *
 * The marker is the part that makes it playable. The deck foreshortens almost
 * to a line from this camera, so an orb halfway down the lane reads as sitting
 * beside Aurora; a ring tracking it along the floor is what tells the player
 * which lane it is in and how close it has come.
 */
class OrbPool {
  readonly root = new Group();
  private readonly cores: InstancedMesh;
  private readonly shells: InstancedMesh;
  private readonly trails: InstancedMesh;
  private readonly markers: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly at = new Vector3();
  private readonly from = new Vector3();
  private readonly to = new Vector3();
  private static readonly MAX = 3;
  private static readonly TRAIL = 6;

  constructor() {
    this.cores = new InstancedMesh(new SphereGeometry(0.3, 14, 10), MAT.orbCore, OrbPool.MAX);
    this.shells = new InstancedMesh(new SphereGeometry(0.46, 14, 10), MAT.orbShell, OrbPool.MAX);
    this.trails = new InstancedMesh(new SphereGeometry(0.17, 8, 6), MAT.orbTrail, OrbPool.MAX * OrbPool.TRAIL);
    const marker = new TorusGeometry(0.42, 0.07, 4, 18);
    marker.rotateX(-Math.PI / 2);
    this.markers = new InstancedMesh(marker, MAT.orbMarker, OrbPool.MAX);
    for (const mesh of [this.cores, this.shells, this.trails, this.markers]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
    }
  }

  private path(x: number, t: number, out: Vector3): Vector3 {
    this.from.set(AURORA_TORSO.x, AURORA_TORSO.y, AURORA_TORSO.z);
    this.to.set(x, 0.75, BOSS_LAYOUT.playerZ);
    out.copy(this.from).lerp(this.to, t);
    // A shallow arc, so its depth is readable against a foreshortened deck.
    out.y += Math.sin(t * Math.PI) * 0.75;
    return out;
  }

  /**
   * Where the orb is aiming at a given point in its flight.
   *
   * An uncommitted orb sweeps the deck instead of sitting over a lane, so no
   * lane reads as the target before one has been chosen. The sweep is a
   * function of travel progress, never of wall-clock time, so a pause or a
   * frame-rate change cannot slide it away from the simulation's path.
   */
  private aimX(progress: number, lane: number | null, lockProgress: number): number {
    const drift = Math.sin(progress * Math.PI * 2.4) * BOSS_LAYOUT.laneWidth * 0.8;
    if (lane === null) return drift;
    return drift + (laneX(lane) - drift) * lockProgress;
  }

  apply(orbs: readonly OrbSnapshot[], time: number): void {
    let n = 0;
    let markers = 0;
    let trails = 0;
    for (const orb of orbs.slice(0, OrbPool.MAX)) {
      const t = orb.progress;
      this.path(this.aimX(t, orb.lane, orb.lockProgress), t, this.at);
      const pulse = 1 + Math.sin(time * 7) * 0.07;
      this.set(this.cores, n, this.at.x, this.at.y, this.at.z, pulse);
      this.set(this.shells, n, this.at.x, this.at.y, this.at.z, 1);
      n++;
      // The floor marker is the orb's lane claim, so it appears only once a
      // lane is actually committed. Drawing it earlier would be a warning that
      // later moves — the failure the cue contract exists to prevent.
      if (orb.lane !== null) {
        // Tightens as it closes, so the last moment before contact is loudest.
        this.set(this.markers, markers++, laneX(orb.lane), 0.075, this.at.z, 1.25 - t * 0.5);
      }
      for (let i = 0; i < OrbPool.TRAIL; i++) {
        const back = Math.max(0, t - (i + 1) * 0.045);
        const p = this.path(this.aimX(back, orb.lane, orb.lockProgress), back, new Vector3());
        this.set(this.trails, trails++, p.x, p.y, p.z, 1 - i * 0.14);
      }
    }
    this.cores.count = n;
    this.shells.count = n;
    this.markers.count = markers;
    this.trails.count = trails;
    for (const mesh of [this.cores, this.shells, this.trails, this.markers]) {
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  private set(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}

/** A bounded explosion at Matthew's torso, driven by once-only contact data. */
class OrbImpactPool {
  readonly root = new Group();
  private readonly rings: InstancedMesh;
  private readonly sparks: InstancedMesh;
  private readonly dummy = new Object3D();
  private static readonly MAX = 3;
  private static readonly SPARKS = 12;

  constructor() {
    this.rings = new InstancedMesh(
      new TorusGeometry(0.42, 0.085, 5, 24),
      new MeshBasicMaterial({ color: 0xffa5ef, transparent: true, opacity: 0.88,
        depthWrite: false, blending: AdditiveBlending }),
      OrbImpactPool.MAX,
    );
    this.sparks = new InstancedMesh(
      new SphereGeometry(0.11, 7, 5),
      new MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.92,
        depthWrite: false, blending: AdditiveBlending }),
      OrbImpactPool.MAX * OrbImpactPool.SPARKS,
    );
    for (const mesh of [this.rings, this.sparks]) {
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.root.add(mesh);
    }
  }

  apply(impacts: readonly OrbImpactSnapshot[]): void {
    let rings = 0;
    let sparks = 0;
    const color = new Color();
    for (const impact of impacts.slice(0, OrbImpactPool.MAX)) {
      const p = impact.progress;
      const x = laneX(impact.lane);
      this.place(this.rings, rings++, x, MATTHEW_ORB_IMPACT.y,
        MATTHEW_ORB_IMPACT.z, 0.8 + p * 2.1);
      for (let i = 0; i < OrbImpactPool.SPARKS; i++) {
        const a = i * 2.39996;
        const reach = 0.18 + p * (0.55 + (i % 3) * 0.17);
        this.place(this.sparks, sparks, x + Math.cos(a) * reach,
          MATTHEW_ORB_IMPACT.y + Math.sin(a) * reach,
          MATTHEW_ORB_IMPACT.z + Math.sin(a * 1.7) * 0.18,
          Math.max(0.04, 1 - p) * (i % 4 === 0 ? 1.2 : 0.8));
        this.sparks.setColorAt(sparks, color.setHex(i % 3 === 0 ? 0xffffff : 0xff58dc));
        sparks++;
      }
    }
    this.rings.count = rings;
    this.sparks.count = sparks;
    this.rings.instanceMatrix.needsUpdate = true;
    this.sparks.instanceMatrix.needsUpdate = true;
    if (this.sparks.instanceColor) this.sparks.instanceColor.needsUpdate = true;
  }

  private place(mesh: InstancedMesh, index: number, x: number, y: number, z: number, scale: number): void {
    this.dummy.position.set(x, y, z);
    this.dummy.scale.setScalar(scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(index, this.dummy.matrix);
  }
}

/** The two side arcs leave the filled emblem uninterrupted at the ring's centre. */
function shieldRing(radius: number, tube: number, material: MeshBasicMaterial): Group {
  const ring = new Group();
  const gap = Math.asin(0.8 / radius);
  const sideArc = Math.PI - gap * 2;
  for (const start of [Math.PI / 2 + gap, 3 * Math.PI / 2 + gap]) {
    const geometry = new TorusGeometry(radius, tube, 6, 20, sideArc);
    geometry.rotateZ(start);
    geometry.rotateX(Math.PI / 2);
    ring.add(new Mesh(geometry, material));
  }
  return ring;
}

/** Purple bubble with a small shield emblem below Aurora's face. */
class ShieldView {
  readonly root = new Group();
  private readonly dome: Mesh;
  private readonly rim: Group;
  private readonly rimMaterial: MeshBasicMaterial;
  private readonly ripple: Group;
  private readonly rippleMaterial: MeshBasicMaterial;
  private readonly emblem: Mesh;
  private readonly emblemGlow: Mesh;
  private static readonly RIM_Y = -0.7;

  constructor(centre: Vector3, radius: number) {
    this.dome = new Mesh(new SphereGeometry(radius, 20, 14), new MeshBasicMaterial({
      color: 0xb44cff, transparent: true, opacity: 0.16,
      depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    }));
    const wrapRadius = Math.sqrt(radius * radius - ShieldView.RIM_Y * ShieldView.RIM_Y);
    this.rimMaterial = new MeshBasicMaterial({
      color: 0xe6a6ff, transparent: true, opacity: 0.5,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.rim = shieldRing(wrapRadius, 0.055, this.rimMaterial);
    this.rim.position.y = ShieldView.RIM_Y;
    this.rippleMaterial = new MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0,
      depthWrite: false, blending: AdditiveBlending,
    });
    this.ripple = shieldRing(wrapRadius, 0.07, this.rippleMaterial);
    this.ripple.position.y = ShieldView.RIM_Y;
    this.ripple.visible = false;

    // A filled sigil low on the bubble, clear without covering her face.
    const shape = new Shape();
    shape.moveTo(-0.56, 0.36);
    shape.lineTo(0.56, 0.36);
    shape.lineTo(0.5, -0.4);
    shape.lineTo(0, -0.95);
    shape.lineTo(-0.5, -0.4);
    shape.closePath();
    const emblemGeometry = new ShapeGeometry(shape);
    this.emblemGlow = new Mesh(emblemGeometry, new MeshBasicMaterial({
      color: 0xd678ff, transparent: true, opacity: 0,
      depthWrite: false, blending: AdditiveBlending, side: DoubleSide,
    }));
    this.emblemGlow.scale.setScalar(1.48);
    this.emblemGlow.position.set(0, -0.45, radius + 0.04);
    this.emblem = new Mesh(emblemGeometry, new MeshBasicMaterial({
      color: 0xb96be8, transparent: true, opacity: 0.64,
      depthWrite: false, side: DoubleSide,
    }));
    this.emblem.scale.setScalar(1.2);
    this.emblem.position.set(0, -0.45, radius + 0.08);
    this.root.add(this.dome, this.rim, this.ripple, this.emblemGlow, this.emblem);
    this.root.position.copy(centre);
  }

  apply(shield: ShieldSnapshot, time: number): void {
    const dome = this.dome.material as MeshBasicMaterial;
    const rim = this.rimMaterial;
    const ripple = this.rippleMaterial;
    const emblem = this.emblem.material as MeshBasicMaterial;
    const emblemGlow = this.emblemGlow.material as MeshBasicMaterial;
    this.rim.position.y = ShieldView.RIM_Y + Math.sin(time * 0.9) * 0.025;

    if (shield.phase === 'down') {
      // Damage opens on this exact phase edge, so the bubble leaves with it.
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.scale.setScalar(1);
    if (shield.phase === 'blocked') {
      const bounce = Math.sin(shield.progress * Math.PI);
      this.emblemGlow.visible = true;
      this.ripple.visible = true;
      dome.opacity = 0.16 + bounce * 0.4;
      rim.opacity = 0.5 + bounce * 0.5;
      ripple.opacity = bounce * 0.8;
      emblem.opacity = 0.64 + bounce * 0.28;
      emblemGlow.opacity = bounce * 0.28;
      this.ripple.scale.setScalar(1 + shield.progress * 0.35);
      return;
    }

    dome.opacity = 0.16 + Math.sin(time * 1.6) * 0.015;
    rim.opacity = 0.5;
    ripple.opacity = 0;
    emblem.opacity = 0.64;
    emblemGlow.opacity = 0;
    this.emblemGlow.visible = false;
    this.ripple.visible = false;
    this.ripple.scale.setScalar(1);
    this.root.scale.setScalar(0.84 + 0.16 * shield.progress);
  }
}

/** A bounded burst, pooled. Decoration only — a shot owns its damage. */
class BurstPool {
  readonly mesh: InstancedMesh;
  private readonly dummy = new Object3D();
  private readonly live: { at: Vector3; age: number; tone: number }[] = [];
  private static readonly PER = 14;
  private static readonly MAX = 3;
  private static readonly LIFE = 0.6;

  constructor() {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(0.13, 0.19),
      new MeshBasicMaterial({ side: DoubleSide, transparent: true, opacity: 0.95, depthWrite: false }),
      BurstPool.PER * BurstPool.MAX,
    );
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  fire(at: Vector3, tone: number): void {
    if (this.live.length >= BurstPool.MAX) this.live.shift();
    this.live.push({ at: at.clone(), age: 0, tone });
  }

  update(step: number): void {
    for (const burst of this.live) burst.age += step;
    while (this.live.length && this.live[0]!.age > BurstPool.LIFE) this.live.shift();
    let n = 0;
    const colour = new Color();
    for (const burst of this.live) {
      const t = burst.age / BurstPool.LIFE;
      for (let i = 0; i < BurstPool.PER; i++) {
        const a = i * 2.39996;
        const r = 0.2 + t * (0.8 + (i % 3) * 0.22);
        this.dummy.position.set(
          burst.at.x + Math.cos(a) * r,
          burst.at.y + Math.sin(a) * r - t * t * 0.6,
          burst.at.z + Math.sin(a * 1.7) * r * 0.5,
        );
        this.dummy.rotation.set(t * 5 + i, a, a * 2);
        this.dummy.scale.setScalar(Math.max(0, 1 - t));
        this.dummy.updateMatrix();
        this.mesh.setMatrixAt(n, this.dummy.matrix);
        this.mesh.setColorAt(n, colour.setHex(burst.tone));
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  reset(): void {
    this.live.length = 0;
    this.mesh.count = 0;
  }
}

/**
 * The scored gift.
 *
 * It keeps the pack's present silhouette, which nothing else in the scene
 * uses now that the scenery boxes are procedural. The blue present moves down
 * its committed lane; its treatment can be matched to Levels 1 and 2 later.
 */
class GiftView {
  readonly root = new Group();
  private readonly box = new Group();

  constructor() {
    this.root.add(this.box);
    this.root.visible = false;
  }

  attach(model: Group): void {
    this.box.add(model);
  }

  apply(lane: number, phase: string, progress: number, time: number): void {
    this.root.visible = phase !== 'expired' || progress < 1;
    // It descends into its lane and then stays put. The simulation only makes
    // it collectible once it has settled, so the model must actually be at
    // rest by then — a gift still sliding under a player who has already
    // scored it is what made the old version read as being dragged in.
    const startZ = BOSS_LAYOUT.bossZ + 3;
    const restZ = BOSS_LAYOUT.playerZ - 0.6;
    const falling = phase === 'falling';
    const drop = falling ? progress * progress * (3 - 2 * progress) : 1;
    // A shallow descent makes its approach visible from the low camera;
    // depth movement alone foreshortens into almost the same screen position.
    this.root.position.set(laneX(lane), 0.45 + (1 - drop) * 2.4, startZ + (restZ - startZ) * drop);
    this.box.rotation.y = time * 1.1;
    // Settled, it bobs in place; falling, it tumbles and does not.
    this.box.position.y = falling ? 0 : Math.sin(time * 2.2) * 0.1;
    this.box.rotation.x = falling ? (1 - drop) * 2.2 : 0;
    if (phase === 'taken') {
      const pop = 1 + progress * 0.8;
      this.box.scale.setScalar(Math.max(0, pop * (1 - progress)));
    } else if (phase === 'expired') {
      this.box.scale.setScalar(Math.max(0, 1 - progress));
    } else {
      this.box.scale.setScalar(1);
    }
  }

  hide(): void {
    this.root.visible = false;
  }
}

export class BossEffects {
  readonly root = new Group();
  private readonly strikes = new StrikePool();
  private readonly orbs = new OrbPool();
  private readonly orbImpacts = new OrbImpactPool();
  private readonly shield: ShieldView;
  private readonly bursts = new BurstPool();
  private readonly gift = new GiftView();
  private readonly cakeHome = new Vector3(BOSS_LAYOUT.cakeX, BOSS_LAYOUT.cakeY, BOSS_LAYOUT.cakeZ);
  private time = 0;
  private seenStrikes = new Set<number>();

  constructor(private readonly cake: Group) {
    this.root.add(this.strikes.root, this.orbs.root, this.orbImpacts.root);
    this.shield = new ShieldView(
      new Vector3(0, BOSS_LAYOUT.bossStageY + 2.3, BOSS_LAYOUT.bossZ),
      2.9,
    );
    this.root.add(this.shield.root, this.bursts.mesh, this.gift.root);
  }

  attachGift(model: Group): void {
    this.gift.attach(model);
  }

  /** Decorative only; the simulation decides what a hit means. */
  burst(at: Vector3, tone: number): void {
    this.bursts.fire(at, tone);
  }

  reset(): void {
    this.time = 0;
    this.seenStrikes.clear();
    this.bursts.reset();
  }

  update(cues: BossCues, step: number): void {
    this.time += step;

    this.strikes.apply(cues.strikes);
    for (const strike of cues.strikes) {
      // The impact burst fires off the phase edge, not off a timer of its
      // own, so it cannot land early or twice.
      if (strike.phase === 'strike' && !this.seenStrikes.has(strike.id)) {
        this.seenStrikes.add(strike.id);
        this.bursts.fire(new Vector3(laneX(strike.lane), 0.4, STRIKE_CENTRE_Z), DANGER);
      }
    }
    if (this.seenStrikes.size > 24) this.seenStrikes = new Set(cues.strikes.map((s) => s.id));
    this.orbs.apply(cues.orbs, this.time);
    this.orbImpacts.apply(cues.orbImpacts);

    this.shield.apply(cues.shield, this.time);
    if (cues.cake.phase !== 'held') this.shield.root.visible = false;

    if (cues.gift) this.gift.apply(cues.gift.lane, cues.gift.phase, cues.gift.progress, this.time);
    else this.gift.hide();

    this.applyCake(cues.cake);
    this.bursts.update(step);
  }

  /**
   * The cake's two endings.
   *
   * Both are the same tether letting go, read opposite ways: it falls toward
   * Matthew, or it leaves with her. Driving the cake here rather than in the
   * environment keeps one owner for its position — it used to bob on an
   * environment timer, which would have fought these.
   */
  private applyCake(cake: CakeSnapshot): void {
    const bob = Math.sin(this.time * 1.4) * 0.075;
    if (cake.phase === 'held') {
      this.cake.position.set(this.cakeHome.x, this.cakeHome.y + bob, this.cakeHome.z);
      this.cake.rotation.set(0, 0, 0);
      this.cake.scale.setScalar(1);
      return;
    }
    if (cake.phase === 'recovered') {
      const ease = endingEase((cake.progress - 0.1) / 0.45);
      this.cake.position.set(
        this.cakeHome.x + (1.2 - this.cakeHome.x) * ease,
        this.cakeHome.y + (0.85 - this.cakeHome.y) * ease + Math.sin(ease * Math.PI) * 0.5,
        this.cakeHome.z + (4.4 - this.cakeHome.z) * ease,
      );
      this.cake.rotation.z = Math.sin(ease * Math.PI) * 0.12;
      this.cake.scale.setScalar(1 - ease * 0.48);
      return;
    }
    const offset = escapeOffset(cake.progress);
    this.cake.position.copy(this.cakeHome).add(new Vector3(offset.x, offset.y, offset.z));
    this.cake.rotation.z = -0.15 * cake.progress;
    this.cake.scale.setScalar(cake.progress < 1 ? 1 : 0);
  }

  dispose(): void {
    this.root.removeFromParent();
  }
}

export { STRIKE_CENTRE_Z, laneX };
