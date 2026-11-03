/**
 * The rooftop itself: play surface, parapets, and surface detail.
 *
 * The parapets do real work beyond decoration. They make the playable area
 * legible as a bounded space, which is what lets the lane dividers be dimmed
 * right down — the player reads "I am on a roof between two walls" rather
 * than counting stripes. They also mark, visually, exactly where decoration
 * is allowed to begin.
 */
import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from 'three';
import { PALETTE, ROLE } from '../palette';
import { PARAPET_WIDTH } from './placement';
import type { EnvironmentLayer, LayerContext } from './layer';

/** How far the surface extends ahead; fog hides the end. */
const SURFACE_LENGTH = 150;
const GRAVEL_PATCHES = 60;

export class RooftopLayer implements EnvironmentLayer {
  readonly id = 'rooftop' as const;
  readonly object = new Group();

  private readonly surface: Mesh;
  private readonly parapets: Mesh[] = [];
  private readonly gravel: InstancedMesh;
  private readonly matrix = new Matrix4();
  private readonly width: number;

  constructor(ctx: LayerContext) {
    this.width = ctx.corridor.halfWidth * 2;

    this.surface = new Mesh(
      new PlaneGeometry(this.width, SURFACE_LENGTH),
      new MeshStandardMaterial({ color: ROLE.ground, roughness: 0.97 }),
    );
    this.surface.rotation.x = -Math.PI / 2;
    this.surface.position.z = -SURFACE_LENGTH / 2 + 20;
    this.object.add(this.surface);

    // Parapets: a low wall each side, with a lighter coping along the top so
    // the edge catches the rim light and reads at distance.
    for (const sign of [-1, 1] as const) {
      const wall = new Mesh(
        new BoxGeometry(PARAPET_WIDTH, 0.62, SURFACE_LENGTH),
        new MeshStandardMaterial({ color: PALETTE.slateLine, roughness: 0.9 }),
      );
      wall.position.set(
        sign * (ctx.corridor.halfWidth + PARAPET_WIDTH / 2),
        0.31,
        this.surface.position.z,
      );
      this.object.add(wall);
      this.parapets.push(wall);

      const coping = new Mesh(
        new BoxGeometry(PARAPET_WIDTH * 1.25, 0.1, SURFACE_LENGTH),
        new MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.65 }),
      );
      coping.position.set(wall.position.x, 0.66, this.surface.position.z);
      this.object.add(coping);
      this.parapets.push(coping);
    }

    // Gravel: flat patches breaking up the surface so it is not a plain
    // sheet. One draw call, and strictly inside the corridor is fine here
    // because they are coplanar with the floor and never occlude anything.
    this.gravel = new InstancedMesh(
      new PlaneGeometry(1.1, 1.1),
      new MeshStandardMaterial({ color: PALETTE.slateLine, roughness: 1, transparent: true, opacity: 0.4 }),
      GRAVEL_PATCHES,
    );
    this.gravel.frustumCulled = false;
    for (let i = 0; i < GRAVEL_PATCHES; i++) {
      const x = (((i * 29) % 17) / 17 - 0.5) * this.width;
      const z = -((i * 2.5) % SURFACE_LENGTH);
      this.matrix.makeRotationX(-Math.PI / 2);
      this.matrix.setPosition(x, 0.012, z);
      this.gravel.setMatrixAt(i, this.matrix);
    }
    this.gravel.instanceMatrix.needsUpdate = true;
    this.object.add(this.gravel);
  }

  update(travelled: number): void {
    // The surface and parapets are long enough to wrap on a short period.
    const wrap = travelled % 10;
    this.gravel.position.z = wrap;
  }

  dispose(): void {
    for (const mesh of [this.surface, ...this.parapets, this.gravel] as Mesh[]) {
      mesh.geometry.dispose();
      (mesh.material as MeshStandardMaterial).dispose();
      mesh.removeFromParent();
    }
    this.object.removeFromParent();
  }
}

/** Exposed so the composer can dim the stripes when parapets are present. */
export function parapetPresent(layers: readonly { id: string }[]): boolean {
  return layers.some((l) => l.id === 'rooftop');
}

