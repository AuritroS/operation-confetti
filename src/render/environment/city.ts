/**
 * Mid city: the buildings immediately flanking the route.
 *
 * The warm window glow is the single biggest contributor to the reference
 * look — it is what makes the scene Toronto at night rather than a corridor.
 * It comes entirely from the atlas: the city texture already has windows
 * printed into it, so using it as an emissiveMap lights every window for no
 * extra geometry and no extra draw call.
 *
 * A pool of instanced "hero window" quads was tried on top and removed. It
 * scrolled on its own wrap while the buildings scrolled on the ring, so the
 * two could never stay aligned and the quads floated beside the facades.
 * Two scroll clocks for one visual is a bug waiting to happen, and the atlas
 * was already doing the job.
 */
import { Color, Group, Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { PALETTE } from '../palette';
import type { EnvironmentLayer, LayerContext } from './layer';
import { RingPlacer } from './ring';
import { disposeTree } from './skyline';
import type { PropId } from './props';

const SHAPES: PropId[] = ['buildingE', 'buildingA', 'buildingF', 'buildingB'];
const PER_SIDE = 4;
const SPACING = 34;

export class CityLayer implements EnvironmentLayer {
  readonly id = 'city' as const;
  readonly object = new Group();

  private readonly rings: { ring: RingPlacer; items: Object3D[] }[] = [];
  private readonly owned: Object3D[] = [];

  constructor(ctx: LayerContext) {
    for (const sign of [-1, 1] as const) {
      const items: Object3D[] = [];
      for (let i = 0; i < PER_SIDE; i++) {
        const prop = ctx.prop(SHAPES[(i + (sign > 0 ? 2 : 0)) % SHAPES.length] as PropId);
        if (!prop) continue;
        litWindows(prop);
        // Sunk below the rooftop so only their upper floors show past the
        // parapet, which is what selling "you are on a roof" requires.
        // Set well back and sunk deep, so only upper floors clear the
        // parapet. Close buildings read as a street, not a rooftop.
        prop.position.set(sign * (ctx.corridor.edge + 11 + (i % 2) * 4), -11.5, 0);
        items.push(prop);
        this.object.add(prop);
        this.owned.push(prop);
      }
      this.rings.push({ ring: new RingPlacer(items, SPACING, 70, 1), items });
    }

  }

  update(travelled: number): void {
    for (const { ring } of this.rings) {
      ring.update(travelled, (item, z) => {
        item.position.z = z;
      });
    }
  }

  dispose(): void {
    disposeTree(this.owned);
    this.object.removeFromParent();
  }
}

/**
 * Make the windows already printed in the atlas glow, by reusing the diffuse
 * texture as an emissive map. Free detail: no geometry, no second texture.
 */
function litWindows(root: Object3D): void {
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.material as MeshStandardMaterial;
    const cloned = source.clone();
    if (cloned.map) {
      // Low intensity on purpose. The emissive map is the whole diffuse
      // texture, so a high value lights the brickwork as brightly as the
      // glass and the building reads as a glowing block rather than a dark
      // facade with lit windows.
      cloned.emissiveMap = cloned.map;
      cloned.emissive = new Color(PALETTE.orangeWarm);
      cloned.emissiveIntensity = 0.3;
    }
    cloned.color.lerp(new Color(PALETTE.ink), 0.7);
    mesh.material = cloned;
  });
}
