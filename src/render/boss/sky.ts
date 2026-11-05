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

/** Cloud bands add rooftop altitude but stay behind the boss and the lanes. */
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
      new PlaneGeometry(80, 38),
      new MeshBasicMaterial({ map: this.texture, depthWrite: false, fog: false }),
    );
    backdrop.position.set(0, 7.5, -29);
    backdrop.renderOrder = -10;
    this.root.add(backdrop);

    const high = new MeshBasicMaterial({
      map: this.cloudMap, color: 0x8b98bd, transparent: true,
      opacity: 0.25, depthWrite: false, fog: false,
    });
    const low = new MeshBasicMaterial({
      map: this.cloudMap, color: 0x7e85af, transparent: true,
      opacity: 0.33, depthWrite: false, fog: false,
    });
    const placements = [
      [-7.3, 8.2, -20, 7.0, 2.7, 0.11, high],
      [0.8, 9.0, -22, 6.8, 2.4, -0.08, high],
      [8.0, 7.7, -19, 6.1, 2.5, 0.09, high],
      [-6.6, 1.3, -11.8, 5.6, 2.0, 0.16, low],
      [6.8, 1.5, -11.5, 5.3, 1.8, -0.13, low],
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
