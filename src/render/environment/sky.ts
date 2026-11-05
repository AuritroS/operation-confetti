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
  CircleGeometry,
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

export interface SkyLayerOptions {
  readonly moon?: {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
  };
}

export class SkyLayer implements EnvironmentLayer {
  readonly id = 'sky' as const;
  readonly object = new Group();

  private readonly dome: Mesh;
  private readonly moon: Mesh;
  private readonly halo: Mesh;

  constructor(options?: SkyLayerOptions) {
    // Inside of a large sphere. Rendered unlit so the gradient is exact.
    const texture = gradientTexture(PALETTE.ink, PALETTE.navyDeep);
    this.dome = new Mesh(
      new SphereGeometry(140, 24, 16),
      new MeshBasicMaterial({ map: texture, side: BackSide, depthWrite: false, fog: false }),
    );
    // Draw first, behind everything.
    this.dome.renderOrder = -10;
    this.object.add(this.dome);

    // Moon: a flat disc is enough at this distance and costs 2 triangles'
    // worth of fill rather than a lit sphere.
    this.halo = new Mesh(
      new CircleGeometry(13, 32),
      new MeshBasicMaterial({ color: 0xbcd2ff, transparent: true, opacity: 0.1, depthWrite: false, fog: false }),
    );
    this.moon = new Mesh(
      new CircleGeometry(7.4, 40),
      new MeshBasicMaterial({ color: 0xf2f0e4, depthWrite: false, fog: false }),
    );
    const moonPos = {
      x: options?.moon?.x ?? 26,
      y: options?.moon?.y ?? 44,
      z: options?.moon?.z ?? -120,
    };
    for (const m of [this.halo, this.moon]) {
      m.position.set(moonPos.x, moonPos.y, moonPos.z);
      m.renderOrder = -9;
      this.object.add(m);
    }
  }

  update(): void {
    /* static by design: a sky that scrolls stops reading as distant */
  }

  dispose(): void {
    for (const mesh of [this.dome, this.moon, this.halo] as Object3D[]) {
      const m = mesh as Mesh;
      m.geometry.dispose();
      const mat = m.material as MeshBasicMaterial;
      mat.map?.dispose();
      mat.dispose();
    }
    this.object.removeFromParent();
  }
}
