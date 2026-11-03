/**
 * Rogue-backed player visual (design doc §12 Phase 1 / Phase 4).
 *
 * Proves the asset pipeline against real gameplay: the pinned Rogue_Hooded
 * mesh with clips transplanted from the Rig_Medium libraries, driven by the
 * same `PlayerVisual` interface the capsule implements. Gameplay never learns
 * which one it got, so colliders and timings are identical either way.
 *
 * Loading is deliberately non-blocking — play starts on the capsule and the
 * Rogue replaces it when ready — so a slow or failed asset load degrades to a
 * playable primitive instead of a stalled screen.
 */
import { Box3, Group, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import { AssetBundle, type Actor } from '../assets/characters';
import { CHARACTER_HEIGHT, CLIPS, HIDDEN_MESHES, SOURCES } from '../assets/manifest';
import type { PlayerVisual } from './primitives';

/** The Rogue faces +Z in source; the camera looks down -Z, so turn it around. */
const FACING_Y = Math.PI;

export interface RogueLoadResult {
  visual: PlayerVisual;
  /** Clip names actually present, for the debug panel. */
  clipCount: number;
}

export async function loadRoguePlayer(): Promise<RogueLoadResult> {
  const bundle = new AssetBundle();
  await bundle.loadAll([SOURCES.characters.matthew, ...SOURCES.animationLibraries]);

  const actor = bundle.actor(SOURCES.characters.matthew);
  actor.root.rotation.y = FACING_Y;
  actor.hideMeshes(HIDDEN_MESHES['matthew'] ?? []);
  fitToHeight(actor.root, CHARACTER_HEIGHT);

  // Running is the resting state on an auto-scrolling route.
  if (!actor.play(CLIPS.matthew.run)) {
    throw new Error(`clip "${CLIPS.matthew.run}" missing from the libraries`);
  }

  const originals = collectMaterials(actor.root);

  return {
    clipCount: bundle.clips.size,
    visual: new RogueVisual(actor, originals),
  };
}

/**
 * Scale an actor so its bind-pose height matches the gameplay height, and sit
 * its feet on the ground. Measured rather than assumed: the packs author
 * characters at inconsistent heights (Rogue 2.17, Knight 2.54, Mage 2.65).
 */
function fitToHeight(root: Object3D, target: number): number {
  const box = new Box3().setFromObject(root);
  const height = box.getSize(new Vector3()).y;
  if (height <= 0) return 1;
  const scale = target / height;
  root.scale.setScalar(scale);
  // Re-measure after scaling so the ground offset accounts for any authored
  // offset in the source model rather than assuming feet are at the origin.
  const scaled = new Box3().setFromObject(root);
  root.position.y -= scaled.min.y;
  return scale;
}

type MaterialRecord = { material: MeshStandardMaterial; original: number };

function collectMaterials(root: Object3D): MaterialRecord[] {
  const out: MaterialRecord[] = [];
  root.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      const mat = m as MeshStandardMaterial;
      // Clone so a flash on this instance cannot tint the shared source
      // material, which every future clone would inherit.
      const cloned = mat.clone();
      if (Array.isArray(mesh.material)) {
        mesh.material[mesh.material.indexOf(mat)] = cloned;
      } else {
        mesh.material = cloned;
      }
      out.push({ material: cloned, original: cloned.emissive.getHex() });
    }
  });
  return out;
}

class RogueVisual implements PlayerVisual {
  readonly object: Group;
  private flashing = false;

  constructor(
    private readonly actor: Actor,
    private readonly materials: MaterialRecord[],
  ) {
    this.object = new Group();
    this.object.add(actor.root);
  }

  setHitFlash(active: boolean): void {
    if (active === this.flashing) return;
    this.flashing = active;
    // Emissive rather than base colour: the Rogue shares one atlas across
    // skin and clothing, so tinting the base colour would recolour the face.
    for (const { material, original } of this.materials) {
      material.emissive.setHex(active ? 0x7a1420 : original);
    }
  }

  update(step: number, moving: boolean): void {
    this.actor.play(moving ? CLIPS.matthew.run : CLIPS.matthew.idle);
    this.actor.update(step);
  }

  dispose(): void {
    this.setHitFlash(false);
    for (const { material } of this.materials) material.dispose();
    this.actor.dispose();
    this.object.removeFromParent();
  }
}
