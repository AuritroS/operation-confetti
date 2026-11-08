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
  slateLine: '#2b3450',
  ink: '#18101a',
  navyDeep: '#1b275c',
  navy: '#12368f',
  blue: '#234ca8',
  gold: '#eaac5b',
  purpleDeep: '#5c175c',
  magenta: '#cc29c3',
  plumBlack: '#210916',
  steel: '#46506b',
};

/**
 * Skin ramps, sampled from the reference art rather than derived.
 *
 * A single target colour will not do here: the ramp helper lightens toward
 * white, which desaturates, and skin that desaturates at its highlight reads
 * as grey plastic. These give the ends explicitly, taken from cheek and
 * shadow samples of each PNG.
 */
const SKIN = {
  matthew: { light: '#c97a5c', dark: '#6b2f23' },
  aurora: { light: '#f0a070', dark: '#a85334' },
};

/**
 * Recipes: cell -> target colour.
 *
 * Cells deliberately NOT listed are left untouched. Eye black (C1) must
 * survive unchanged, and skin (A1) is only ever given a skin ramp —
 * recolouring skin with a clothing colour is the specific failure docs/DESIGN.md
 * section 10 warns about, and a test asserts against it.
 *
 * B1 is hair. It was on the untouched list while every character wore
 * something over it; Matthew no longer does, so his is now recoloured to the
 * reference's near-black. Aurora's and the guard's stay as the pack authored
 * them.
 */
/**
 * Hair ramps.
 *
 * Needs explicit ends for the same reason skin does: a single hex lightens
 * toward white, and black hair whose highlight desaturates reads as grey.
 * Matthew's reference is near-black with a warm brown sheen, so the ramp
 * runs from an almost-black base to a dark warm brown rather than to grey.
 */
const HAIR = {
  /*
   * Lifted off near-black.
   *
   * The ramp ran #3b2a22 to #0f0a09, which is almost no range and almost no
   * light: the grafted curl shell has plenty of facets, but at phone size
   * none of them caught the rim light and the whole thing read as one jagged
   * silhouette. The reference is still dark hair with a warm sheen, so the
   * hue is unchanged — the light end is raised far enough for the facets to
   * separate, and the dark end lifted off pure black so the shadows read as
   * hair rather than as a hole in the character.
   */
  matthew: { light: '#6b4b36', dark: '#241714' },
};

const RECIPES = [
  {
    id: 'matthew',
    source: 'Rogue',
    texture: 'rogue_texture.png',
    /** Runs `graftHair`: drops cells B1 and D1 from the head, adds the curls. */
    hair: true,
    note:
      'Navy and gold on the UNHOODED Rogue. The hood is geometry inside ' +
      '`RogueHooded_Head`, not a separate mesh, so it cannot be hidden at ' +
      'runtime — losing it means sourcing the body that never had one. ' +
      'Both bodies share the identical 23-joint Rig_Medium skeleton, so ' +
      'every clip and every bone lookup in skyline-hero.ts is unaffected. ' +
      'The cell map had to be rebalanced, because the hood was carrying ' +
      'the navy: mapping each mesh’s UVs to the 8x4 grid shows B2 falling ' +
      'from 446 verts on the hooded body to 186 on the bare one, and ' +
      'disappearing from the head entirely. A2 — 396 verts, the largest ' +
      'surface on the torso and the cloth on the arms — was the tunic worn ' +
      'UNDER the hood and was therefore ink. Left alone, taking the hood ' +
      'off would have turned Matthew near-black and moved the navy onto ' +
      'nothing but a cape. So A2 becomes the navy and B2 keeps it, which ' +
      'puts the colour on the suit rather than on a garment he no longer ' +
      'wears.',
    cells: {
      A2: P.navy,       // tunic and arm cloth — the suit, and most of him
      B2: P.navy,       // cape and shoulder collar, the last of the hood cloth
      B1: HAIR.matthew, // hair, bare for the first time now the hood is gone
      D3: P.navyDeep,   // legs and boots, a step darker than the body
      G1: P.gold,       // body trim
      F1: P.gold,       // arm bracers
      H3: P.gold,       // arm straps
      H2: P.gold,       // belt
      A1: SKIN.matthew, // face and hands
    },
  },
  {
    id: 'aurora',
    source: 'Mage',
    texture: 'mage_texture.png',
    note:
      'Purple and gold. A2 is the robe, C2 the cape, already magenta-ish. ' +
      'C3 is the Mage\u2019s belt satchel: a teal that exists nowhere in the ' +
      'project palette and reads as a leftover from the source pack against ' +
      'her purple and gold. Found by mapping Mage_Body\u2019s UVs to the ' +
      'grid \u2014 the atlas also holds unused teal swatches, so picking a ' +
      'cell by eye off the texture recolours nothing.',
    cells: {
      A2: P.purpleDeep, // robe
      B2: P.purpleDeep, // hat (hidden at runtime, recoloured for consistency)
      C2: P.magenta,    // cape, pushed to her magic colour
      D3: P.plumBlack,  // legs and boots
      H2: P.plumBlack,  // leg accents
      F1: P.gold,       // body trim
      C3: P.gold,       // belt satchel, off-palette teal in the source
      A1: SKIN.aurora,  // face and hands
    },
  },
  {
    id: 'guard',
    source: 'Knight',
    texture: 'knight_texture.png',
    note:
      'Desaturated steel with magenta trim, and deliberately no gold. Navy ' +
      'and gold guards read as Matthew at a glance, and gold is his; magenta ' +
      'is Aurora\u2019s, and these are her guards. D1 is the armour across ' +
      'every part.',
    cells: {
      D1: P.steel,      // armour, helmet and visor
      H1: P.slateLine,  // secondary plates
      H2: P.ink,        // dark steel
      G1: P.ink,        // leather
      E2: P.magenta,    // badge and trim
      A2: P.steel,      // cape swatch, hidden at runtime but kept consistent
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
  if (typeof target === 'object') {
    return { light: parseHex(target.light), dark: parseHex(target.dark) };
  }
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

    changed.push(`${cell}->${typeof target === 'object' ? target.light : target}`);
  }

  const png = await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
  return { png, changed, width, height, raw: data };
}

/** Replace the embedded texture inside a GLB and write the runtime copy. */
async function bakeGlb(sourceGlb, png, outPath, surgery) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  const doc = await io.read(sourceGlb);
  const textures = doc.getRoot().listTextures();
  if (textures.length !== 1) {
    throw new Error(`expected exactly one texture in ${sourceGlb}, found ${textures.length}`);
  }
  textures[0].setImage(png).setMimeType('image/png');
  const report = surgery ? surgery(doc) : null;
  await io.write(outPath, doc);
  return report;
}

// ---- head surgery: drop the pack hair, graft the curl shell ------------

/**
 * The curl shell, tuned in the designer and pasted here verbatim.
 *
 * Bind-space units, matching the GLB's own coordinates. Every number came
 * out of the live preview, and the generator below is a line-for-line port
 * of the one that drew it — same Fibonacci lattice, same `rnd`, same salt
 * indices, same per-curl scale and rotation. That equivalence is the whole
 * point: what was approved on screen is what gets baked, with no second
 * round of eyeballing.
 */
const CURL = {
  LATTICE: 80,
  SHELL_R: 0.460,
  SQUASH: 1.14,
  CENTER_Y: 1.640,
  CENTER_Z: 0.135,
  CURL_R: 0.204,
  BROW_Y: 1.885,
  NAPE_Y: 1.220,
  JITTER: 0.0,
  SEED: 1,
  DETAIL: 0,
};

const HEAD_MESH = 'Rogue_Head';
/** Cells deleted from the head: B1 is the pack hair, D1 the earring. */
const HEAD_DROP = ['B1', 'D1'];
/** Cell the curls are mapped into, so they take the hair colour. */
const HAIR_CELL = 'B1';
/** Index of `head` within skins[0].joints. The curls weight entirely to it. */
const HEAD_JOINT = 17;

/** Same hash the preview used; the shell is reproducible from SEED alone. */
function rnd(seed, i, salt) {
  const x = Math.sin(seed * 374.761 + i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function cellOf(u, v) {
  return String.fromCharCode(65 + Math.min(7, Math.floor(u * GRID_X))) +
    (Math.min(GRID_Y - 1, Math.floor(v * GRID_Y)) + 1);
}

/**
 * Curl centres on a squashed shell, culled by a hairline that sweeps from
 * the brow at the front round to the nape at the back.
 */
function curlCentres(c) {
  const out = [];
  for (let i = 0; i < c.LATTICE; i++) {
    // Fibonacci lattice: even coverage with no clustering at the poles.
    const y = 1 - (i + 0.5) * 2 / c.LATTICE;
    const rad = Math.sqrt(Math.max(0, 1 - y * y));
    const th = Math.PI * (1 + Math.sqrt(5)) * i;
    const d = [Math.cos(th) * rad, y, Math.sin(th) * rad];

    const jr = c.SHELL_R + (rnd(c.SEED, i, 1) - 0.5) * 2 * c.JITTER;
    const px = d[0] * jr;
    let py = c.CENTER_Y + d[1] * jr * c.SQUASH;
    const pz = c.CENTER_Z + d[2] * jr;
    py += (rnd(c.SEED, i, 2) - 0.5) * 2 * c.JITTER * 0.6;

    // Front is +Z, which is where the Rogue faces.
    const frontness = (d[2] + 1) / 2;
    if (py < c.NAPE_Y + (c.BROW_Y - c.NAPE_Y) * frontness) continue;
    out.push([px, py, pz]);
  }
  return out;
}

/**
 * One unit icosphere, flat shaded, non-indexed — byte-identical in shape to
 * `THREE.IcosahedronGeometry(1, 0)`, which is what the preview drew.
 */
function icosphere() {
  const t = (1 + Math.sqrt(5)) / 2;
  const base = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => {
    const n = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / n, v[1] / n, v[2] / n];
  });
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  const tris = [];
  for (const f of faces) tris.push([base[f[0]], base[f[1]], base[f[2]]]);
  return tris;
}

/** Rotate by Euler XYZ with z=0, the order three.js composes in. */
function rotXY(v, rx, ry) {
  const a = Math.cos(rx), b = Math.sin(rx), c = Math.cos(ry), d = Math.sin(ry);
  return [
    c * v[0] + d * v[2],
    b * d * v[0] + a * v[1] - b * c * v[2],
    -a * d * v[0] + b * v[1] + a * c * v[2],
  ];
}

/**
 * Find where inside a cell the ramp is light and where it is dark.
 *
 * Read rather than assumed: which end of a cell carries the highlight is a
 * property of the source atlas, and guessing it wrong puts the shine under
 * the curls instead of on top.
 */
function rampAxis(raw, width, height, cell) {
  const { x0, y0, x1, y1 } = cellBounds(cell, width, height);
  const mid = Math.floor((x0 + x1) / 2);
  const sample = (y) => {
    const i = (y * width + mid) * 4;
    return luma(raw[i], raw[i + 1], raw[i + 2]);
  };
  const top = sample(y0 + 2), bottom = sample(y1 - 3);
  const u = (mid + 0.5) / width;
  const vLight = ((top >= bottom ? y0 + 2 : y1 - 3) + 0.5) / height;
  const vDark = ((top >= bottom ? y1 - 3 : y0 + 2) + 0.5) / height;
  return { u, vLight, vDark };
}

/**
 * Replace the head's hair with the curl shell, in place on the document.
 *
 * Done as geometry rather than at runtime because `matthew.glb` has four
 * consumers — both levels, the probe and the gallery — and a runtime graft
 * would have to be wired into each of them and would cost its own draw
 * call. Merged into the existing primitive it costs neither.
 */
function graftHair(doc, atlas) {
  const mesh = doc.getRoot().listMeshes().find((m) => m.getName() === HEAD_MESH);
  if (!mesh) throw new Error(`mesh ${HEAD_MESH} not found`);
  const prim = mesh.listPrimitives()[0];

  const src = {};
  for (const name of prim.listSemantics()) src[name] = prim.getAttribute(name);
  const indices = prim.getIndices();
  const count = indices.getCount();

  // ---- 1. keep only the triangles outside the dropped cells ------------
  const uv = src['TEXCOORD_0'];
  const kept = [];
  const uvTmp = [0, 0];
  for (let t = 0; t < count; t += 3) {
    const a = indices.getScalar(t);
    uv.getElement(a, uvTmp);
    if (HEAD_DROP.includes(cellOf(uvTmp[0], uvTmp[1]))) continue;
    kept.push(a, indices.getScalar(t + 1), indices.getScalar(t + 2));
  }

  // Remap to a compact vertex range, so the dropped verts go too.
  const remap = new Map();
  const out = { POSITION: [], NORMAL: [], TEXCOORD_0: [], JOINTS_0: [], WEIGHTS_0: [] };
  const take = (v) => {
    if (remap.has(v)) return remap.get(v);
    const id = remap.size;
    remap.set(v, id);
    for (const [name, size] of [['POSITION', 3], ['NORMAL', 3], ['TEXCOORD_0', 2], ['JOINTS_0', 4], ['WEIGHTS_0', 4]]) {
      const el = new Array(size);
      src[name].getElement(v, el);
      out[name].push(...el);
    }
    return id;
  };
  const idx = kept.map(take);
  const keptTris = idx.length / 3;
  const keptVerts = remap.size;

  // ---- 2. graft the curls ----------------------------------------------
  const centres = curlCentres(CURL);
  const unit = icosphere();
  const ramp = rampAxis(atlas.raw, atlas.width, atlas.height, HAIR_CELL);

  for (let k = 0; k < centres.length; k++) {
    const c = centres[k];
    // Per-curl variation, reproduced exactly from the preview.
    const s = CURL.CURL_R * (0.86 + rnd(CURL.SEED, k, 3) * 0.3);
    const scale = [s, s * 0.94, s];
    const rx = rnd(CURL.SEED, k, 4) * 6.28;
    const ry = rnd(CURL.SEED, k, 5) * 6.28;

    for (const tri of unit) {
      const world = tri.map((v) => {
        const r = rotXY([v[0] * scale[0], v[1] * scale[1], v[2] * scale[2]], rx, ry);
        return [r[0] + c[0], r[1] + c[1], r[2] + c[2]];
      });
      // Flat shading: one face normal for all three corners, which is what
      // IcosahedronGeometry at detail 0 produces.
      const e1 = [world[1][0] - world[0][0], world[1][1] - world[0][1], world[1][2] - world[0][2]];
      const e2 = [world[2][0] - world[0][0], world[2][1] - world[0][1], world[2][2] - world[0][2]];
      let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];

      for (const w of world) {
        idx.push(out.POSITION.length / 3);
        out.POSITION.push(w[0], w[1], w[2]);
        out.NORMAL.push(n[0], n[1], n[2]);
        // Light end of the ramp on upward-facing curls, dark underneath.
        const up = Math.max(0, Math.min(1, 0.5 + 0.5 * n[1]));
        out.TEXCOORD_0.push(ramp.u, ramp.vDark + (ramp.vLight - ramp.vDark) * up);
        out.JOINTS_0.push(HEAD_JOINT, 0, 0, 0);
        out.WEIGHTS_0.push(1, 0, 0, 0);
      }
    }
  }

  // ---- 3. write the new attributes --------------------------------------
  const buffer = doc.getRoot().listBuffers()[0];
  const set = (name, array, type) => {
    const old = prim.getAttribute(name);
    prim.setAttribute(name, doc.createAccessor().setArray(array).setType(type).setBuffer(buffer));
    old.dispose();
  };
  set('POSITION', new Float32Array(out.POSITION), 'VEC3');
  set('NORMAL', new Float32Array(out.NORMAL), 'VEC3');
  set('TEXCOORD_0', new Float32Array(out.TEXCOORD_0), 'VEC2');
  set('JOINTS_0', new Uint8Array(out.JOINTS_0), 'VEC4');
  set('WEIGHTS_0', new Float32Array(out.WEIGHTS_0), 'VEC4');

  const verts = out.POSITION.length / 3;
  const oldIndices = prim.getIndices();
  prim.setIndices(
    doc.createAccessor()
      .setArray(verts > 65535 ? new Uint32Array(idx) : new Uint16Array(idx))
      .setType('SCALAR').setBuffer(buffer),
  );
  oldIndices.dispose();

  return { keptTris, keptVerts, curls: centres.length, curlTris: centres.length * unit.length,
    tris: idx.length / 3, verts };
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

  const atlas = await recolourAtlas(texturePath, recipe.cells);
  const { png, changed } = atlas;

  // Write the atlas alongside the GLB so it can be inspected on its own.
  writeFileSync(`${OUT_TEX}/${recipe.id}_atlas.png`, png);

  const outGlb = `${OUT_MODELS}/${recipe.id}.glb`;
  const surgery = recipe.hair ? (doc) => graftHair(doc, atlas) : null;
  const grafted = await bakeGlb(glbPath, png, outGlb, surgery);
  if (grafted) {
    console.log(`  ${''.padEnd(8)} head: kept ${grafted.keptTris} tris, grafted ` +
      `${grafted.curls} curls / ${grafted.curlTris} tris -> ${grafted.tris} tris, ${grafted.verts} verts`);
  }

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
