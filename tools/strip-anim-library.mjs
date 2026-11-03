#!/usr/bin/env node
/**
 * Reduce a Rig_Medium animation library to clips plus skeleton.
 *
 * `gltf-transform prune` cannot do this on its own: the mannequin mesh is
 * referenced by the scene, so prune considers it used. Here the mesh is
 * detached from its nodes first, which makes the mesh, its material and its
 * texture genuinely unreachable, and only then is prune able to drop them.
 *
 * Animation tracks are also resampled to remove keyframes that lie on the
 * line between their neighbours. This is lossless for linear tracks and the
 * dominant cost in these files, since 26 clips of 23 joints is far more data
 * than the geometry ever was.
 *
 * Usage: node tools/strip-anim-library.mjs <in.glb> [out.glb]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample } from '@gltf-transform/functions';
import { statSync } from 'node:fs';

const [input, output = input] = process.argv.slice(2);
if (!input) {
  console.error('usage: node tools/strip-anim-library.mjs <in.glb> [out.glb]');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
const root = doc.getRoot();

const before = {
  bytes: statSync(input).size,
  meshes: root.listMeshes().length,
  clips: root.listAnimations().length,
  joints: root.listSkins()[0]?.listJoints().length ?? 0,
};

// Detach every mesh and skin binding from the node graph. The joints stay,
// because the animation channels target them directly.
for (const node of root.listNodes()) {
  if (node.getMesh()) node.setMesh(null);
  if (node.getSkin()) node.setSkin(null);
}

await doc.transform(
  resample({ tolerance: 1e-4 }),
  dedup(),
  prune({ keepLeaves: false, keepAttributes: false }),
);

await io.write(output, doc);

const after = {
  bytes: statSync(output).size,
  meshes: doc.getRoot().listMeshes().length,
  clips: doc.getRoot().listAnimations().length,
};

const saved = Math.round((1 - after.bytes / before.bytes) * 100);
console.log(
  `  ${input.split('/').pop()}: ` +
    `${Math.round(before.bytes / 1024)} KB -> ${Math.round(after.bytes / 1024)} KB (-${saved}%)  ` +
    `meshes ${before.meshes}->${after.meshes}, clips ${before.clips}->${after.clips}, ` +
    `joints ${before.joints} kept`,
);

if (after.clips !== before.clips) {
  console.error('  ERROR: clip count changed; the library is no longer complete');
  process.exit(1);
}
