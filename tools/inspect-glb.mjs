#!/usr/bin/env node
/**
 * Report real metrics for GLB files: triangles, materials, textures, skins,
 * clips and attachment nodes. Phase 1's gate requires recorded asset metrics,
 * and this is the measurement, not an estimate.
 *
 * Usage: npm run assets:inspect [-- <file.glb> ...]
 *        with no arguments it inspects the pinned source set.
 */
import { readFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const PINNED = [
  'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Rogue_Hooded.glb',
  'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Mage.glb',
  'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf/Knight.glb',
  'assets/KayKit_Adventurers_2.0_FREE/Animations/gltf/Rig_Medium/Rig_Medium_General.glb',
  'assets/KayKit_Adventurers_2.0_FREE/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb',
  'assets/kenney_blaster-kit_2.1/Models/GLB format/blaster-f.glb',
];

function parseGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path} is not a GLB`);
  const total = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  let binBytes = 0;

  while (offset < total) {
    const chunkLength = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    if (chunkType === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8'));
    } else if (chunkType === 0x004e4942) {
      binBytes = chunkLength;
    }
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error(`${path} has no JSON chunk`);
  return { json, binBytes, fileBytes: buf.length };
}

function triangles(json) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      // Default mode 4 is TRIANGLES; other modes are not used by these packs.
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const accessor =
        prim.indices !== undefined
          ? json.accessors[prim.indices]
          : json.accessors[prim.attributes.POSITION];
      tris += Math.floor(accessor.count / 3);
    }
  }
  return tris;
}

const files = process.argv.slice(2).length ? process.argv.slice(2) : PINNED;
const rows = [];

for (const file of files) {
  if (!existsSync(file)) {
    console.error(`  missing: ${file}`);
    continue;
  }

  const { json, binBytes, fileBytes } = parseGlb(file);
  const prims = (json.meshes ?? []).flatMap((m) => m.primitives ?? []);
  const nodeNames = (json.nodes ?? []).map((n) => n.name ?? '');
  const attach = nodeNames.filter((n) => /^handslot\.|^head$/.test(n));

  rows.push({
    file: basename(file),
    kb: Math.round(fileBytes / 1024),
    binKb: Math.round(binBytes / 1024),
    tris: triangles(json),
    meshes: (json.meshes ?? []).length,
    prims: prims.length,
    mats: (json.materials ?? []).length,
    imgs: (json.images ?? []).length,
    joints: (json.skins ?? [])[0]?.joints.length ?? 0,
    clips: (json.animations ?? []).length,
    attach: attach.length,
  });

  if (json.animations?.length) {
    console.log(`\n  ${basename(file)} clips (${json.animations.length}):`);
    console.log(`    ${json.animations.map((a) => a.name).join(', ')}`);
  }
}

console.log('');
console.table(rows);

const totalKb = rows.reduce((a, r) => a + r.kb, 0);
const totalTris = rows.reduce((a, r) => a + r.tris, 0);
console.log(`  totals: ${totalKb} KB on disk, ${totalTris} triangles`);
console.log('  note: on-disk bytes are not transferred bytes (gzip/br applies).\n');
