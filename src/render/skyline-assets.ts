/**
 * Loads the level 2 street props, scaled by the street registry.
 *
 * Exposes two shapes because the scene needs both:
 *
 *   `prop(id)`      a cloned Object3D, for the handful of one-off objects
 *   `batch(id, n)`  an InstancedMesh, for the road and the canyon walls
 *
 * The batch path exists because the canyon is the only thing in this level
 * with a high repeat count: a 576-unit route needs road under all of it and
 * buildings down both sides, and cloning those would spend a draw call per
 * tile. KayKit authors each building and road tile as a single mesh with a
 * single material, so they instance without any merging work.
 *
 * Scale and the base offset are baked into the batched geometry at load, so
 * an instance matrix only ever carries position and rotation. Keeping scale
 * out of the matrix is what stops the "collected gift ballooned over the
 * player" class of bug, where one writer sets a scale and another overwrites
 * it.
 *
 * Loading is non-blocking by contract: every getter returns null on failure
 * and the scene keeps its primitive. A missing asset must degrade to a
 * playable level, never a stalled one.
 */
import {
  Box3,
  Color,
  BufferGeometry,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { STREET_PROPS, STREET_PROP_IDS, type StreetPropId } from './skyline-props';

interface Batchable {
  geometry: BufferGeometry;
  material: Material;
  /** Scaled half-extents, so callers can place by face instead of centre. */
  half: { x: number; y: number; z: number };
  /**
   * Scaled min/max about the prop's own origin.
   *
   * Needed because these models are NOT centred. A KayKit building carries
   * its shopfront and awning on the +Z face, so it reaches 0.80 one way and
   * 0.65 the other — and placing a facade on a line requires knowing which.
   * Half-extents average that asymmetry away and put the building 0.075
   * units off the kerb.
   */
  box: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } };
}

export interface StreetAssets {
  /** A scaled, ground-seated clone, or null if the source failed to load. */
  prop(id: StreetPropId): Object3D | null;
  /** An InstancedMesh with scale and base offset already baked in. */
  batch(id: StreetPropId, count: number): InstancedMesh | null;
  /**
   * Scaled half-extents of a batched prop, or null if it did not load.
   *
   * Needed because the canyon must be placed by its FACE, not its centre:
   * these buildings scale to 15-30 units wide, so centring them on a fixed
   * line put their inner faces inside the road and one of them filled half
   * the frame. Face placement keeps the street a constant width whichever
   * shape the hash picks.
   */
  half(id: StreetPropId): { x: number; y: number; z: number } | null;
  /** Scaled min/max about the prop's origin, for placing by an actual face. */
  box(id: StreetPropId): Batchable['box'] | null;
  /** Ids that failed, for the debug panel and the review tool. */
  readonly missing: readonly StreetPropId[];
  dispose(): void;
}

/**
 * Pull a Kenney prop toward the project palette.
 *
 * The two packs are different art languages. Kenney's City Kit is authored
 * bright, for a daylit isometric city; level 1 established a near-black navy
 * night. Dropped in untouched the road read as pale lavender against it and
 * the two halves of the street looked like different games.
 *
 * The whole pack shares one 11 KB colormap, so this is a per-material colour
 * multiply rather than a texture rebuild — it keeps the palette relationships
 * the pack already gets right and just moves the whole set into the night.
 */
const NIGHT = new Color(0x1b2740);
/**
 * Raised from 0.55 when the fog was thinned from 0.011 to 0.009.
 *
 * The first value leaned on fog to do part of the toning, so thinning the
 * fog to let the player read further ahead also let the pale Kenney palette
 * back through in the near field — the road came out lavender again. Tone
 * belongs in the material, where it does not move when a view constant does.
 */
const NIGHT_MIX = 0.72;

/**
 * Put every mesh under `root` on one shared material, toning it on first use.
 *
 * Returns the shared material so the next prop can adopt it.
 */
function share(root: Object3D, existing: Material | null): Material | null {
  let shared = existing;
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const current = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    if (!current) return;
    if (!shared) {
      shared = current;
      tone(shared);
    }
    mesh.material = shared;
  });
  return shared;
}

/**
 * Pull the Kenney palette toward the project's night.
 *
 * The two packs are different art languages: Kenney's City Kit is authored
 * bright for a daylit isometric city, while level 1 established a near-black
 * navy night. Dropped in untouched the road read as pale lavender and the
 * two halves of the street looked like different games.
 */
function tone(material: Material): void {
  const standard = material as unknown as { color?: Color };
  standard.color?.lerp(NIGHT, NIGHT_MIX);
}

export async function loadStreetAssets(): Promise<StreetAssets> {
  const loader = new GLTFLoader();
  const sources = new Map<StreetPropId, Object3D>();
  const batchable = new Map<StreetPropId, Batchable>();
  const missing: StreetPropId[] = [];
  const owned: (BufferGeometry | Material)[] = [];
  /**
   * One material for the entire Kenney set.
   *
   * Every model in that pack samples the same 11 KB colormap, so twenty
   * separate materials were twenty GPU state changes describing identical
   * state. Sharing one also makes obstacle groups mergeable — a barricade of
   * barriers, cones and beacons collapses from a dozen draw calls to one.
   */
  let kenneyMaterial: Material | null = null;

  await Promise.all(
    STREET_PROP_IDS.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(STREET_PROPS[id].url);
        const root = gltf.scene;
        root.scale.setScalar(STREET_PROPS[id].scale);
        if (STREET_PROPS[id].url.includes('/models/city/')) {
          kenneyMaterial = share(root, kenneyMaterial);
          if (kenneyMaterial && !owned.includes(kenneyMaterial)) owned.push(kenneyMaterial);
        }
        sources.set(id, root);

        // Bake a batchable copy. Most props are a single mesh; the cars are
        // four primitives that all share ONE material, so they merge into a
        // single geometry rather than falling back to four draw calls each.
        root.updateMatrixWorld(true);
        const meshes: Mesh[] = [];
        root.traverse((o) => {
          if ((o as Mesh).isMesh) meshes.push(o as Mesh);
        });
        const material = meshes[0]?.material;
        const oneMaterial =
          meshes.length > 0 &&
          !Array.isArray(material) &&
          meshes.every((m) => m.material === material);

        if (oneMaterial && material) {
          // Each primitive carries its own local transform under the root,
          // so bake world matrices in before merging or the car comes apart.
          const parts = meshes.map((m) => {
            const g = m.geometry.clone();
            g.applyMatrix4(m.matrixWorld);
            return g;
          });
          const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
          for (const part of parts) if (part !== merged) part.dispose();

          if (merged) {
            // `matrixWorld` already carries the registry scale, applied to
            // the root above, so it must not be applied a second time here.
            merged.computeBoundingBox();
            const min = merged.boundingBox?.min.y ?? 0;
            // Seat it on its own base, whatever the authored origin, so a
            // placement only has to say where on the ground it goes.
            merged.applyMatrix4(new Matrix4().makeTranslation(0, -min, 0));
            merged.computeBoundingBox();
            merged.computeBoundingSphere();
            const bounds = merged.boundingBox;
            const zero = { x: 0, y: 0, z: 0 };
            batchable.set(id, {
              geometry: merged,
              material,
              half: {
                x: bounds ? (bounds.max.x - bounds.min.x) / 2 : 0,
                y: bounds ? (bounds.max.y - bounds.min.y) / 2 : 0,
                z: bounds ? (bounds.max.z - bounds.min.z) / 2 : 0,
              },
              box: bounds
                ? {
                    min: { x: bounds.min.x, y: bounds.min.y, z: bounds.min.z },
                    max: { x: bounds.max.x, y: bounds.max.y, z: bounds.max.z },
                  }
                : { min: { ...zero }, max: { ...zero } },
            });
            owned.push(merged);
          }
        }
      } catch (e) {
        missing.push(id);
        console.warn(`[skyline] "${id}" failed to load; keeping the primitive`, e);
      }
    }),
  );

  return {
    missing,
    prop(id) {
      const source = sources.get(id);
      if (!source) return null;
      const clone = source.clone(true);
      const box = new Box3().setFromObject(clone);
      clone.position.y -= box.min.y;
      return clone;
    },
    half(id) {
      return batchable.get(id)?.half ?? null;
    },
    box(id) {
      return batchable.get(id)?.box ?? null;
    },
    batch(id, count) {
      const entry = batchable.get(id);
      if (!entry || count <= 0) return null;
      const mesh = new InstancedMesh(entry.geometry, entry.material, count);
      // The scene scrolls props by rewriting matrices every frame; three.js
      // cannot cull what it cannot predict, and the bounding sphere of the
      // instanced set would be wrong anyway.
      mesh.frustumCulled = false;
      return mesh;
    },
    dispose() {
      for (const item of owned) item.dispose();
      owned.length = 0;
      sources.clear();
      batchable.clear();
    },
  };
}
