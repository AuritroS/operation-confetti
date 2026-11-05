/**
 * Sky: gradient dome and the moon.
 *
 * The reference art is a warm-lit city under a big pale moon against a deep
 * navy-to-near-black sky. A flat clear colour — what the game had — reads as a
 * void, and in portrait the sky occupies most of the screen, so this is the
 * cheapest large improvement available.
 *
 * Static: the sky does not scroll, which is what makes it read as distant.
 */
import {
  BackSide,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  SRGBColorSpace,
  type Object3D,
} from 'three';
import { PALETTE } from '../palette';
import type { EnvironmentLayer } from './layer';

function gradientTexture(top: number, bottom: number): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, hex(top));
    g.addColorStop(0.62, hex(bottom));
    g.addColorStop(1, hex(bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 4, 256);
  }
  const texture = new CanvasTexture(canvas);
  // Without this the gradient is read as linear and comes out washed-out
  // lavender instead of deep navy — three treats colour textures as sRGB
  // only when told.
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class SkyLayer implements EnvironmentLayer {
  readonly id = 'sky' as const;
  readonly object = new Group();

  private readonly dome: Mesh;

  constructor() {
    // Inside of a large sphere. Rendered unlit so the gradient is exact.
    const texture = gradientTexture(PALETTE.ink, PALETTE.navyDeep);
    this.dome = new Mesh(
      new SphereGeometry(140, 24, 16),
      new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false, fog: false }),
    );
    // Draw first, behind everything.
    this.dome.renderOrder = -10;
    this.object.add(this.dome);

    /*
     * No moon here, deliberately.
     *
     * This layer used to draw a plain white disc with a halo, while the
     * skyline layer and level 2's landmark group each drew a textured one
     * from `buildMoon`. The result was two moons in both levels, the plain
     * disc clipped behind the pause button. `buildMoon` is now the single
     * implementation and `look.ts` owns where it goes.
     */
  }

  update(): void {
    /* static by design: a sky that scrolls stops reading as distant */
  }

  dispose(): void {
    for (const mesh of [this.dome] as Object3D[]) {
      const m = mesh as Mesh;
      m.geometry.dispose();
      const mat = m.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.object.removeFromParent();
  }
}
