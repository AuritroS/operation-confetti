#!/usr/bin/env node
/** Reproducible Level 3 asset exports. Writes only this worktree's ignored public/models. */
import { readFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, getBounds } from '@gltf-transform/functions';

const props = JSON.parse(readFileSync('src/assets/boss/catalog.json', 'utf8'));
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
rmSync('public/models/level3', { recursive: true, force: true });

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`Asset command failed: ${args.join(' ')}`);
}

for (const id of ['matthew', 'aurora']) run(['tools/recolour.mjs', '--only', id]);

const particleNames = ['magic_01', 'magic_03', 'circle_03', 'muzzle_02', 'star_06', 'smoke_03'];
mkdirSync('public/level3-particles', { recursive: true });
for (const name of particleNames) {
  await sharp(`assets/level3-particles/${name}.png`)
    .resize(256, 256)
    .png()
    .toFile(`public/level3-particles/${name}.png`);
}

const animationRoot = 'assets/KayKit_Adventurers_2.0_FREE/Animations/gltf/Rig_Medium';
for (const name of ['Rig_Medium_General', 'Rig_Medium_MovementBasic']) {
  const out = `public/models/level3/animations/${name}.glb`;
  mkdirSync(dirname(out), { recursive: true });
  run(['tools/strip-anim-library.mjs', `${animationRoot}/${name}.glb`, out]);
}

const report = [];
for (const prop of props) {
  const dest = join('public', prop.url.slice(1));
  if (!dest.startsWith('public/models/level3/')) throw new Error(`Unexpected output: ${dest}`);
  const doc = await io.read(prop.source);
  const scene = doc.getRoot().listScenes()[0];
  if (!scene) throw new Error(`No scene: ${prop.source}`);
  const box = getBounds(scene);
  const nativeHeight = box.max[1] - box.min[1];
  if (Math.abs(nativeHeight - prop.nativeHeight) > 0.015) {
    throw new Error(`${prop.id}: catalog height ${prop.nativeHeight} differs from source ${nativeHeight}`);
  }
  await doc.transform(dedup(), prune({ keepLeaves: false }));
  mkdirSync(dirname(dest), { recursive: true });
  await io.write(dest, doc);
  let triangles = 0;
  for (const mesh of doc.getRoot().listMeshes()) for (const primitive of mesh.listPrimitives()) {
    triangles += Math.floor((primitive.getIndices()?.getCount() ?? primitive.getAttribute('POSITION')?.getCount() ?? 0) / 3);
  }
  report.push({ id: prop.id, output: relative('public', dest), height: +nativeHeight.toFixed(2), triangles, kb: Math.round(statSync(dest).size / 1024) });
}
console.table(report);
console.log(`Selected prop exports: ${report.reduce((sum, row) => sum + row.kb, 0)} KB on disk; loaded scene cost depends on visible instances.`);
