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
const KENNEY = 'assets/kenney_city-kit-roads/Models/GLB format';
const BLASTER = 'assets/kenney_blaster-kit_2.1/Models/GLB format';
const KENNEY_OUT = 'public/models/city';

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
  `${HOLIDAY}/present_A_yellow.gltf`,
  `${HOLIDAY}/present_C_red.gltf`,
  `${HOLIDAY}/candycane_small.gltf`,
  // The confetti blaster, and in level 2 the thing the grapple line
  // leaves from. `manifest.ts` has pointed at this path since the asset
  // plan was written; it was simply never added here, so the probe has
  // been reporting "blaster unavailable" against a 404.
  `${HOLIDAY}/snowball_cannon.gltf`,
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

  // ---- Level 2 street canyon ------------------------------------------
  // Level 1 looks down on a rooftop, so it never needed a ground surface or
  // anything at street scale. Level 2 runs THROUGH the canyon, where the
  // road is the strongest depth cue available: a repeating surface gives a
  // texture gradient, which is the cue a flat-shaded box floor cannot
  // provide at any distance.
  `${CITY}/road_straight.gltf`,
  `${CITY}/road_straight_crossing.gltf`,

  // Vehicles are the scale reference. A viewer knows how big a car is and
  // does not know how big a blue box is, so these do more for depth than
  // any amount of extra building detail.
  `${CITY}/car_taxi.gltf`,
  `${CITY}/car_sedan.gltf`,
  `${CITY}/car_hatchback.gltf`,

  // Street furniture: dressing, and `trafficlight_A` doubles as a visible
  // reason for an anchor to exist where one is authored.
  `${CITY}/trafficlight_A.gltf`,
  `${CITY}/firehydrant.gltf`,
  `${CITY}/bench.gltf`,

  // Two more silhouettes. Level 1 reads its buildings at distance through
  // fog, where six repeats are invisible; level 2 passes them at arm's
  // length, where they are not.
  `${CITY}/building_G.gltf`,
  `${CITY}/building_H.gltf`,

  // Base-less variants, for buildings that must MEET the road.
  // The exported A-F each carry their own plinth, which is correct standing
  // on nothing in a skyline band and wrong standing on a street — the
  // plinth holds the facade off the tarmac and the building reads as
  // floating. These are the canyon walls.
  `${CITY}/building_A_withoutBase.gltf`,
  `${CITY}/building_C_withoutBase.gltf`,
  `${CITY}/building_E_withoutBase.gltf`,
  `${CITY}/building_G_withoutBase.gltf`,
];

const PROPS_OUT = 'public/models/props';

/**
 * Kenney City Kit Roads 2.2 (CC0), for level 2's street.
 *
 * Copied, not converted. Every model in this pack references ONE external
 * `Textures/colormap.png` of 11 KB, so copying the GLBs beside a single copy
 * of that texture costs one request and one GPU texture for the whole set.
 * Embedding it per-prop — as the KayKit sidecar conversion has to, because
 * those carry an atlas each — would ship the same PNG twenty times and cost
 * twenty textures.
 *
 * Why this pack exists alongside KayKit: it has the street vocabulary KayKit
 * does not — cones, barriers, hanging signs, power lines, and a real bridge
 * with pillars. Level 2 runs through a street; level 1 looks down on a roof.
 */
const KENNEY_PROPS = [
  // Surface
  'road-straight', 'road-crossing', 'road-side', 'tile-low',
  // The bridge, which previously had to be faked out of boxes
  'road-bridge', 'bridge-pillar-wide',
  // Anchors: a wire across the street is the most legible "grab that" a city
  // has, and it already spans all three lanes.
  'electricity-pole-wide', 'electricity-wires-wide', 'electricity-side-wide',
  'light-curved-double', 'light-curved',
  'road-sign-empty-hanging', 'traffic-light-hanging',
  // All three gantry signs. `skyline-props.ts` names every one of them,
  // but only the wide variant was ever copied — the other two passed
  // their existence test on stale files left in public/models from an
  // older build list, so a clean rebuild was the thing that broke them.
  'sign-highway-wide', 'sign-highway', 'sign-highway-detailed',
  // Obstacles
  'construction-barrier', 'construction-cone', 'construction-fence',
  'construction-light', 'dumpster',
  // Dressing
  'traffic-light', 'road-sign-street',
  // Signs and lights `skyline-props.ts` names but the list never
  // carried. Every one of them existed in public/models as a leftover
  // from an older list, so the test that checks each prop resolves to a
  // real file passed on stale output and only failed once the directory
  // was rebuilt clean.
  'traffic-light-object-horizontal', 'traffic-light-object-vertical',
  'road-sign-object-warning', 'road-sign-object-stop',
  'road-sign-warning', 'road-sign-stop',
];

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
rmSync(KENNEY_OUT, { recursive: true, force: true });
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

// ---- 2c. copy the Kenney street set, sharing one texture ---------------
{
  const texture = `${KENNEY}/Textures/colormap.png`;
  if (!existsSync(texture)) {
    warnings.push(`missing Kenney texture: ${texture}`);
  } else {
    // The GLBs reference `Textures/colormap.png` relatively, so the folder
    // layout has to survive the copy or every one of them loads untextured.
    ensure(join(KENNEY_OUT, 'Textures'));
    copyFileSync(texture, join(KENNEY_OUT, 'Textures', 'colormap.png'));
    report.push({ file: 'city/Textures/colormap.png', step: 'copy (shared)', kb: kb(texture) });

    for (const name of KENNEY_PROPS) {
      const src = `${KENNEY}/${name}.glb`;
      if (!existsSync(src)) {
        warnings.push(`missing Kenney prop: ${name}`);
        continue;
      }
      const dest = join(KENNEY_OUT, `${name}.glb`);
      copyFileSync(src, dest);
      report.push({ file: `city/${name}.glb`, step: 'copy', kb: kb(dest) });
    }

    // Transform road-straight to have clean 3-lane markings for Level 2
    spawnSync(process.execPath, ['tools/generate-3lane-road.mjs'], { stdio: 'inherit' });
  }
}

// Optional, and needed by both the blaster tint and the story images.
let sharp = null;
try {
  sharp = (await import('sharp')).default;
} catch {
  warnings.push('sharp not installed; image steps skipped. Run: npm i -D sharp');
}

// ---- 2d. Matthew's blaster, tinted gold --------------------------------
/*
 * `src/assets/manifest.ts` has always pointed level 2's hero at
 * `/models/props/blaster.glb`, and nothing ever produced it: the model 404'd
 * and the grapple started at his bare hands.
 *
 * A pistol rather than a carbine, because the swing animations put his arm
 * through a wide arc and a long barrel fouls it. Kenney's pack ships it in
 * purple, which is Aurora's colour — so the shared colormap is desaturated
 * and multiplied toward gold on the way out. `palette.ts` reserves gold for
 * Matthew, and his trim, the score and the reward glow already use it.
 *
 * Tinting rather than flat-filling keeps the atlas's own shading, so the
 * model still reads as a solid object instead of a gold silhouette.
 */
{
  const src = `${BLASTER}/blaster-a.glb`;
  const texture = `${BLASTER}/Textures/colormap.png`;
  if (!existsSync(src) || !existsSync(texture)) {
    warnings.push(`missing Kenney blaster source: ${src}`);
  } else if (!sharp) {
    warnings.push('sharp not installed; blaster not tinted. Run: npm i -D sharp');
  } else {
    ensure(join(PROPS_OUT, 'Textures'));
    copyFileSync(src, join(PROPS_OUT, 'blaster.glb'));
    // The GLB references Textures/colormap.png relatively, so the folder has
    // to survive beside it. City props keep their own copy under city/.
    await sharp(texture)
      .greyscale()
      .tint({ r: 0xea, g: 0xac, b: 0x5b })
      .toFile(join(PROPS_OUT, 'Textures', 'colormap.png'));
    report.push({ file: 'props/blaster.glb', step: 'copy + gold tint', kb: kb(join(PROPS_OUT, 'blaster.glb')) });
  }
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
