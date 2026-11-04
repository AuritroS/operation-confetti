/**
 * Measure a GLB's bounding box straight from its glTF JSON.
 *
 * Deliberately not three.js. `GLTFLoader` waits for every dependency before
 * it resolves, and the Kenney pack references an EXTERNAL
 * `Textures/colormap.png` — which is the right call at runtime, one 11 KB
 * texture for the whole set, but in jsdom the image request neither succeeds
 * nor fails and `onLoad` never fires. The first version of this test timed
 * out at 30 seconds for exactly that reason.
 *
 * Reading accessor bounds avoids the problem entirely and is more accurate
 * anyway: glTF stores exact `min`/`max` for POSITION, so there is no sampling
 * involved. Node transforms are applied as they are walked, because a prop's
 * parts are routinely offset from its root.
 */
import { readFileSync } from 'node:fs';

type Mat4 = number[];

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major, matching glTF. */
function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += (a[k * 4 + r] as number) * (b[c * 4 + k] as number);
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function fromTRS(t?: number[], r?: number[], s?: number[]): Mat4 {
  const [x, y, z, w] = r ?? [0, 0, 0, 1];
  const [sx, sy, sz] = s ?? [1, 1, 1];
  const x2 = (x as number) * 2, y2 = (y as number) * 2, z2 = (z as number) * 2;
  const xx = (x as number) * x2, xy = (x as number) * y2, xz = (x as number) * z2;
  const yy = (y as number) * y2, yz = (y as number) * z2, zz = (z as number) * z2;
  const wx = (w as number) * x2, wy = (w as number) * y2, wz = (w as number) * z2;
  return [
    (1 - (yy + zz)) * (sx as number), (xy + wz) * (sx as number), (xz - wy) * (sx as number), 0,
    (xy - wz) * (sy as number), (1 - (xx + zz)) * (sy as number), (yz + wx) * (sy as number), 0,
    (xz + wy) * (sz as number), (yz - wx) * (sz as number), (1 - (xx + yy)) * (sz as number), 0,
    t?.[0] ?? 0, t?.[1] ?? 0, t?.[2] ?? 0, 1,
  ];
}

function apply(m: Mat4, p: readonly number[]): [number, number, number] {
  const [x, y, z] = p as [number, number, number];
  return [
    (m[0] as number) * x + (m[4] as number) * y + (m[8] as number) * z + (m[12] as number),
    (m[1] as number) * x + (m[5] as number) * y + (m[9] as number) * z + (m[13] as number),
    (m[2] as number) * x + (m[6] as number) * y + (m[10] as number) * z + (m[14] as number),
  ];
}

export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
  size: [number, number, number];
}

export function glbBounds(path: string): Bounds {
  const buf = readFileSync(path);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString('utf8'));

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  const visit = (index: number, parent: Mat4): void => {
    const node = gltf.nodes?.[index];
    if (!node) return;
    const local: Mat4 = node.matrix ?? fromTRS(node.translation, node.rotation, node.scale);
    const world = multiply(parent, local);

    const mesh = node.mesh !== undefined ? gltf.meshes?.[node.mesh] : undefined;
    for (const primitive of mesh?.primitives ?? []) {
      const accessor = gltf.accessors?.[primitive.attributes?.POSITION];
      if (!accessor?.min || !accessor?.max) continue;
      // Transform all eight corners: a rotated node's axis-aligned box is not
      // the rotation of its axis-aligned box.
      for (let corner = 0; corner < 8; corner++) {
        const point = [
          corner & 1 ? accessor.max[0] : accessor.min[0],
          corner & 2 ? accessor.max[1] : accessor.min[1],
          corner & 4 ? accessor.max[2] : accessor.min[2],
        ];
        const world3 = apply(world, point);
        for (let axis = 0; axis < 3; axis++) {
          min[axis] = Math.min(min[axis] as number, world3[axis] as number);
          max[axis] = Math.max(max[axis] as number, world3[axis] as number);
        }
      }
    }

    for (const child of node.children ?? []) visit(child, world);
  };

  const scene = gltf.scenes?.[gltf.scene ?? 0];
  for (const root of scene?.nodes ?? []) visit(root, IDENTITY);

  return {
    min,
    max,
    size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]],
  };
}
