import { NodeIO } from '@gltf-transform/core';

async function main() {
  const io = new NodeIO();
  // Read clean asset from assets
  const sourceDoc = await io.read('assets/kenney_city-kit-roads/Models/GLB format/road-straight.glb');
  const root = sourceDoc.getRoot();
  const sourceMesh = root.listMeshes()[0];
  const sourcePrim = sourceMesh.listPrimitives()[0];

  const posAttr = sourcePrim.getAttribute('POSITION');
  const normalAttr = sourcePrim.getAttribute('NORMAL');
  const uvAttr = sourcePrim.getAttribute('TEXCOORD_0');
  const idxAttr = sourcePrim.getIndices();

  const pos = posAttr.getArray();
  const normal = normalAttr.getArray();
  const uv = uvAttr.getArray();
  const indices = idxAttr.getArray();

  // UV constants from Kenney colormap
  const UV_WHITE = [0.406, 0.875];
  const UV_ASPHALT = [0.281, 0.875];
  const UV_GUTTER = [0.031, 0.875];

  // Keep all kerb, underside, and non-carriageway faces.
  // Carriageway top triangles in the original model:
  // y = 0.010, normal = (0, 1, 0), z between -0.400 and +0.400
  const keptTriangles = [];
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i], i1 = indices[i + 1], i2 = indices[i + 2];
    const y0 = pos[i0 * 3 + 1], y1 = pos[i1 * 3 + 1], y2 = pos[i2 * 3 + 1];
    const ny0 = normal[i0 * 3 + 1], ny1 = normal[i1 * 3 + 1], ny2 = normal[i2 * 3 + 1];

    const isCarriagewayTop =
      Math.abs(y0 - 0.010) < 0.001 &&
      Math.abs(y1 - 0.010) < 0.001 &&
      Math.abs(y2 - 0.010) < 0.001 &&
      ny0 > 0.9 && ny1 > 0.9 && ny2 > 0.9;

    if (!isCarriagewayTop) {
      keptTriangles.push([i0, i1, i2]);
    }
  }

  console.log(`Original triangles: ${indices.length / 3}, Kept non-carriageway: ${keptTriangles.length}`);

  const newPositions = [];
  const newNormals = [];
  const newUVs = [];
  const newIndices = [];

  const oldToNew = new Map();
  function getOrCreateVertex(oldIdx) {
    if (oldToNew.has(oldIdx)) return oldToNew.get(oldIdx);
    const newIdx = newPositions.length / 3;
    newPositions.push(pos[oldIdx * 3], pos[oldIdx * 3 + 1], pos[oldIdx * 3 + 2]);
    newNormals.push(normal[oldIdx * 3], normal[oldIdx * 3 + 1], normal[oldIdx * 3 + 2]);
    newUVs.push(uv[oldIdx * 2], uv[oldIdx * 2 + 1]);
    oldToNew.set(oldIdx, newIdx);
    return newIdx;
  }

  for (const [i0, i1, i2] of keptTriangles) {
    newIndices.push(getOrCreateVertex(i0), getOrCreateVertex(i1), getOrCreateVertex(i2));
  }

  // 3-lane carriageway surface
  const Y_SURF = 0.010;
  const N_SURF = [0, 1, 0];

  function addQuad(xMin, xMax, zMin, zMax, uvCoord) {
    const vBase = newPositions.length / 3;
    const pts = [
      [xMin, Y_SURF, zMin],
      [xMax, Y_SURF, zMin],
      [xMax, Y_SURF, zMax],
      [xMin, Y_SURF, zMax],
    ];
    for (const p of pts) {
      newPositions.push(p[0], p[1], p[2]);
      newNormals.push(...N_SURF);
      newUVs.push(...uvCoord);
    }
    newIndices.push(vBase, vBase + 1, vBase + 2);
    newIndices.push(vBase, vBase + 2, vBase + 3);
  }

  // Z partitions:
  // Gutters: [-0.40, -0.30] and [+0.30, +0.40]
  // Lane dividers centered at z = -1.6/19 and +1.6/19 (~0.0842105)
  // Width of stripe: 0.020 (scaled 19 = 0.38m)
  const zDivLeft = -1.6 / 19;
  const zDivRight = 1.6 / 19;
  const halfStripe = 0.010;

  const zStripeL_min = zDivLeft - halfStripe;
  const zStripeL_max = zDivLeft + halfStripe;
  const zStripeR_min = zDivRight - halfStripe;
  const zStripeR_max = zDivRight + halfStripe;

  // X segments for dashes (length 1.0, from -0.5 to +0.5):
  // 3 dashes of length 0.20 (3.8m), with gaps
  const xSegments = [
    { min: -0.50, max: -0.45, isDash: false },
    { min: -0.45, max: -0.25, isDash: true },
    { min: -0.25, max: -0.10, isDash: false },
    { min: -0.10, max: +0.10, isDash: true },
    { min: +0.10, max: +0.25, isDash: false },
    { min: +0.25, max: +0.45, isDash: true },
    { min: +0.45, max: +0.50, isDash: false },
  ];

  // 1. Gutters (full length along x)
  addQuad(-0.5, 0.5, -0.40, -0.30, UV_GUTTER);
  addQuad(-0.5, 0.5, +0.30, +0.40, UV_GUTTER);

  // 2. Left lane asphalt: [-0.30, zStripeL_min]
  addQuad(-0.5, 0.5, -0.30, zStripeL_min, UV_ASPHALT);

  // 3. Center lane asphalt (Lane 0): [zStripeL_max, zStripeR_min]
  addQuad(-0.5, 0.5, zStripeL_max, zStripeR_min, UV_ASPHALT);

  // 4. Right lane asphalt: [zStripeR_max, +0.30]
  addQuad(-0.5, 0.5, zStripeR_max, +0.30, UV_ASPHALT);

  // 5. Left and Right dashed dividing stripes
  for (const seg of xSegments) {
    const uv = seg.isDash ? UV_WHITE : UV_ASPHALT;
    addQuad(seg.min, seg.max, zStripeL_min, zStripeL_max, uv);
    addQuad(seg.min, seg.max, zStripeR_min, zStripeR_max, uv);
  }

  // Update primitive attributes
  posAttr.setArray(new Float32Array(newPositions));
  normalAttr.setArray(new Float32Array(newNormals));
  uvAttr.setArray(new Float32Array(newUVs));
  idxAttr.setArray(new Uint16Array(newIndices));

  // Write new glb
  await io.write('public/models/city/road-straight.glb', sourceDoc);
  console.log('Successfully generated public/models/city/road-straight.glb!');
  console.log(`Total vertices: ${newPositions.length / 3}, Total triangles: ${newIndices.length / 3}`);
}

main().catch(console.error);
