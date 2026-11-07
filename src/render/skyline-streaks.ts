import {
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  type PerspectiveCamera,
} from 'three';

/**
 * Wind streaks for the top of the ramp.
 *
 * Short lines around the camera that rush toward it, faint at the speed
 * where the ramp starts to feel fast and fully there at its top. One draw
 * call, no texture. They live in the camera's frame rather than the
 * street's, so they never read as objects on the route: nothing the
 * runner can hit, nothing the solver can see.
 */
const COUNT = 44;
const DEPTH = 36;
/** Speeds between which the streaks fade in, in u/s. */
const FROM = 13.5;
const TO = 18;

export class SpeedStreaks {
  readonly object: LineSegments;
  private readonly material: LineBasicMaterial;
  private readonly heads = new Float32Array(COUNT);

  constructor() {
    const positions = new Float32Array(COUNT * 6);
    for (let i = 0; i < COUNT; i++) {
      // Either side of the route and above it, never in the lanes' band.
      const side = i % 2 === 0 ? -1 : 1;
      const x = side * (3.2 + ((i * 7) % 11) * 0.55);
      const y = 0.8 + ((i * 13) % 17) * 0.5;
      const z = -((i * 23) % DEPTH);
      this.heads[i] = z;
      positions.set([x, y, z, x, y, z - 1.4], i * 6);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
    this.material = new LineBasicMaterial({ color: 0xdfe9ff, transparent: true, opacity: 0, fog: false });
    this.object = new LineSegments(geometry, this.material);
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** `speed` is the forward speed in u/s; `camera` is where the streaks hang. */
  update(speed: number, dt: number, camera: PerspectiveCamera, reduced: boolean): void {
    const k = reduced ? 0 : Math.max(0, Math.min(1, (speed - FROM) / (TO - FROM)));
    this.material.opacity = k * 0.42;
    this.object.visible = k > 0.01;
    if (!this.object.visible) return;
    this.object.position.set(0, camera.position.y - 3, camera.position.z - 4);
    const attr = this.object.geometry.getAttribute('position') as Float32BufferAttribute;
    const advance = speed * 1.6 * dt;
    const length = 1.2 + k * 2.4;
    for (let i = 0; i < COUNT; i++) {
      let z = (this.heads[i] ?? 0) + advance;
      if (z > 2) z -= DEPTH;
      this.heads[i] = z;
      attr.setZ(i * 2, z);
      attr.setZ(i * 2 + 1, z - length);
    }
    attr.needsUpdate = true;
  }

  dispose(): void {
    this.object.geometry.dispose();
    this.material.dispose();
    this.object.removeFromParent();
  }
}
