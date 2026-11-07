import { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial, Object3D } from 'three';
import type { CakeSnapshot } from '../../levels/boss/telegraph';
import { BOSS_LAYOUT } from '../../levels/boss/layout';

const COUNT = 320;
const COLUMNS = 22;
/** Fraction of the victory timeline the shower runs for. */
const START = 0.3;
/** Depth band the paper falls through, nearest the lens. */
const NEAR_Z = BOSS_LAYOUT.playerZ + 2.4;
const FAR_Z = 0.5;

/**
 * The victory shower.
 *
 * A full-screen fall rather than the two side bursts this used to be: paper
 * enters above the top of frame across the whole visible width and keeps
 * coming for the rest of the ending, so the win fills the screen instead of
 * decorating its edges.
 *
 * Two things keep it honest. The spread comes from the camera's actual
 * frustum width at this depth, so "full width" holds at 360 px and at desktop
 * rather than only at the viewport it was tuned on; and every piece is seeded
 * from its own index and positioned from `cake.progress` alone, never a wall
 * clock, so it is pause-safe, identical on every replay, and reproducible in
 * headless capture.
 */
export class BossCelebration {
  readonly mesh = new InstancedMesh(new BoxGeometry(0.1, 0.17, 0.025),
    new MeshBasicMaterial({ color: 0xffffff }), COUNT);
  private readonly dummy = new Object3D();
  private halfWidth = 6;

  constructor() {
    const colors = [0xffca50, 0xf576c6, 0x80d5ff, 0xd2a0ff, 0xffffff];
    for (let i = 0; i < COUNT; i++) this.mesh.setColorAt(i, new Color(colors[i % colors.length]!));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
  }

  /**
   * Half the world-space width the camera sees at the shower's depth.
   *
   * The scene recomputes this on resize. Without it the spread is fixed in
   * world units and a wide viewport shows paper falling down the middle with
   * clear air either side.
   */
  setSpread(halfWidth: number): void {
    this.halfWidth = Math.max(2, halfWidth);
  }

  update(cake: CakeSnapshot): void {
    this.mesh.visible = cake.phase === 'recovered' && cake.progress > START;
    if (!this.mesh.visible) return;
    // Normalised time since the shower began, independent of ending length.
    const time = (cake.progress - START) / (1 - START);
    const spread = this.halfWidth * 1.05;

    for (let i = 0; i < COUNT; i++) {
      // Deterministic per-piece jitter: cheap hashes of the index, so no
      // random state has to survive a pause or a replay.
      const column = i % COLUMNS;
      const lane = (column / (COLUMNS - 1)) * 2 - 1;
      const jitter = ((i * 2654435761) % 1000) / 1000;
      const speed = 0.75 + jitter * 0.75;
      const stagger = (((i * 97) % 211) / 211) * 0.55;

      // Each piece falls, then re-enters at the top, so the shower is
      // continuous for the whole ending rather than a single wave.
      const fall = (time * speed + stagger) % 1;
      const y = 7.6 - fall * 11.5;
      if (y < -0.6) { this.hide(i); continue; }

      const sway = Math.sin((fall * 6 + jitter * 7) * Math.PI) * 0.5;
      this.dummy.position.set(
        lane * spread + sway + (jitter - 0.5) * (spread / COLUMNS) * 2,
        y,
        FAR_Z + ((i * 7) % COLUMNS) / COLUMNS * (NEAR_Z - FAR_Z),
      );
      // Flutter: tumbling on all three axes reads as paper, not as debris.
      this.dummy.rotation.set(fall * 9 + i, fall * 6 + jitter * 4, fall * 11 + i * 0.3);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private hide(index: number): void {
    this.dummy.position.set(0, -50, 0);
    this.dummy.rotation.set(0, 0, 0);
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(index, this.dummy.matrix);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshBasicMaterial).dispose();
  }
}
