import { PerspectiveCamera } from 'three';

/** A fixed low view: Matthew reads small beneath Aurora's raised stage. */
export class BossCamera {
  readonly camera = new PerspectiveCamera(60, 390 / 844, 0.1, 100);

  constructor() {
    this.camera.position.set(0, 5.5, 13);
    this.camera.lookAt(0, 1.1, -2);
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
