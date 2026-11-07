/**
 * Rooftop clutter: water towers, AC units, vents, dumpsters, greenery and
 * decorative presents.
 *
 * Every item is placed through the `Placement` API, which cannot express a
 * position inside the playable corridor. That is the whole protection: there
 * is no reviewer check for "did this stray into a lane", because no
 * expressible placement can.
 *
 * Decorative presents use a shape and colour deliberately different from the
 * scored collectible, so a rich-looking roof never makes the pickup
 * ambiguous.
 */
import { Group, type Object3D } from 'three';
import type { EnvironmentLayer, LayerContext } from './layer';
import { TERRACE_Y } from './rooftop';
import { resolve, type Placement } from './placement';
import { disposeTree } from './skyline';
import type { PropId } from './props';

interface ClutterSpec {
  readonly prop: PropId;
  readonly placement: Placement;
  readonly spin?: number;
}

/**
 * The arrangement. Read as: which prop, which side, how far past the parapet.
 * An x coordinate cannot appear here.
 */
/**
 * Rooftop dressing, standing on the terraces the rooftop layer lays either
 * side of the parapets (`TERRACE_Y`, within `TERRACE_WIDTH`). `beyond` is
 * measured from the parapet's outer face; the widest prop here, the water
 * tower, spans about 2.6 units, so 2.0 keeps it on the terrace.
 */
const ARRANGEMENT: ClutterSpec[] = [
  { prop: 'watertower', placement: { side: 'left', beyond: 2.0, z: 0, y: TERRACE_Y } },
  { prop: 'acUnit', placement: { side: 'right', beyond: 0.6, z: 11, y: TERRACE_Y } },
  { prop: 'vent', placement: { side: 'left', beyond: 0.5, z: 22, y: TERRACE_Y } },
  { prop: 'bush', placement: { side: 'right', beyond: 1.4, z: 30, y: TERRACE_Y } },
  { prop: 'dumpster', placement: { side: 'right', beyond: 1.1, z: 41, y: TERRACE_Y } },
  { prop: 'giftDecor', placement: { side: 'left', beyond: 0.7, z: 52, y: TERRACE_Y } },
  { prop: 'acUnit', placement: { side: 'left', beyond: 1.6, z: 64, y: TERRACE_Y } },
  { prop: 'bush', placement: { side: 'right', beyond: 0.6, z: 70, y: TERRACE_Y } },
  { prop: 'trash', placement: { side: 'right', beyond: 1.9, z: 84, y: TERRACE_Y } },
  { prop: 'vent', placement: { side: 'left', beyond: 1.2, z: 93, y: TERRACE_Y } },
  { prop: 'watertower', placement: { side: 'right', beyond: 2.0, z: 106, y: TERRACE_Y } },
  { prop: 'acUnit', placement: { side: 'left', beyond: 0.5, z: 118, y: TERRACE_Y } },
  { prop: 'giftDecor', placement: { side: 'right', beyond: 0.8, z: 130, y: TERRACE_Y } },
  { prop: 'dumpster', placement: { side: 'left', beyond: 1.3, z: 141, y: TERRACE_Y } },
  { prop: 'bush', placement: { side: 'left', beyond: 0.5, z: 152, y: TERRACE_Y } },
];
const STREET: ClutterSpec[] = [
  // Standing on the street plane the city layer provides, at y = -12.
  { prop: 'carPolice', placement: { side: 'left', beyond: 6.0, z: 36, y: -12 } },
  { prop: 'streetlight', placement: { side: 'right', beyond: 5.4, z: 20, y: -12 } },
  { prop: 'streetlight', placement: { side: 'left', beyond: 5.4, z: 74, y: -12 } },
  { prop: 'streetlight', placement: { side: 'right', beyond: 5.4, z: 128, y: -12 } },
];

const PERIOD = 164;

/**
 * Where clutter first appears. Past the fog horizon, for the same reason as
 * the city: at 70 units props snapped in at 85% visibility.
 */
export const SPAWN_DISTANCE = 150;

export class ClutterLayer implements EnvironmentLayer {
  readonly id = 'clutter' as const;
  readonly object = new Group();

  private readonly items: Object3D[] = [];
  private readonly baseZ: number[] = [];

  constructor(ctx: LayerContext) {
    for (const spec of [...ARRANGEMENT, ...STREET]) {
      const prop = ctx.prop(spec.prop);
      if (!prop) continue;

      // The only place decoration gets a position, and it is derived.
      const at = resolve(ctx.corridor, spec.placement);
      prop.position.set(at.x, at.y, 0);
      // Face varied directions so repeats do not read as copies.
      prop.rotation.y = ((this.items.length * 47) % 360) * (Math.PI / 180);

      this.items.push(prop);
      this.baseZ.push(at.z);
      this.object.add(prop);
    }
  }

  /**
   * Each item holds its authored offset within one repeating block, rather
   * than wrapping independently. A shared RingPlacer would scatter the
   * arrangement; the point is that the composition repeats, not the props.
   */
  update(travelled: number): void {
    for (const [i, item] of this.items.entries()) {
      const base = this.baseZ[i] ?? 0;
      const ahead = ((base - travelled) % PERIOD + PERIOD) % PERIOD;
      item.position.z = -(ahead > SPAWN_DISTANCE ? ahead - PERIOD : ahead);
    }
  }

  dispose(): void {
    disposeTree(this.items);
    this.items.length = 0;
    this.object.removeFromParent();
  }
}
