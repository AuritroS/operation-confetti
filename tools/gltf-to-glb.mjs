#!/usr/bin/env node
/**
 * Convert a sidecar .gltf (with its .bin and external texture) into a single
 * self-contained .glb, so a prop costs one request instead of three.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune } from '@gltf-transform/functions';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: node tools/gltf-to-glb.mjs <in.gltf> <out.glb>');
  process.exit(1);
}

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(input);
// These packs share one 1024px atlas across every prop, so each converted GLB
// embeds the whole thing. Prune drops the regions nothing references.
await doc.transform(dedup(), prune({ keepLeaves: false }));
await io.write(output, doc);
