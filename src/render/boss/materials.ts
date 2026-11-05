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

/** The tower's own fabric: cool, desaturated, always quieter than Aurora. */
export const concrete = satin(0x6b7490, 0.04, 0.78);
export const concreteDark = satin(0x3b4463, 0.04, 0.82);
