import type { CakeSnapshot } from '../../levels/boss/telegraph';
import { escapeOffset } from './endings';
import {
  AdditiveBlending, BoxGeometry, BufferAttribute, BufferGeometry, CatmullRomCurve3,
  Color, Group, InstancedMesh, Mesh, MeshBasicMaterial, Object3D,
  PlaneGeometry, Points, PointsMaterial, TextureLoader, TorusGeometry, TubeGeometry, Vector3,
} from 'three';
import { BOSS_ACTORS, BOSS_PARTICLES } from '../../assets/boss/catalog';
import { BOSS_LAYOUT } from '../../levels/boss/layout';

/**
 * Her height, and the heights her spellcraft hangs at.
 *
 * Every offset here used to be an absolute world y authored when the dais was
 * 1.05 units tall. Raising the dais for the low camera left the halo, glyphs
 * and motes orbiting her ankles. Anchoring to her own body means the magic
 * follows her whenever the staging moves again, and radii expressed as
 * fractions of her height stay in proportion if she is rescaled.
 */
const AURORA_HEIGHT = BOSS_ACTORS.aurora.targetHeight;
const FEET = BOSS_LAYOUT.bossStageY + 0.08 + BOSS_LAYOUT.bossFloat;
const CHEST = FEET + AURORA_HEIGHT * 0.46;

/** Ambient spellcraft stays behind Aurora; attack warnings will own the floor. */
export class BossMagic {
  readonly root = new Group();
  private readonly halo = new Group();
  private readonly rings: Mesh[] = [];
  private readonly glyphs: InstancedMesh;
  private readonly sigils: Mesh[] = [];
  private readonly ticks: InstancedMesh;
  private readonly tether: Mesh[] = [];
  private readonly motes: Points;
  private readonly points = new Float32Array(18 * 3);
  private readonly dummy = new Object3D();
  private readonly reducedMotion = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);
  private time = 0;

  constructor() {
    const outer = new MeshBasicMaterial({
      color: 0x8f3bc1, transparent: true, opacity: 0.42,
      depthWrite: false, blending: AdditiveBlending,
    });
    const inner = new MeshBasicMaterial({
      color: 0xdf7cf5, transparent: true, opacity: 0.55,
      depthWrite: false, blending: AdditiveBlending,
    });
    for (const [radius, thickness, angle, material] of [
      [AURORA_HEIGHT * 0.525, 0.028, 0.1, outer],
      [AURORA_HEIGHT * 0.448, 0.019, -0.15, inner],
    ] as const) {
      const ring = new Mesh(new TorusGeometry(radius, thickness, 6, 64), material);
      ring.rotation.z = angle;
      this.halo.add(ring);
      this.rings.push(ring);
    }
    this.halo.position.set(0, CHEST, BOSS_LAYOUT.bossZ - 1.05);
    this.root.add(this.halo);

    /*
     * The sigil behind her.
     *
     * `magic_01` in the Kenney particle set is a pentagram with glowing
     * nodes — an actual magic circle, already shipped as a runtime texture
     * and until now unused. Two concentric tori read as a hoop; a pentagram
     * under a counter-rotating star reads as a working spell.
     *
     * Counter-rotation across the layers is what sells it. Everything turning
     * the same way reads as one decal spinning.
     */
    const loader = new TextureLoader();
    for (const [source, size, tint, opacity] of [
      [BOSS_PARTICLES.castRing, AURORA_HEIGHT * 1.02, 0xd862ff, 0.5],
      [BOSS_PARTICLES.chargedMagic, AURORA_HEIGHT * 0.6, 0xf2a6ff, 0.42],
    ] as const) {
      const plate = new Mesh(
        new PlaneGeometry(size, size),
        new MeshBasicMaterial({
          map: loader.load(source), color: tint, transparent: true,
          opacity, depthWrite: false, blending: AdditiveBlending,
        }),
      );
      plate.position.set(0, CHEST, BOSS_LAYOUT.bossZ - 1.12);
      this.sigils.push(plate);
      this.root.add(plate);
    }

    // Radial ticks around the outer boundary, like the graduations on a dial.
    this.ticks = new InstancedMesh(
      new BoxGeometry(0.03, 0.17, 0.02),
      new MeshBasicMaterial({
        color: 0xe79bff, transparent: true, opacity: 0.5,
        depthWrite: false, blending: AdditiveBlending,
      }),
      36,
    );
    this.root.add(this.ticks);

    this.glyphs = new InstancedMesh(
      new BoxGeometry(0.085, 0.22, 0.025),
      new MeshBasicMaterial({
        color: 0xb765df, transparent: true, opacity: 0.62,
        depthWrite: false, blending: AdditiveBlending,
      }),
      22,
    );
    for (let i = 0; i < 22; i++) {
      this.glyphs.setColorAt(i, new Color(i % 5 === 0 ? 0xf4b9ff : 0xa858db));
    }
    this.root.add(this.glyphs);


    // A fine tether makes the stolen cake visibly Aurora's captive.
    for (const sign of [-1, 1]) {
      // From her raised hand up to the cake: the line that says she is
      // holding it there, and the line that snaps at either ending.
      const path = new CatmullRomCurve3([
        new Vector3(0.72, CHEST + 0.25, BOSS_LAYOUT.bossZ + 0.05),
        new Vector3(1.25, CHEST + 0.78 + sign * 0.12, BOSS_LAYOUT.bossZ - 0.3),
        new Vector3(1.75, BOSS_LAYOUT.cakeY - 0.72 + sign * 0.1, BOSS_LAYOUT.cakeZ + 0.2),
        new Vector3(BOSS_LAYOUT.cakeX, BOSS_LAYOUT.cakeY - 0.3, BOSS_LAYOUT.cakeZ),
      ]);
      const strand = new Mesh(
        new TubeGeometry(path, 26, 0.022, 4, false),
        new MeshBasicMaterial({
          color: sign > 0 ? 0xe18afa : 0x8c3dce,
          transparent: true, opacity: 0.75, depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      this.tether.push(strand);
      this.root.add(strand);
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new BufferAttribute(this.points, 3));
    const texture = new TextureLoader().load(BOSS_PARTICLES.chargedMagic);
    this.motes = new Points(
      geometry,
      new PointsMaterial({
        map: texture, color: 0xc474eb, size: 0.28,
        transparent: true, opacity: 0.62, depthWrite: false,
        blending: AdditiveBlending, sizeAttenuation: true,
      }),
    );
    this.root.add(this.motes);
    this.update(0);
  }

  update(step: number): void {
    if (!this.reducedMotion) this.time += step;
    const t = this.time;
    this.rings[0]!.rotation.z = 0.1 + t * 0.09;
    this.rings[1]!.rotation.z = -0.15 - t * 0.13;
    this.halo.scale.setScalar(1 + Math.sin(t * 1.1) * 0.025);
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * Math.PI * 2 - t * 0.21;
      const r = AURORA_HEIGHT * 0.564 + (i % 3) * 0.05;
      this.dummy.position.set(
        Math.cos(a) * r,
        CHEST + Math.sin(a) * r,
        BOSS_LAYOUT.bossZ - 0.98,
      );
      this.dummy.rotation.z = a + Math.PI / 2;
      this.dummy.updateMatrix();
      this.glyphs.setMatrixAt(i, this.dummy.matrix);
    }
    this.glyphs.instanceMatrix.needsUpdate = true;
    this.sigils[0]!.rotation.z = t * 0.11;
    this.sigils[1]!.rotation.z = -t * 0.29;
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 - t * 0.07;
      const r = AURORA_HEIGHT * (i % 3 === 0 ? 0.6 : 0.575);
      this.dummy.position.set(
        Math.cos(a) * r,
        CHEST + Math.sin(a) * r,
        BOSS_LAYOUT.bossZ - 1.1,
      );
      this.dummy.rotation.set(0, 0, a + Math.PI / 2);
      this.dummy.scale.setScalar(i % 3 === 0 ? 1.5 : 1);
      this.dummy.updateMatrix();
      this.ticks.setMatrixAt(i, this.dummy.matrix);
    }
    this.dummy.scale.setScalar(1);
    this.ticks.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 18; i++) {
      const a = i * 2.39996 + t * (0.13 + i % 3 * 0.035);
      const radius = 0.6 + (i % 5) * 0.26;
      this.points[i * 3] = Math.cos(a) * radius + (i % 4 === 0 ? BOSS_LAYOUT.cakeX : 0);
      this.points[i * 3 + 1] = CHEST - 0.65 + Math.sin(a) * 0.75 + (i % 4 === 0 ? 0.25 : 0);
      this.points[i * 3 + 2] = BOSS_LAYOUT.bossZ - 0.15 - (i % 3) * 0.3;
    }
    (this.motes.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    for (const strand of this.tether) {
      (strand.material as MeshBasicMaterial).opacity = 0.36 + Math.sin(t * 1.4) * 0.1;
    }
  }

  applyEnding(cake: CakeSnapshot): void {
    const offset = cake.phase === 'escaped' ? escapeOffset(cake.progress) : { x: 0, y: 0, z: 0 };
    this.root.position.set(offset.x, offset.y, offset.z);
    this.root.visible = cake.phase === 'held' || (cake.phase === 'escaped' && cake.progress < 1);
    for (const strand of this.tether) strand.visible = cake.phase !== 'recovered';
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof Mesh || object instanceof Points)) return;
      object.geometry.dispose();
      const material = object.material as MeshBasicMaterial | PointsMaterial;
      material.map?.dispose();
      material.dispose();
    });
    this.root.removeFromParent();
  }
}
