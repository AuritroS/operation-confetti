import { PerspectiveCamera } from 'three';
import { BOSS_LAYOUT } from '../../levels/boss/layout';

/**
 * A low confrontation view: the lens sits below Aurora's eyeline and barely
 * above Matthew's head, so she is read from underneath and he becomes a
 * foreground silhouette reaching up at her.
 *
 * The previous framing sat at y 5.5 — a metre above the top of her head — which
 * is why she measured large but never read as powerful. You cannot look down on
 * a subject and have them dominate.
 *
 * The eye height is a lever in its own right. Matthew reads below it and
 * Aurora's feet above it, so lifting the lens pushes the two apart in opposite
 * directions and opens the gap between them without changing either's size.
 * Pitching up does not: it moves both down together. At y 2.9 the lens is
 * still ~4 units under her eyeline, so the up-angle survives intact.
 */
const EYE = { x: 0, y: 2.9, z: 15 } as const;
/** Aimed above Matthew, at her chest: the deck keeps the lower third, she owns the middle. */
const TARGET = { x: 0, y: 3.4, z: BOSS_LAYOUT.bossZ } as const;

export class BossCamera {
  readonly camera = new PerspectiveCamera(60, 390 / 844, 0.1, 100);

  constructor() {
    this.camera.position.set(EYE.x, EYE.y, EYE.z);
    this.camera.lookAt(TARGET.x, TARGET.y, TARGET.z);
    this.resize(390, 844);
  }

  resize(width: number, height: number): void {
    // Preserve the narrowest supported phone's horizontal room on tall screens.
    // Wider phones reveal more of the party wings without shifting play objects.
    const aspect = width / Math.max(height, 1);
    this.camera.aspect = aspect;
    this.camera.fov = Math.max(60, 2 * Math.atan(Math.tan(60 * Math.PI / 360) * (0.54 / Math.max(aspect, 0.1))) * 180 / Math.PI);
    this.camera.updateProjectionMatrix();
  }
}
