/**
 * Character loading, clip transplanting and actor instancing (design doc §10, §11).
 *
 * The 2.0 FREE character GLBs carry no animations. Both Rig_Medium libraries
 * use a skeleton whose joint names match the characters exactly, so an
 * AnimationClip from a library plays on a character with no retargeting — the
 * track names resolve against identically named bones.
 */
import { AnimationClip, AnimationMixer, Group, LoopOnce, LoopRepeat, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

export type ProgressFn = (loaded: number, total: number, label: string) => void;

export class AssetBundle {
  private readonly loader = new GLTFLoader();
  private readonly gltfs = new Map<string, GLTF>();
  readonly clips = new Map<string, AnimationClip>();

  async loadAll(paths: readonly string[], onProgress?: ProgressFn): Promise<void> {
    let done = 0;
    for (const path of paths) {
      const gltf = await this.loader.loadAsync(path);
      this.gltfs.set(path, gltf);
      // Collect every clip the file carries into one shared library.
      for (const clip of gltf.animations) {
        if (!this.clips.has(clip.name)) this.clips.set(clip.name, clip);
      }
      done++;
      onProgress?.(done, paths.length, path);
    }
  }

  get(path: string): GLTF {
    const g = this.gltfs.get(path);
    if (!g) throw new Error(`Asset not loaded: ${path}`);
    return g;
  }

  clipNames(): string[] {
    return [...this.clips.keys()].sort();
  }

  /**
   * Build an independent animated instance. SkeletonUtils.clone is required:
   * a plain Object3D.clone shares the skeleton and every copy would move
   * together.
   */
  actor(path: string): Actor {
    const gltf = this.get(path);
    const root = cloneSkinned(gltf.scene) as Group;
    return new Actor(root, this.clips);
  }

  /** Dispose geometries and textures. Call only for genuinely unused files. */
  dispose(path: string): void {
    const gltf = this.gltfs.get(path);
    if (!gltf) return;
    gltf.scene.traverse((o: Object3D) => {
      const mesh = o as Object3D & { geometry?: { dispose(): void }; material?: unknown };
      mesh.geometry?.dispose();
      const mat = mesh.material;
      for (const m of Array.isArray(mat) ? mat : mat ? [mat] : []) {
        const material = m as { dispose?(): void; map?: { dispose(): void } | null };
        material.map?.dispose();
        material.dispose?.();
      }
    });
    this.gltfs.delete(path);
  }
}

export class Actor {
  readonly mixer: AnimationMixer;
  private current: string | null = null;

  constructor(
    readonly root: Group,
    private readonly library: Map<string, AnimationClip>,
  ) {
    this.mixer = new AnimationMixer(root);
  }

  /** Find an attachment node such as `handslot.r`. */
  node(name: string): Object3D | null {
    return this.root.getObjectByName(name) ?? null;
  }

  /** Parent a prop to an attachment node, preserving the node's transform. */
  attach(name: string, prop: Object3D): boolean {
    const slot = this.node(name);
    if (!slot) return false;
    slot.add(prop);
    return true;
  }

  get currentClip(): string | null {
    return this.current;
  }

  /**
   * Cross-fade to a clip by name. Returns false if the clip is missing, so a
   * bad manifest entry surfaces as a visible no-op rather than a crash.
   */
  play(clipName: string, { fade = 0.18, loop = true, clampWhenFinished = false } = {}): boolean {
    if (this.current === clipName) return true;
    const clip = this.library.get(clipName);
    if (!clip) {
      console.warn(`[characters] missing clip "${clipName}"`);
      return false;
    }

    const next = this.mixer.clipAction(clip);
    next.reset();
    next.setLoop(loop ? LoopRepeat : LoopOnce, loop ? Infinity : 1);
    next.clampWhenFinished = clampWhenFinished;

    const prevName = this.current;
    const prev = prevName ? this.library.get(prevName) : undefined;
    if (prev && fade > 0) {
      this.mixer.clipAction(prev).crossFadeTo(next, fade, false);
      next.play();
    } else {
      next.play();
    }

    this.current = clipName;
    return true;
  }

  update(step: number): void {
    this.mixer.update(step);
  }

  /** Release mixer state. Required so replays do not accumulate actions. */
  dispose(): void {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.root.removeFromParent();
    this.current = null;
  }
}
