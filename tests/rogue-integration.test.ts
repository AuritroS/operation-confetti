// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  AnimationMixer,
  LoopRepeat,
  PropertyBinding,
  type AnimationClip,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ATTACH_NODES, CLIPS } from '../src/assets/manifest';
import { AssetBundle } from '../src/assets/characters';

/**
 * Integration check for the asset pipeline against real files.
 *
 * Parses the staged GLBs through three.js itself rather than inspecting their
 * JSON, so this proves what the browser will actually do: that clips from the
 * Rig_Medium libraries bind to a cloned Rogue skeleton and move its bones.
 *
 * Runs on the output of `npm run assets:build`, which is what ships.
 *
 * Expect "Couldn't load texture ... URL.createObjectURL is not a function" on
 * stderr: jsdom has no object URLs, so embedded textures cannot decode here.
 * GLTFLoader degrades without it, and nothing below depends on texture data.
 */

/**
 * The runtime character is the recoloured export, not the raw pack model: the
 * sources are never staged any more, because shipping both would duplicate
 * 1.1 MB of superseded geometry. Testing what actually ships also means the
 * recolour is covered.
 */
const RUNTIME = 'public/models';
const STAGED = 'public/models/src';

/**
 * GLTFLoader.parse takes a buffer, so no network or image decoding is needed.
 *
 * The buffer must be allocated from THIS realm's ArrayBuffer: GLTFLoader
 * gates binary detection on `data instanceof ArrayBuffer`, and a Node Buffer's
 * underlying ArrayBuffer belongs to a different realm under jsdom, so the
 * check silently fails and the GLB is misread as JSON.
 */
function parseGlb(path: string) {
  const buf = readFileSync(path);
  const array = new ArrayBuffer(buf.byteLength);
  new Uint8Array(array).set(buf);
  return new Promise<{ scene: Object3D; animations: AnimationClip[] }>((resolve, reject) => {
    new GLTFLoader().parse(array, '', (gltf) => resolve(gltf), reject);
  });
}

/** Mirrors Actor.node(): glTF names are sanitized on import. */
function findNode(root: Object3D, name: string): Object3D | undefined {
  return (
    root.getObjectByName(name) ??
    root.getObjectByName(PropertyBinding.sanitizeNodeName(name))
  );
}

describe('Rogue asset pipeline', () => {
  it('parses the staged Rogue and both animation libraries', async () => {
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const general = await parseGlb(`${STAGED}/Rig_Medium_General.glb`);
    const movement = await parseGlb(`${STAGED}/Rig_Medium_MovementBasic.glb`);

    // The character itself carries no clips on this baseline.
    expect(rogue.animations).toHaveLength(0);
    expect(general.animations.length + movement.animations.length).toBe(26);
  }, 30_000);

  it('plays every clip the manifest names on a cloned Rogue skeleton', async () => {
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const general = await parseGlb(`${STAGED}/Rig_Medium_General.glb`);
    const movement = await parseGlb(`${STAGED}/Rig_Medium_MovementBasic.glb`);

    const library = new Map<string, AnimationClip>();
    for (const clip of [...general.animations, ...movement.animations]) {
      library.set(clip.name, clip);
    }

    // SkeletonUtils.clone is required: a plain clone shares the skeleton.
    const root = cloneSkinned(rogue.scene);
    const mixer = new AnimationMixer(root);

    for (const [role, name] of Object.entries(CLIPS.matthew)) {
      const clip = library.get(name);
      expect(clip, `manifest clip "${name}" for matthew.${role} is missing`).toBeDefined();

      const action = mixer.clipAction(clip as AnimationClip);
      action.setLoop(LoopRepeat, Infinity);
      action.reset();
      action.play();

      // tracks.length alone proves nothing: a clip keeps its tracks even when
      // none of them resolve. Check that every track's target node actually
      // exists in this skeleton, which is what makes the clip do anything.
      const unresolved = (clip as AnimationClip).tracks
        .map((t) => t.name.split('.')[0] as string)
        .filter((node, i, all) => all.indexOf(node) === i)
        .filter((node) => !root.getObjectByName(node));
      expect(unresolved, `matthew.${role} ("${name}") has unresolved tracks`).toEqual([]);

      action.stop();
    }
  }, 30_000);

  it('actually moves the skeleton when the run clip advances', async () => {
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const movement = await parseGlb(`${STAGED}/Rig_Medium_MovementBasic.glb`);

    const root = cloneSkinned(rogue.scene);
    const run = movement.animations.find((c) => c.name === CLIPS.matthew.run);
    expect(run).toBeDefined();

    // Sample a bone that a running cycle must rotate.
    const bone = findNode(root, 'upperleg.r');
    expect(bone, 'upperleg.r must exist in the Rogue skeleton').toBeDefined();

    const mixer = new AnimationMixer(root);
    mixer.clipAction(run as AnimationClip).play();

    mixer.update(0);
    const start = (bone as Object3D).quaternion.clone();

    // Advance a third of a second: a run cycle must have visibly moved.
    for (let i = 0; i < 20; i++) mixer.update(1 / 60);
    const later = (bone as Object3D).quaternion.clone();

    expect(start.angleTo(later)).toBeGreaterThan(0.01);
  }, 30_000);

  it('gives each clone an independent skeleton', async () => {
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const movement = await parseGlb(`${STAGED}/Rig_Medium_MovementBasic.glb`);
    const run = movement.animations.find((c) => c.name === CLIPS.matthew.run) as AnimationClip;

    const a = cloneSkinned(rogue.scene);
    const b = cloneSkinned(rogue.scene);

    // Animate only A. B must not move, or guards would all march in lockstep.
    const mixer = new AnimationMixer(a);
    mixer.clipAction(run).play();
    const boneB = findNode(b, 'upperleg.r') as Object3D;
    const before = boneB.quaternion.clone();

    for (let i = 0; i < 20; i++) mixer.update(1 / 60);

    expect(boneB.quaternion.angleTo(before)).toBe(0);
  }, 30_000);

  it('resolves attachment nodes through the production Actor lookup', async () => {
    // The manifest stores authentic glTF names with dots; Actor.node has to
    // bridge to the sanitized graph or the blaster silently never attaches.
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const bundle = new AssetBundle();
    // Inject the parsed result so this exercises Actor, not the network.
    (bundle as unknown as { gltfs: Map<string, unknown> }).gltfs.set('x', rogue);
    const actor = bundle.actor('x');

    for (const name of Object.values(ATTACH_NODES)) {
      expect(actor.node(name), `Actor.node("${name}") must resolve`).not.toBeNull();
    }
  }, 30_000);

  it('exposes the attachment nodes the blaster needs', async () => {
    const rogue = await parseGlb(`${RUNTIME}/matthew.glb`);
    const root = cloneSkinned(rogue.scene);
    for (const node of ['handslot.r', 'handslot.l', 'head']) {
      expect(findNode(root, node), `${node} must survive cloning`).toBeDefined();
    }
  }, 30_000);
});
