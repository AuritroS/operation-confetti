/**
 * The layer contract.
 *
 * Every piece of environment implements this and nothing more. Note what it
 * cannot do: `update` returns void and receives no event emitter, so a layer
 * has no mechanism for awarding a point, registering a collision, or
 * otherwise reaching into gameplay. Combined with the import-boundary test —
 * nothing under `environment/` may import from `levels/` or `core/scoring` —
 * decoration cannot become gameplay even by accident.
 */
import type { Object3D } from 'three';

export const LAYER_IDS = ['sky', 'skyline', 'city', 'rooftop', 'clutter', 'atmosphere'] as const;

export type LayerId = (typeof LAYER_IDS)[number];

export interface EnvironmentLayer {
  readonly id: LayerId;
  /** Parented into the scene by the composer. */
  readonly object: Object3D;
  /** `travelled` is route distance; `step` is the fixed simulation step. */
  update(travelled: number, step: number): void;
  /** Must release every geometry and material it created. */
  dispose(): void;
}

/** Loader handed to each layer, so no layer owns asset fetching. */
export interface LayerContext {
  /** A scaled, ready-to-place clone of a registered prop. */
  prop(id: import('./props').PropId): Object3D | null;
  /** Corridor geometry, for the placement API. */
  readonly corridor: import('./placement').CorridorGeometry;
  /** Route length in world units. */
  readonly routeLength: number;
}
