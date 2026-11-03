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
const ARRANGEMENT: ClutterSpec[] = [
  { prop: 'watertower', placement: { side: 'left', beyond: 1.6, z: 0 } },
  { prop: 'acUnit', placement: { side: 'right', beyond: 0.35, z: 14 } },
  { prop: 'vent', placement: { side: 'left', beyond: 0.3, z: 27 } },
  { prop: 'dumpster', placement: { side: 'right', beyond: 0.9, z: 41 } },
  { prop: 'giftDecor', placement: { side: 'left', beyond: 0.4, z: 55 } },
  { prop: 'bush', placement: { side: 'right', beyond: 0.5, z: 68 } },
  { prop: 'acUnit', placement: { side: 'left', beyond: 0.8, z: 82 } },
  { prop: 'trash', placement: { side: 'right', beyond: 0.3, z: 95 } },
  { prop: 'watertower', placement: { side: 'right', beyond: 2.1, z: 109 } },
  { prop: 'vent', placement: { side: 'left', beyond: 0.35, z: 122 } },
  { prop: 'giftDecor', placement: { side: 'right', beyond: 0.45, z: 136 } },
  { prop: 'bush', placement: { side: 'left', beyond: 0.6, z: 150 } },
];

/** Street level, well below the roof: the Interpol nod and lamp posts. */
const STREET: ClutterSpec[] = [
  { prop: 'carPolice', placement: { side: 'left', beyond: 5.2, z: 36, y: -9.4 } },
  { prop: 'streetlight', placement: { side: 'right', beyond: 4.6, z: 70, y: -9.4 } },
  { prop: 'streetlight', placement: { side: 'left', beyond: 4.6, z: 128, y: -9.4 } },
];

const PERIOD = 164;

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
      item.position.z = -(ahead > 70 ? ahead - PERIOD : ahead);
    }
  }

  dispose(): void {
    disposeTree(this.items);
    this.items.length = 0;
    this.object.removeFromParent();
  }
}
