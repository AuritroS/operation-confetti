import {
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  type PerspectiveCamera,
} from 'three';
import { COURSE, GAME_ZONE_HALF } from '../levels/skyline/config';

/**
 * Air that moves: pale flecks between the façades, streaming toward the
 * camera with speed.
 *
 * The speed cue lives in the scene so it sits in perspective, and it is
 * placed where it cannot read as part of the course: outside the game
 * zone on either side, above head height, and never within the few units
 * in front of the camera where a fleck could cross an obstacle. Sparse at
 * the ramp's start, dense at the top. One draw call, no texture.
 */
const COUNT = 160;
const DEPTH = 60;
const NEAR = 6;
/** Fraction of the ramp below which nothing shows. */
const FROM = 0.18;

export class SkylineAir {
  readonly object: Points;
  private readonly material: PointsMaterial;
  private readonly z = new Float32Array(COUNT);
  private readonly rate = new Float32Array(COUNT);

  constructor() {
    const positions = new Float32Array(COUNT * 3);
    for (let i = 0; i < COUNT; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      // From just outside the lanes to the façades, and above the player.
      const x = side * (GAME_ZONE_HALF + 0.6 + ((i * 7) % 13) * 0.36);
      const y = COURSE.groundY + 2.2 + ((i * 11) % 19) * 0.45;
      const z = -NEAR - ((i * 23) % DEPTH);
      positions.set([x, y, z], i * 3);
      this.z[i] = z;
      this.rate[i] = 1.1 + ((i * 5) % 7) * 0.12;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.material = new PointsMaterial({
      color: 0xdfe9ff, size: 0.09, transparent: true, opacity: 0, depthWrite: false, fog: false,
    });
    this.object = new Points(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** `ramp` is 0..1 up the speed ramp; `speed` the forward speed in u/s. */
  update(ramp: number, speed: number, dt: number, camera: PerspectiveCamera, reduced: boolean): void {
    const k = reduced ? 0 : Math.max(0, Math.min(1, (ramp - FROM) / (1 - FROM)));
    this.material.opacity = k * 0.5;
    this.material.size = 0.07 + k * 0.08;
    this.object.visible = k > 0.01;
    if (!this.object.visible) return;
    // Hung on the camera's z so the field rides with the player.
    this.object.position.z = camera.position.z;
    const attr = this.object.geometry.getAttribute('position') as Float32BufferAttribute;
    for (let i = 0; i < COUNT; i++) {
      let z = (this.z[i] ?? 0) + speed * (this.rate[i] ?? 1) * dt;
      if (z > -NEAR) z -= DEPTH;
      this.z[i] = z;
      attr.setZ(i, z);
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
