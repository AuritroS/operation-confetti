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
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from 'three';
import { PALETTE, ROLE } from '../palette';
import { PARAPET_WIDTH } from './placement';
import type { EnvironmentLayer, LayerContext } from './layer';

/** How far the surface extends ahead; fog hides the end. */
const SURFACE_LENGTH = 150;
/** The lower roof either side of the parapets: how wide, and how far down. */
export const TERRACE_WIDTH = 4.4;
export const TERRACE_Y = -0.5;
const GRAVEL_PATCHES = 96;
/**
 * The distance over which the gravel arrangement repeats.
 *
 * Larger than anything the player can see through the fog, so the pattern
 * never appears twice on screen at once. The patches used to sit at an exact
 * 2.5-unit pitch and scroll by `travelled % 10` — a multiple of that pitch —
 * so the lattice mapped onto itself and read as a fixed grid of blocks
 * painted on the roof rather than surface the player was moving over.
 */
const GRAVEL_PERIOD = 86;

/** Deterministic hash in 0..1. A regular formula is what made the grid. */
function scatter(i: number, salt: number): number {
  const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export class RooftopLayer implements EnvironmentLayer {
  readonly id = 'rooftop' as const;
  readonly object = new Group();

  private readonly surface: Mesh;
  private readonly parapets: Mesh[] = [];
  private readonly gravel: InstancedMesh;
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
    // the edge catches the rim light and reads at distance. One material per
    // part, shared by both sides: the count is budgeted.
    const wallMaterial = new MeshStandardMaterial({ color: PALETTE.slateLine, roughness: 0.9 });
    const copingMaterial = new MeshStandardMaterial({ color: PALETTE.steel, roughness: 0.65 });
    const terraceMaterial = new MeshStandardMaterial({ color: PALETTE.slate, roughness: 0.97 });
    for (const sign of [-1, 1] as const) {
      const wall = new Mesh(new BoxGeometry(PARAPET_WIDTH, 0.62, SURFACE_LENGTH), wallMaterial);
      wall.position.set(
        sign * (ctx.corridor.halfWidth + PARAPET_WIDTH / 2),
        0.31,
        this.surface.position.z,
      );
      this.object.add(wall);
      this.parapets.push(wall);

      const coping = new Mesh(new BoxGeometry(PARAPET_WIDTH * 1.25, 0.1, SURFACE_LENGTH), copingMaterial);
      coping.position.set(wall.position.x, 0.66, this.surface.position.z);
      this.object.add(coping);
      this.parapets.push(coping);
    }

    // Terraces: a lower roof either side of the parapets, so the dressing
    // beyond them stands on something. The play surface is exactly corridor
    // width, and the clutter layer used to float over the drop. One plane a
    // side, a step down, a shade darker.
    for (const sign of [-1, 1] as const) {
      const terrace = new Mesh(new PlaneGeometry(TERRACE_WIDTH, SURFACE_LENGTH), terraceMaterial);
      terrace.rotation.x = -Math.PI / 2;
      terrace.position.set(
        sign * (ctx.corridor.edge + TERRACE_WIDTH / 2),
        TERRACE_Y,
        this.surface.position.z,
      );
      this.object.add(terrace);
      this.parapets.push(terrace);
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
    const dummy = new Object3D();
    for (let i = 0; i < GRAVEL_PATCHES; i++) {
      // Irregular in all of position, size and spin, so no axis lines up.
      dummy.position.set(
        (scatter(i, 1) - 0.5) * this.width,
        0.012,
        -scatter(i, 2) * GRAVEL_PERIOD,
      );
      dummy.rotation.set(-Math.PI / 2, 0, scatter(i, 3) * Math.PI);
      dummy.scale.setScalar(0.55 + scatter(i, 4) * 1.1);
      dummy.updateMatrix();
      this.gravel.setMatrixAt(i, dummy.matrix);
    }
    this.gravel.instanceMatrix.needsUpdate = true;
    this.object.add(this.gravel);
  }

  update(travelled: number): void {
    // Wrapping on the arrangement's own period is what makes it tile
    // seamlessly; wrapping on anything else re-registers the pattern.
    this.gravel.position.z = travelled % GRAVEL_PERIOD;
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

