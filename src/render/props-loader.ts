/**
 * Loads the props gameplay needs, scaled by the registry.
 *
 * Separate from the environment's loader because the two have different
 * lifetimes — the environment builds once, while gameplay visuals are rebuilt
 * on every replay — but both read the same registry, so a prop can never
 * appear at one scale in the world and another in play.
 */
import { Box3, type Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { PROPS, type PropId } from './environment/props';

/** Props gameplay uses. Loading only these keeps the first run quick. */
const NEEDED: PropId[] = ['gift', 'cannon', 'snowman', 'bell'];

export type PropProvider = (id: PropId) => Object3D | null;

export async function loadGameplayProps(): Promise<PropProvider> {
  const loader = new GLTFLoader();
  const loaded = new Map<PropId, Object3D>();

  await Promise.all(
    NEEDED.map(async (id) => {
      try {
        const gltf = await loader.loadAsync(PROPS[id].url);
        const root = gltf.scene;
        root.scale.setScalar(PROPS[id].scale);
        loaded.set(id, root);
      } catch (e) {
        console.warn(`[props] "${id}" failed to load; using a primitive`, e);
      }
    }),
  );

  return (id) => {
    const source = loaded.get(id);
    if (!source) return null;
    const clone = source.clone(true);
    // Sit it on its own base, whatever the authored origin.
    const box = new Box3().setFromObject(clone);
    clone.position.y -= box.min.y;
    return clone;
  };
}
