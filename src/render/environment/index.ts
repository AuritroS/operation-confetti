/**
 * Environment composer.
 *
 * Owns the layer list, the prop cache, and the `?layers=` review switch. The
 * game sees three calls — build, update, dispose — and nothing in
 * `src/levels/` changes at all.
 *
 * Review affordance:
 *   /?layers=sky,rooftop   render only those layers
 *   /?layers=none          bare gameplay, as it was before this existed
 *   /?layers=all           everything (the default)
 *
 * That is what makes a large environment reviewable in pieces: any layer can
 * be looked at alone, and gameplay can be checked with all of it stripped.
 */
import { Box3, Group, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { corridorOf, type CorridorGeometry } from './placement';
import { PROPS, type PropId } from './props';
import { LAYER_IDS, type EnvironmentLayer, type LayerContext, type LayerId } from './layer';
import { SkyLayer } from './sky';
import { SkylineLayer } from './skyline';
import { CityLayer } from './city';
import { RooftopLayer } from './rooftop';
import { ClutterLayer } from './clutter';
import { AtmosphereLayer } from './atmosphere';
import type { LevelConfig } from '../../levels/types';

export type { LayerId } from './layer';
export { LAYER_IDS } from './layer';

/** Parse `?layers=`. Absent means everything. */
export function requestedLayers(search = location.search): ReadonlySet<LayerId> {
  const raw = new URLSearchParams(search).get('layers');
  if (raw === null || raw === 'all') return new Set(LAYER_IDS);
  if (raw === 'none') return new Set();
  const wanted = new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is LayerId => (LAYER_IDS as readonly string[]).includes(s)),
  );
  return wanted;
}

export class Environment {
  readonly object = new Group();
  readonly layers: EnvironmentLayer[] = [];

  private constructor(
    private readonly props: Map<PropId, Object3D>,
    readonly corridor: CorridorGeometry,
  ) {}

  /**
   * Load every registered prop, then build the requested layers.
   *
   * Props are loaded once and cloned per use, so a prop appearing in three
   * layers costs one fetch.
   */
  static async build(
    level: LevelConfig,
    enabled: ReadonlySet<LayerId>,
    /**
     * How a prop's scene is fetched. Defaults to the network; the budget test
     * injects a disk reader so it can assert the real cost of the real graph
     * rather than a estimate computed from constants.
     */
    loadScene: (url: string) => Promise<Object3D> = async (url) =>
      (await new GLTFLoader().loadAsync(url)).scene,
  ): Promise<Environment> {
    const corridor = corridorOf(level);
    const props = new Map<PropId, Object3D>();

    // Only fetch what the enabled layers could ask for. With ?layers=sky this
    // skips every prop download, which keeps a single-layer review fast.
    if (enabled.size > 0 && !(enabled.size === 1 && enabled.has('sky'))) {
      await Promise.all(
        (Object.keys(PROPS) as PropId[]).map(async (id) => {
          try {
            const root = await loadScene(PROPS[id].url);
            root.scale.setScalar(PROPS[id].scale);
            props.set(id, root);
          } catch (e) {
            console.warn(`[environment] prop "${id}" failed to load`, e);
          }
        }),
      );
    }

    const env = new Environment(props, corridor);
    const ctx: LayerContext = {
      corridor,
      routeLength: level.routeLength,
      prop: (id) => env.cloneProp(id),
    };

    const factories: Record<LayerId, () => EnvironmentLayer> = {
      sky: () => new SkyLayer(),
      skyline: () => new SkylineLayer(ctx),
      city: () => new CityLayer(ctx),
      rooftop: () => new RooftopLayer(ctx),
      clutter: () => new ClutterLayer(ctx),
      atmosphere: () => new AtmosphereLayer(),
    };

    for (const id of LAYER_IDS) {
      if (!enabled.has(id)) continue;
      const layer = factories[id]();
      env.layers.push(layer);
      env.object.add(layer.object);
    }

    return env;
  }

  /** A scaled clone. Scale is baked by the registry, never by the caller. */
  private cloneProp(id: PropId): Object3D | null {
    const source = this.props.get(id);
    if (!source) return null;
    const clone = source.clone(true);
    // Sit the prop on its own base, whatever its authored origin.
    const box = new Box3().setFromObject(clone);
    clone.position.y -= box.min.y;
    return clone;
  }

  update(travelled: number, step: number): void {
    for (const layer of this.layers) layer.update(travelled, step);
  }

  dispose(): void {
    for (const layer of this.layers) layer.dispose();
    this.layers.length = 0;
    this.object.removeFromParent();
  }

  /** Live geometry cost, for the debug panel and the budget test. */
  measure(): { triangles: number; materials: number } {
    let triangles = 0;
    const materials = new Set<string>();
    this.object.traverse((o) => {
      const mesh = o as Object3D & {
        isMesh?: boolean;
        isPoints?: boolean;
        count?: number;
        geometry?: { index?: { count: number } | null; attributes: { position: { count: number } } };
        material?: { uuid: string } | { uuid: string }[];
      };
      if (!mesh.isMesh && !mesh.isPoints) return;
      const g = mesh.geometry;
      if (g) {
        const verts = g.index ? g.index.count : g.attributes.position.count;
        triangles += Math.floor(verts / 3) * (mesh.count ?? 1);
      }
      for (const m of Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []) {
        materials.add(m.uuid);
      }
    });
    return { triangles, materials: materials.size };
  }
}

