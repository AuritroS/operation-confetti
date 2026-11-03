#!/usr/bin/env node
/**
 * Scan the CC0 source packs and write an index the asset gallery reads.
 *
 * Measures real triangle counts rather than guessing from file size, so the
 * gallery can be sorted by cost and a pick can be checked against the
 * engineering budget before anything is integrated.
 *
 * Only glTF/GLB are indexed. The packs also ship OBJ and FBX copies of the
 * same models; indexing those would triple the list with duplicates.
 */
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';

const PACKS = [
  {
    id: 'characters',
    label: 'Characters',
    pack: 'KayKit Adventurers 2.0',
    dir: 'assets/KayKit_Adventurers_2.0_FREE/Characters/gltf',
    note: 'Rigged. No embedded clips — animation comes from the libraries.',
  },
  {
    id: 'animations',
    label: 'Animation libraries',
    pack: 'KayKit Adventurers 2.0',
    dir: 'assets/KayKit_Adventurers_2.0_FREE/Animations/gltf/Rig_Medium',
    note: 'Clip sources. Transplant onto any character: identical skeleton.',
  },
  {
    id: 'props',
    label: 'Adventurer props',
    pack: 'KayKit Adventurers 2.0',
    dir: 'assets/KayKit_Adventurers_2.0_FREE/Assets/gltf',
    note: 'Hand-held props. Attach to handslot.r / handslot.l.',
  },
  {
    id: 'city',
    label: 'City Builder Bits',
    pack: 'KayKit City Builder Bits 1.0',
    dir: 'assets/KayKit_City_Builder_Bits_1.0_FREE/Assets/gltf',
    note: 'Environment. One shared 1024² atlas, so these instance well.',
  },
  {
    id: 'blasters',
    label: 'Blaster Kit',
    pack: 'Kenney Blaster Kit 2.1',
    dir: 'assets/kenney_blaster-kit_2.1/Models/GLB format',
    note: 'Confetti blaster candidates, plus crates and targets.',
  },
];

/** Coarse grouping within a pack, derived from the filename. */
function categorise(packId, name) {
  if (packId === 'city') {
    if (/^building/.test(name)) return 'buildings';
    if (/^road/.test(name)) return 'roads';
    if (/^car_/.test(name)) return 'vehicles';
    if (/^(trafficlight|streetlight)/.test(name)) return 'lighting';
    if (/^(bench|bush|dumpster|firehydrant|trash|watertower|box)/.test(name)) return 'street props';
    return 'other';
  }
  if (packId === 'blasters') {
    if (/^blaster/.test(name)) return 'blasters';
    if (/^bullet/.test(name)) return 'projectiles';
    if (/^target/.test(name)) return 'targets';
    if (/^crate/.test(name)) return 'crates';
    if (/^(scope|silencer|clip)/.test(name)) return 'attachments';
    return 'other';
  }
  if (packId === 'props') {
    if (/sword|axe|dagger|crossbow|bow|arrow|quiver/.test(name)) return 'weapons';
    if (/shield/.test(name)) return 'shields';
    if (/staff|wand|spellbook/.test(name)) return 'magic';
    if (/smokebomb|mug/.test(name)) return 'thief kit';
    return 'other';
  }
  return packId;
}

function readGltfJson(path) {
  const ext = extname(path).toLowerCase();
  if (ext === '.gltf') {
    return { json: JSON.parse(readFileSync(path, 'utf8')), external: true };
  }
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a GLB: ${path}`);
  const total = buf.readUInt32LE(8);
  let offset = 12;
  let json = null;
  while (offset < total) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      json = JSON.parse(buf.subarray(offset + 8, offset + 8 + len).toString('utf8'));
    }
    offset += 8 + len;
  }
  if (!json) throw new Error(`no JSON chunk: ${path}`);
  return { json, external: false };
}

function triangles(json) {
  let tris = 0;
  for (const mesh of json.meshes ?? []) {
    for (const prim of mesh.primitives ?? []) {
      if (prim.mode !== undefined && prim.mode !== 4) continue;
      const acc =
        prim.indices !== undefined
          ? json.accessors[prim.indices]
          : json.accessors[prim.attributes?.POSITION];
      if (acc) tris += Math.floor(acc.count / 3);
    }
  }
  return tris;
}

/** Total bytes a model costs to download, including .bin and textures. */
function transferBytes(path, json) {
  let bytes = statSync(path).size;
  const dir = dirname(path);
  for (const buffer of json.buffers ?? []) {
    if (buffer.uri && !buffer.uri.startsWith('data:')) {
      const p = join(dir, decodeURIComponent(buffer.uri));
      if (existsSync(p)) bytes += statSync(p).size;
    }
  }
  for (const image of json.images ?? []) {
    if (image.uri && !image.uri.startsWith('data:')) {
      const p = join(dir, decodeURIComponent(image.uri));
      if (existsSync(p)) bytes += statSync(p).size;
    }
  }
  return bytes;
}

const items = [];
const packs = [];

for (const pack of PACKS) {
  if (!existsSync(pack.dir)) {
    console.error(`  missing: ${pack.dir}`);
    continue;
  }

  const files = readdirSync(pack.dir)
    .filter((f) => /\.(glb|gltf)$/i.test(f))
    .sort();

  for (const file of files) {
    const path = join(pack.dir, file);
    const name = basename(file, extname(file));
    try {
      const { json } = readGltfJson(path);
      const clips = (json.animations ?? []).map((a) => a.name);
      items.push({
        id: `${pack.id}/${name}`,
        name,
        packId: pack.id,
        pack: pack.pack,
        category: categorise(pack.id, name),
        // Served by the dev-only middleware, which maps this onto ./assets.
        url: `/asset-src/${path.replace(/^assets\//, '')}`,
        format: extname(file).slice(1).toLowerCase(),
        bytes: transferBytes(path, json),
        triangles: triangles(json),
        meshes: (json.meshes ?? []).length,
        materials: (json.materials ?? []).length,
        joints: json.skins?.[0]?.joints?.length ?? 0,
        clips,
        attachNodes: (json.nodes ?? [])
          .map((n) => n.name ?? '')
          .filter((n) => /^handslot\.|^head$/.test(n)),
      });
    } catch (e) {
      console.error(`  failed ${path}: ${e.message}`);
    }
  }

  packs.push({
    id: pack.id,
    label: pack.label,
    pack: pack.pack,
    note: pack.note,
    count: items.filter((i) => i.packId === pack.id).length,
  });
}

const index = {
  generated: new Date().toISOString(),
  license: 'All three source packs are CC0. Attribution optional.',
  packs,
  items,
};

writeFileSync('.asset-index.json', JSON.stringify(index, null, 2));

console.log('');
console.table(
  packs.map((p) => ({
    pack: p.label,
    models: p.count,
    triangles: items.filter((i) => i.packId === p.id).reduce((a, i) => a + i.triangles, 0),
  })),
);
const clips = new Set(items.flatMap((i) => i.clips));
console.log(`  ${items.length} models indexed, ${clips.size} distinct animation clips`);
console.log('  wrote .asset-index.json (dev-only, served by the Vite plugin)\n');
