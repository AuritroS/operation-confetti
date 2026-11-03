#!/usr/bin/env node
/**
 * Stage runtime assets into public/ (design doc §10, §11).
 *
 * Pipeline: select -> copy -> prune -> resize -> report.
 *
 * Starts without Draco/KTX2 on purpose. The prune step is where the real win
 * is: both Rig_Medium animation libraries ship a ~6.9k-triangle mannequin mesh
 * that the game never draws, because clips are transplanted onto the character
 * skeletons instead.
 *
 * Steps that need an optional dependency degrade to a warning rather than
 * failing the build, so `npm run assets:build` works before every tool is
 * installed.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { basename, join } from 'node:path';

const SRC_OUT = 'public/models/src';
const STORY_OUT = 'public/story';

const A = 'assets/KayKit_Adventurers_2.0_FREE';
const CITY = 'assets/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf';
const HOLIDAY = 'assets/KayKit_Holiday_Bits_1.0_FREE/Assets/gltf';

/**
 * Copied as-is.
 *
 * The three characters are deliberately absent: `npm run assets:recolour`
 * produces matthew/aurora/guard.glb with the palette baked in, and staging
 * the originals too would ship 1.1 MB of superseded models. Kenney is gone
 * entirely — one art language now.
 */
const COPY = [];

/**
 * Holiday and city props arrive as .gltf with a sidecar .bin and a shared
 * atlas, which would mean three requests each at runtime. Converting to GLB
 * makes them self-contained and lets the atlas be embedded once per prop.
 */
const CONVERT = [
  `${HOLIDAY}/present_A_blue.gltf`,
  `${HOLIDAY}/present_C_red.gltf`,
  `${HOLIDAY}/candycane_small.gltf`,
  `${HOLIDAY}/snowball_cannon.gltf`,
  `${HOLIDAY}/snowman_A.gltf`,
  `${HOLIDAY}/bell_decorated.gltf`,
  `${CITY}/watertower.gltf`,
  `${CITY}/streetlight.gltf`,
  `${CITY}/car_police.gltf`,
  // Skyline silhouettes. Six shapes is enough variety for a scrolling city;
  // more would cost transfer for repeats nobody reads at distance.
  `${CITY}/building_A.gltf`,
  `${CITY}/building_B.gltf`,
  `${CITY}/building_C.gltf`,
  `${CITY}/building_D.gltf`,
  `${CITY}/building_E.gltf`,
  `${CITY}/building_F.gltf`,
  // Rooftop clutter.
  `${CITY}/box_A.gltf`,
  `${CITY}/box_B.gltf`,
  `${CITY}/dumpster.gltf`,
  `${CITY}/trash_A.gltf`,
  `${CITY}/bush.gltf`,
];

const PROPS_OUT = 'public/models/props';

/** Animation libraries: copied, then stripped of their mannequin mesh. */
const PRUNE = [
  `${A}/Animations/gltf/Rig_Medium/Rig_Medium_General.glb`,
  `${A}/Animations/gltf/Rig_Medium/Rig_Medium_MovementBasic.glb`,
];

/** Story panels, resized from the originals. */
const STORY = ['assets/matthew.png', 'assets/aurora.png'];

const warnings = [];

function ensure(dir) {
  mkdirSync(dir, { recursive: true });
}

function kb(path) {
  return existsSync(path) ? Math.round(statSync(path).size / 1024) : 0;
}

function copy(src, destDir) {
  if (!existsSync(src)) {
    warnings.push(`missing source: ${src}`);
    return null;
  }
  ensure(destDir);
  const dest = join(destDir, basename(src));
  copyFileSync(src, dest);
  return dest;
}

// ---- 1. clean -----------------------------------------------------------
// Only the generated subtrees are cleared; the recoloured characters written
// by tools/recolour.mjs live alongside and must survive.
rmSync('public/models/src', { recursive: true, force: true });
rmSync(PROPS_OUT, { recursive: true, force: true });
rmSync(STORY_OUT, { recursive: true, force: true });

// ---- 2. copy ------------------------------------------------------------
const report = [];

for (const src of COPY) {
  const dest = copy(src, SRC_OUT);
  if (dest) report.push({ file: basename(dest), step: 'copy', kb: kb(dest) });
}

// ---- 2b. convert sidecar glTF props to self-contained GLB ---------------
for (const src of CONVERT) {
  if (!existsSync(src)) {
    warnings.push(`missing source: ${src}`);
    continue;
  }
  ensure(PROPS_OUT);
  const name = basename(src, '.gltf');
  const dest = join(PROPS_OUT, `${name}.glb`);

  const res = spawnSync(process.execPath, ['tools/gltf-to-glb.mjs', src, dest], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (res.status !== 0) {
    warnings.push(`convert failed for ${name}: ${(res.stderr || res.stdout || '').trim().slice(0, 160)}`);
    continue;
  }
  report.push({ file: `${name}.glb`, step: 'gltf -> glb', kb: kb(dest) });
}

// ---- 3. strip animation libraries --------------------------------------
// These ship a mannequin mesh the game never draws, because clips are
// transplanted onto the character skeletons instead. See strip-anim-library.mjs
// for why `gltf-transform prune` alone cannot remove it.
for (const src of PRUNE) {
  const dest = copy(src, SRC_OUT);
  if (!dest) continue;
  const before = kb(dest);

  const res = spawnSync(process.execPath, ['tools/strip-anim-library.mjs', dest], {
    stdio: 'pipe',
    encoding: 'utf8',
  });

  if (res.status !== 0) {
    warnings.push(
      `strip failed for ${basename(dest)}: ${(res.stderr || res.stdout || '').trim().slice(0, 200)}`,
    );
    report.push({ file: basename(dest), step: 'copy (strip failed)', kb: before });
    continue;
  }

  report.push({ file: basename(dest), step: `strip (was ${before} KB)`, kb: kb(dest) });
}

// ---- 4. story images ----------------------------------------------------
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  warnings.push('sharp not installed; story images not resized. Run: npm i -D sharp');
}

for (const src of STORY) {
  if (!existsSync(src)) {
    warnings.push(`missing source: ${src}`);
    continue;
  }
  ensure(STORY_OUT);
  const name = basename(src, '.png');

  if (!sharp) {
    const dest = copy(src, STORY_OUT);
    if (dest) report.push({ file: basename(dest), step: 'copy (not resized)', kb: kb(dest) });
    continue;
  }

  // Portrait panels never need more than ~900px of width on a phone at 1.5x.
  const dest = join(STORY_OUT, `${name}.webp`);
  await sharp(src).resize({ width: 900, withoutEnlargement: true }).webp({ quality: 82 }).toFile(dest);
  report.push({ file: basename(dest), step: `webp (was ${kb(src)} KB)`, kb: kb(dest) });
}

// ---- 5. report ----------------------------------------------------------
console.log('');
console.table(report);

const total = report.reduce((a, r) => a + r.kb, 0);
console.log(`  staged total: ${total} KB on disk (pre-compression)`);
console.log('  budget reference: characters <=2 MB, city/props <=2 MB, story <=500 KB\n');

if (warnings.length) {
  console.log('  warnings:');
  for (const w of [...new Set(warnings)]) console.log(`    - ${w}`);
  console.log('');
}

// City inventory is listed, not bundled: exact prop selection is still open.
const cityCount = existsSync(CITY)
  ? readdirSync(CITY).filter((f) => f.endsWith('.gltf')).length
  : 0;
console.log(`  city pack: ${cityCount} gltf files available, ${CONVERT.filter((c) => c.includes('City')).length} staged`);
console.log('  (see src/assets/plan.ts for which asset fills which role)\n');
