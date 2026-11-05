import { MeshBasicMaterial, MeshStandardMaterial } from 'three';

/**
 * One material cache for the whole Level 3 scene.
 *
 * `batchArchitecture` merges static meshes by `material.uuid`, so anything
 * that shares a material collapses into a single draw. Keeping the cache here
 * rather than per-module means the tower's concrete and the terrace's trim are
 * literally the same material object and batch together, instead of producing
 * two near-identical draws that only differ by which file created them.
 */
const satinCache = new Map<string, MeshStandardMaterial>();
const luminousCache = new Map<string, MeshBasicMaterial>();

export function satin(color: number, metalness = 0.03, roughness = 0.67): MeshStandardMaterial {
  const key = `${color}:${metalness}:${roughness}`;
  let material = satinCache.get(key);
  if (!material) {
    material = new MeshStandardMaterial({ color, metalness, roughness });
    satinCache.set(key, material);
  }
  return material;
}

export function luminous(color: number, opacity = 1): MeshBasicMaterial {
  const key = `${color}:${opacity}`;
  let material = luminousCache.get(key);
  if (!material) {
    material = new MeshBasicMaterial({
      color, transparent: opacity < 1, opacity, depthWrite: opacity === 1,
    });
    luminousCache.set(key, material);
  }
  return material;
}

export const gold = satin(0xe7ae61, 0.72, 0.24);
export const paleGold = satin(0xffd890, 0.65, 0.3);
export const velvet = satin(0x40194e, 0.02, 0.92);
export const wine = satin(0x72264f, 0.03, 0.8);
export const midnight = satin(0x141d3a);

/**
 * Consolidated environment tones.
 *
 * Batching merges by material identity, so two meshes in near-identical blues
 * cost two draw calls however alike they look. The scene had reached 56
 * distinct materials across 57 meshes — nothing left for the batcher to merge,
 * and several of those carried a dozen triangles each. Prefer one of these
 * over a new near-duplicate unless the difference is one a player would
 * actually notice.
 */
export const deckStone = satin(0x222b46);
export const citySlab = satin(0x16203d);
export const plumDeep = satin(0x301a42);
export const cream = satin(0xfff2e3);
export const lampGlow = luminous(0xffc471);

/**
 * The tower's own fabric: pale concrete, as the landmark actually is, with the
 * night colour carried by the neon and glow sleeves in `tower.ts` rather than
 * baked into the stone. See `assets/aurora.png` for the lit reference.
 */
export const concrete = satin(0xc6cde0, 0.05, 0.74);
export const concreteDark = satin(0x97a0ba, 0.05, 0.8);
