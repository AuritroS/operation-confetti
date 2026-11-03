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
import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  type Object3D,
} from 'three';
import { PALETTE } from '../palette';
import type { EnvironmentLayer, LayerContext } from './layer';
import { RingPlacer } from './ring';
import { disposeTree } from './skyline';
import type { PropId } from './props';

const SHAPES: PropId[] = ['buildingE', 'buildingA', 'buildingF', 'buildingB'];
const PER_SIDE = 4;
const SPACING = 34;

/**
 * Where a building first appears, in units ahead.
 *
 * Must sit past the fog horizon. The previous value was 70, where fog left
 * buildings 85% visible, so they snapped into view at near-full opacity.
 * At the current exponential density, 130 units is about 95% fogged — a
 * building arriving there is invisible and fades in.
 *
 * Capped by the pool's period (PER_SIDE * SPACING = 136), which is why no
 * extra geometry was needed to fix the popping.
 */
export const SPAWN_DISTANCE = 130;

/** Street level, well below the roof. */
const STREET_Y = -12;

export class CityLayer implements EnvironmentLayer {
  readonly id = 'city' as const;
  readonly object = new Group();

  private readonly rings: { ring: RingPlacer; items: Object3D[] }[] = [];
  private readonly owned: Object3D[] = [];
  private readonly street: Mesh;

  constructor(ctx: LayerContext) {
    for (const sign of [-1, 1] as const) {
      const items: Object3D[] = [];
      for (let i = 0; i < PER_SIDE; i++) {
        const prop = ctx.prop(SHAPES[(i + (sign > 0 ? 2 : 0)) % SHAPES.length] as PropId);
        if (!prop) continue;
        litWindows(prop);
        // Set well back and based below street level, so only upper floors
        // clear the parapet and the facades meet the ground instead of
        // ending in mid-air. Close buildings read as a street, not a roof.
        prop.position.set(sign * (ctx.corridor.edge + 11 + (i % 2) * 4), STREET_Y - 0.5, 0);
        items.push(prop);
        this.object.add(prop);
        this.owned.push(prop);
      }
      this.rings.push({ ring: new RingPlacer(items, SPACING, SPAWN_DISTANCE, 1), items });
    }

    /**
     * The street.
     *
     * Everything below the roof was standing in void: building bases ended
     * in mid-air, and the parked car and lamp posts floated. One dark plane
     * grounds all of it, for one draw call and two triangles.
     */
    this.street = new Mesh(
      new PlaneGeometry(190, 420),
      new MeshStandardMaterial({ color: PALETTE.ink, roughness: 1 }),
    );
    this.street.rotation.x = -Math.PI / 2;
    this.street.position.set(0, STREET_Y, -120);
    this.object.add(this.street);
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
    this.street.geometry.dispose();
    (this.street.material as MeshStandardMaterial).dispose();
    this.street.removeFromParent();
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
