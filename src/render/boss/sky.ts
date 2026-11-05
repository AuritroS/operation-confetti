import {
  CanvasTexture, Group, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace,
} from 'three';

function gradient(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const fill = ctx.createLinearGradient(0, 0, 0, 256);
    fill.addColorStop(0, '#07132c');
    fill.addColorStop(0.52, '#172e57');
    fill.addColorStop(1, '#513a67');
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function cloudTexture(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 96);
    for (const [x, y, radius] of [
      [51, 58, 39], [91, 43, 46], [129, 52, 48], [170, 42, 45], [205, 61, 37],
    ] as const) {
      const puff = ctx.createRadialGradient(x, y, 0, x, y, radius);
      puff.addColorStop(0, 'rgba(255,255,255,.72)');
      puff.addColorStop(0.55, 'rgba(255,255,255,.3)');
      puff.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = puff;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/**
 * Sky and cloud bands.
 *
 * The low band sits *below* the deck plane and out past the terrace sides,
 * where the pod occludes nothing. Cloud seen underfoot is the cheapest and
 * most legible altitude cue there is; cloud at deck level, which is where
 * this band started, is simply hidden behind the stage.
 */
export class BossSky {
  readonly root = new Group();
  private readonly texture = gradient();
  private readonly cloudMap = cloudTexture();
  private readonly clouds: { mesh: Mesh; startX: number; speed: number }[] = [];
  private time = 0;
  private readonly reducedMotion = typeof window !== 'undefined'
    && (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false);

  constructor() {
    const backdrop = new Mesh(
      new PlaneGeometry(130, 72),
      new MeshBasicMaterial({ map: this.texture, depthWrite: false, fog: false }),
    );
    backdrop.position.set(0, 2.0, -34);
    backdrop.renderOrder = -10;
    this.root.add(backdrop);

    // The one cloud layer, lying across the city. It is read against lit
    // windows rather than against empty sky, so that is what it must out-
    // contrast.
    const low = new MeshBasicMaterial({
      map: this.cloudMap, color: 0xb9c3e8, transparent: true,
      opacity: 0.72, depthWrite: false, fog: false,
    });
    const placements = [
      // No high band. Sitting above the stage it only ever read as faint
      // smudges behind the tower; the layer that matters is the one lying
      // across the city, which is what says we are above the weather.
      // A layer lying over the city rather than under it: at this height the
      // weather is below us, so cloud should cross the skyline, not sit
      // beneath it. Placed in front of the city band at z -50 and inside the
      // wedge the pod leaves visible.
      [-11.5, -1.9, -42, 19.0, 5.4, 0.16, low],
      [10.8, -2.6, -44, 18.0, 5.0, -0.13, low],
      [-16.5, -3.1, -40, 16.0, 4.6, -0.1, low],
      [15.4, -1.6, -46, 17.0, 4.8, 0.12, low],
      [-4.0, -3.6, -47, 16.0, 4.4, 0.08, low],
      [5.2, -4.2, -45, 15.0, 4.2, -0.09, low],
    ] as const;
    for (const [x, y, z, width, height, speed, material] of placements) {
      const mesh = new Mesh(new PlaneGeometry(width, height), material);
      mesh.position.set(x, y, z);
      mesh.renderOrder = -8;
      this.root.add(mesh);
      this.clouds.push({ mesh, startX: x, speed });
    }
  }

  update(step: number): void {
    if (this.reducedMotion) return;
    this.time += step;
    for (const { mesh, startX, speed } of this.clouds) {
      mesh.position.x = startX + Math.sin(this.time * speed) * 0.9;
    }
  }

  dispose(): void {
    this.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      (object.material as MeshBasicMaterial).dispose();
    });
    this.texture.dispose();
    this.cloudMap.dispose();
    this.root.removeFromParent();
  }
}
