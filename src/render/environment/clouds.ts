/**
 * Clouds, in two bands that do different jobs.
 *
 * HIGH clouds drift across the sky and give the moon something to sit in, so
 * the backdrop reads as a sky rather than a painted wall.
 *
 * LOW clouds are the important ones. A few wisps passing BELOW the parapet
 * line are the clearest possible signal that this is a rooftop and not a
 * street — altitude is otherwise hard to convey when the camera can only see
 * forwards.
 *
 * Cost control, because large transparent quads are a fillrate trap on
 * phones and that is the one way clouds could hurt:
 *
 *  - eight quads total, sixteen triangles
 *  - one shared generated texture, so one material and one draw call
 *  - sized modestly and spread apart, so overdraw rarely stacks beyond two
 *  - `depthWrite: false`, so they never fight the world for the depth buffer
 *
 * Nothing is downloaded: the texture is drawn once into a canvas, the same
 * way the sparkle dot is.
 */
import {
  AdditiveBlending,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,

} from 'three';
import type { EnvironmentLayer } from './layer';

interface Band {
  readonly count: number;
  readonly y: number;
  readonly spread: number;
  readonly depth: number;
  readonly size: number;
  readonly opacity: number;
  readonly drift: number;
}

/** High: sky texture around the moon. Low: the altitude cue. */
const BANDS: Band[] = [
  { count: 4, y: 30, spread: 70, depth: -150, size: 46, opacity: 0.16, drift: 0.9 },
  { count: 4, y: -5.5, spread: 34, depth: -52, size: 20, opacity: 0.2, drift: 3.4 },
  // Near and low: wisps that pass under the parapet line, the strongest
  // speed cue the sky can give.
  { count: 5, y: -2.5, spread: 30, depth: -26, size: 11, opacity: 0.2, drift: 6.5 },
];

/**
 * A soft blob, built from overlapping radial gradients so the silhouette is
 * lumpy rather than a circle. Generated, never fetched.
 */
function cloudTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size / 2);
    const puffs: [number, number, number][] = [
      [0.3, 0.6, 0.22],
      [0.5, 0.48, 0.3],
      [0.68, 0.62, 0.24],
      [0.42, 0.68, 0.2],
      [0.6, 0.7, 0.18],
    ];
    for (const [cx, cy, r] of puffs) {
      const x = cx * size;
      const y = cy * (size / 2);
      const radius = r * size * 0.5;
      const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.4)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export class CloudsLayer implements EnvironmentLayer {
  readonly id = 'clouds' as const;
  readonly object = new Group();

  private readonly texture: CanvasTexture;
  private readonly materials: MeshBasicMaterial[] = [];
  private readonly geometry: PlaneGeometry;
  private readonly puffs: { mesh: Mesh; band: Band; offset: number }[] = [];

  constructor() {
    this.texture = cloudTexture();
    this.geometry = new PlaneGeometry(1, 0.5);

    const byOpacity = new Map<number, MeshBasicMaterial>();
    for (const band of BANDS) {
      // One material per opacity, shared by the bands that use it: a band
      // is one draw call rather than one per cloud, and the material count
      // is budgeted.
      let material = byOpacity.get(band.opacity);
      if (!material) {
        material = new MeshBasicMaterial({
          map: this.texture,
          transparent: true,
          opacity: band.opacity,
          depthWrite: false,
          blending: AdditiveBlending,
          // Backdrop, like the skyline: dense fog would erase these entirely.
          fog: false,
        });
        byOpacity.set(band.opacity, material);
        this.materials.push(material);
      }

      for (let i = 0; i < band.count; i++) {
        const mesh = new Mesh(this.geometry, material);
        const t = (i + 0.5) / band.count;
        mesh.scale.set(band.size * (0.7 + ((i * 7) % 4) * 0.2), band.size * 0.5, 1);
        mesh.position.set(
          (t - 0.5) * band.spread * 2 + ((i * 13) % 5) - 2,
          band.y + ((i * 11) % 5) - 2,
          band.depth - ((i * 17) % 23),
        );
        mesh.renderOrder = -8;
        this.object.add(mesh);
        this.puffs.push({ mesh, band, offset: mesh.position.x });
      }
    }
  }

  update(travelled: number): void {
    for (const { mesh, band, offset } of this.puffs) {
      // Drift sideways, wrapping across the band's own width. Lateral motion
      // rather than forward, so clouds never rush the camera.
      const span = band.spread * 2;
      const x = ((offset + travelled * band.drift * 0.02) % span + span) % span - span / 2;
      mesh.position.x = x;
    }
  }

  dispose(): void {
    this.geometry.dispose();
    for (const material of this.materials) material.dispose();
    this.texture.dispose();
    for (const { mesh } of this.puffs) mesh.removeFromParent();
    this.puffs.length = 0;
    this.object.removeFromParent();
  }
}

