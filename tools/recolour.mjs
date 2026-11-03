#!/usr/bin/env node
/**
 * Recolour KayKit character atlases and bake the result into runtime GLBs.
 *
 * Why recolour the texture rather than tint the material: a tint multiplies,
 * so it can darken and shift a hue but never brighten one. Matthew is dark
 * navy with BRIGHT gold trim over a green-and-brown base, and no multiply
 * reaches that. The atlases are 8x4 grids of 32 vertical gradient ramps, so
 * replacing a ramp is surgical and exact.
 *
 * Method: per pixel, keep the original luminance position within its cell's
 * own range and re-map it onto a ramp built from the target colour. That
 * preserves shading and any detail inside a cell, rather than flooding it
 * flat.
 *
 * Which cell is which was established by mapping every mesh's UV bounds to the
 * grid — see docs/TECH_SPEC.md. The important consequence is that a "shared"
 * cell is usually shared because the parts genuinely are one material: B2 on
 * the Rogue is the green cloth of the hood, cape AND tunic, so recolouring it
 * moves all three together, which is what we want.
 *
 * Usage: node tools/recolour.mjs [--only matthew]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import sharp from 'sharp';

const SRC = 'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf';
const OUT_MODELS = 'public/models';
const OUT_TEX = 'public/models/textures';

const GRID_X = 8;
const GRID_Y = 4;

// Palette, mirrored from src/render/palette.ts. Kept as literals here because
// this is a build script and must not import TypeScript.
const P = {
  ink: '#18101a',
  navyDeep: '#1b275c',
  navy: '#12368f',
  blue: '#234ca8',
  gold: '#eaac5b',
  purpleDeep: '#5c175c',
  magenta: '#cc29c3',
  plumBlack: '#210916',
};

/**
 * Recipes: cell -> target colour.
 *
 * Cells deliberately NOT listed are left untouched. Skin (A1, H3, G4, H4),
 * eye black (C1) and hair (B1 on the Mage) must survive unchanged — the doc
 * rules out likeness work, and recolouring skin alongside clothing is the
 * specific failure it warns about.
 */
const RECIPES = [
  {
    id: 'matthew',
    source: 'Rogue_Hooded',
    texture: 'rogue_texture.png',
    note:
      'Navy and gold. B2 is the green cloth shared by hood, cape and tunic. ' +
      'Deliberately the saturated navy rather than navyDeep, which is the ' +
      'ground colour — a character the same value as the floor has no ' +
      'silhouette, which a screenshot of the real game made obvious.',
    cells: {
      B2: P.navy,       // hood + cape + tunic
      A2: P.ink,        // bandit mask and dark accents
      D3: P.navyDeep,   // legs and boots, a step darker than the body
      G1: P.gold,       // body trim
      F1: P.gold,       // arm bracers
      H3: P.gold,       // arm straps
      H2: P.gold,       // belt
    },
  },
  {
    id: 'aurora',
    source: 'Mage',
    texture: 'mage_texture.png',
    note: 'Purple and gold. A2 is the robe, C2 the cape, already magenta-ish.',
    cells: {
      A2: P.purpleDeep, // robe
      B2: P.purpleDeep, // hat (hidden at runtime, recoloured for consistency)
      C2: P.magenta,    // cape, pushed to her magic colour
      D3: P.plumBlack,  // legs and boots
      H2: P.plumBlack,  // leg accents
      F1: P.gold,       // body trim
    },
  },
  {
    id: 'guard',
    source: 'Knight',
    texture: 'knight_texture.png',
    note: 'Navy uniform with a gold badge. D1 is the armour across every part.',
    cells: {
      D1: P.navyDeep,   // armour, helmet and visor
      H1: P.navy,       // secondary plates
      H2: P.ink,        // dark steel
      G1: P.ink,        // leather
      E2: P.gold,       // badge and trim
    },
  },
];

// ---- colour helpers ----------------------------------------------------

function parseHex(h) {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Rec. 709 luma. Matches how the eye weighs the channels. */
function luma(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/**
 * Build the light and dark ends of a ramp from one target colour, so a single
 * hex in a recipe yields a gradient with the same character as the original.
 */
function rampEnds(target) {
  const c = parseHex(target);
  const light = mix(c, [255, 255, 255], 0.3);
  const dark = mix(c, [0, 0, 0], 0.45);
  return { light, dark };
}

function cellBounds(cell, width, height) {
  const cx = cell.charCodeAt(0) - 65;
  const cy = Number(cell.slice(1)) - 1;
  const cw = Math.floor(width / GRID_X);
  const ch = Math.floor(height / GRID_Y);
  return { x0: cx * cw, y0: cy * ch, x1: (cx + 1) * cw, y1: (cy + 1) * ch };
}

// ---- recolour ----------------------------------------------------------

async function recolourAtlas(texturePath, cells) {
  const image = sharp(texturePath).ensureAlpha();
  const { width, height } = await image.metadata();
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });

  const changed = [];

  for (const [cell, target] of Object.entries(cells)) {
    const { x0, y0, x1, y1 } = cellBounds(cell, width, height);
    const { light, dark } = rampEnds(target);

    // First pass: find this cell's own luminance range, so the remap uses the
    // ramp that is actually there rather than assuming full 0-255.
    let lo = Infinity;
    let hi = -Infinity;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const l = luma(data[i], data[i + 1], data[i + 2]);
        if (l < lo) lo = l;
        if (l > hi) hi = l;
      }
    }
    const span = Math.max(hi - lo, 1);

    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const i = (y * width + x) * 4;
        const t = (luma(data[i], data[i + 1], data[i + 2]) - lo) / span;
        const out = mix(dark, light, t);
        data[i] = out[0];
        data[i + 1] = out[1];
        data[i + 2] = out[2];
      }
    }

    changed.push(`${cell}->${target}`);
  }

  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, changed, width, height };
}

/** Replace the embedded texture inside a GLB and write the runtime copy. */
async function bakeGlb(sourceGlb, png, outPath) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(sourceGlb);
  const textures = doc.getRoot().listTextures();
  if (textures.length !== 1) {
    throw new Error(`expected exactly one texture in ${sourceGlb}, found ${textures.length}`);
  }
  textures[0].setImage(png).setMimeType('image/png');
  await io.write(outPath, doc);
}

// ---- run ---------------------------------------------------------------

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

mkdirSync(OUT_MODELS, { recursive: true });
mkdirSync(OUT_TEX, { recursive: true });

const report = [];

for (const recipe of RECIPES) {
  if (only && recipe.id !== only) continue;

  const texturePath = `${SRC}/${recipe.texture}`;
  const glbPath = `${SRC}/${recipe.source}.glb`;
  if (!existsSync(texturePath) || !existsSync(glbPath)) {
    console.error(`  missing source for ${recipe.id}`);
    continue;
  }

  const { png, changed } = await recolourAtlas(texturePath, recipe.cells);

  // Write the atlas alongside the GLB so it can be inspected on its own.
  writeFileSync(`${OUT_TEX}/${recipe.id}_atlas.png`, png);

  const outGlb = `${OUT_MODELS}/${recipe.id}.glb`;
  await bakeGlb(glbPath, png, outGlb);

  report.push({
    id: recipe.id,
    from: recipe.source,
    cells: changed.length,
    atlasKb: Math.round(png.length / 1024),
    glbKb: Math.round(readFileSync(outGlb).length / 1024),
  });
  console.log(`  ${recipe.id.padEnd(8)} ${changed.join('  ')}`);
}

console.log('');
console.table(report);
console.log(`  wrote ${OUT_MODELS}/<id>.glb and ${OUT_TEX}/<id>_atlas.png\n`);
