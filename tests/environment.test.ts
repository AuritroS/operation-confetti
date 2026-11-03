// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LEVEL_1 } from '../src/levels/level1';
import {
  corridorOf,
  isClearOfCorridor,
  MIN_OVERHEAD_CLEARANCE,
  resolve,
  type Placement,
} from '../src/render/environment/placement';
import { PROPS, PROP_IDS } from '../src/render/environment/props';
import { LAYER_IDS } from '../src/render/environment/layer';
import { Environment, requestedLayers } from '../src/render/environment';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Object3D } from 'three';

/**
 * These tests are the rules. Each one exists because a comment saying "do not
 * do X" is not enforcement, and the environment is large enough that a
 * reviewer will not catch a violation by eye.
 */

const corridor = corridorOf(LEVEL_1);

/** Strip block and line comments, so prose about a rule cannot trip it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('decoration can never enter the playable corridor', () => {
  it('derives x from a side, so no placement can name a lane', () => {
    // A Placement has no x field at all. This is the structural guarantee:
    // the illegal state is unrepresentable, not merely discouraged.
    const sample: Placement = { side: 'left', beyond: 0, z: 10 };
    expect(Object.keys(sample)).not.toContain('x');
  });

  it('holds for every side placement, including hostile inputs', () => {
    const hostile = [0, -0, -1, -1e6, 0.0001, 1e6, Number.MIN_VALUE];
    for (const side of ['left', 'right'] as const) {
      for (const beyond of hostile) {
        const at = resolve(corridor, { side, beyond, z: 0 });
        expect(
          Math.abs(at.x),
          `side=${side} beyond=${beyond} produced x=${at.x}`,
        ).toBeGreaterThanOrEqual(corridor.edge);
        expect(isClearOfCorridor(corridor, at)).toBe(true);
      }
    }
  });

  it('holds across a thousand random side placements', () => {
    for (let i = 0; i < 1000; i++) {
      const at = resolve(corridor, {
        side: Math.random() < 0.5 ? 'left' : 'right',
        beyond: (Math.random() - 0.3) * 40,
        z: Math.random() * 450,
      });
      expect(isClearOfCorridor(corridor, at)).toBe(true);
    }
  });

  it('raises any overhead piece to the minimum clearance', () => {
    for (const clearance of [-5, 0, 1, MIN_OVERHEAD_CLEARANCE - 0.01]) {
      const at = resolve(corridor, { overhead: true, z: 0, clearance });
      expect(at.y).toBeGreaterThanOrEqual(MIN_OVERHEAD_CLEARANCE);
      expect(isClearOfCorridor(corridor, at)).toBe(true);
    }
  });

  it('cannot shove an overhead piece sideways and then drop it', () => {
    // Clamping the offset stops "overhead" being used as an escape hatch to
    // place something beside the player at head height.
    const at = resolve(corridor, { overhead: true, z: 0, clearance: 99, offset: 1000 });
    expect(Math.abs(at.x)).toBeLessThanOrEqual(corridor.halfWidth);
  });

  it('moves every prop automatically if the lane geometry changes', () => {
    const wider = corridorOf({ ...LEVEL_1, laneWidth: 3 });
    const narrow = resolve(corridor, { side: 'right', beyond: 1, z: 0 });
    const broad = resolve(wider, { side: 'right', beyond: 1, z: 0 });
    expect(broad.x).toBeGreaterThan(narrow.x);
  });
});

describe('no prop enters the scene at its authored scale', () => {
  it('registers a scale and an expected height for every prop', () => {
    for (const id of PROP_IDS) {
      const spec = PROPS[id];
      expect(spec.scale, `${id} scale`).toBeGreaterThan(0);
      expect(spec.scale, `${id} must be measured, not left at 1`).not.toBe(1);
      expect(spec.expect[0]).toBeLessThan(spec.expect[1]);
      expect(spec.role.length, `${id} needs a role`).toBeGreaterThan(0);
    }
  });

  it('keeps every scaled height plausible against the player', () => {
    // The player is 1.45 units. Anything claiming to be a building must be
    // far taller, and anything claiming to be litter must be far shorter.
    for (const id of PROP_IDS) {
      const [min, max] = PROPS[id].expect;
      expect(min, `${id} lower bound`).toBeGreaterThan(0);
      expect(max, `${id} upper bound is implausibly large`).toBeLessThan(40);
    }
  });

  it('points every prop at a file the build produces', () => {
    const staged = new Set(readdirSync('public/models/props'));
    for (const id of PROP_IDS) {
      const file = PROPS[id].url.split('/').pop() as string;
      expect(staged.has(file), `${id} -> ${file}; run npm run assets:build`).toBe(true);
    }
  });
});

describe('decoration cannot become gameplay', () => {
  it('never imports from the level simulation or scoring', () => {
    // The environment is handed a distance and returns objects. If it could
    // reach the runner it could award a point or trigger a collision, and the
    // separation that keeps colliders stable while art changes would be gone.
    const dir = 'src/render/environment';
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
      const source = readFileSync(join(dir, file), 'utf8');
      for (const match of source.matchAll(/from\s+'([^']+)'/g)) {
        const target = match[1] ?? '';
        const isTypeOnly = source.includes(`import type { LevelConfig } from '${target}'`);
        if (/levels\/(runner|level1)/.test(target)) offenders.push(`${file} -> ${target}`);
        if (/core\/scoring/.test(target)) offenders.push(`${file} -> ${target}`);
        // The level config is allowed, but only as a type.
        if (/levels\/types/.test(target) && !isTypeOnly) {
          offenders.push(`${file} -> ${target} (must be a type-only import)`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('gives layers no way to emit an event', () => {
    // update() returns void and takes no emitter. Asserted on the contract
    // source, because the type disappears at runtime. Comments are stripped
    // first — the prose explaining the rule naturally uses the same words.
    const contract = stripComments(readFileSync('src/render/environment/layer.ts', 'utf8'));
    expect(contract).toContain('update(travelled: number, step: number): void;');
    expect(contract).not.toMatch(/\bemit\b|RunEvent|onEvent/);
  });

  it('keeps every layer update returning void', () => {
    const dir = 'src/render/environment';
    for (const file of LAYER_IDS.map((id) => `${id}.ts`)) {
      const code = stripComments(readFileSync(join(dir, file), 'utf8'));
      const signature = code.match(/update\([^)]*\):\s*(\w+)/);
      expect(signature?.[1], `${file} update must return void`).toBe('void');
    }
  });
});

describe('layers stay independently reviewable', () => {
  it('parses the ?layers switch, including all and none', () => {
    expect(requestedLayers('')).toEqual(new Set(LAYER_IDS));
    expect(requestedLayers('?layers=all')).toEqual(new Set(LAYER_IDS));
    expect(requestedLayers('?layers=none')).toEqual(new Set());
    expect(requestedLayers('?layers=sky')).toEqual(new Set(['sky']));
    expect(requestedLayers('?layers=sky,rooftop')).toEqual(new Set(['sky', 'rooftop']));
  });

  it('ignores unknown layer names rather than failing', () => {
    expect(requestedLayers('?layers=sky,nonsense')).toEqual(new Set(['sky']));
  });

  it('gives every layer its own module', () => {
    const files = new Set(readdirSync('src/render/environment'));
    for (const id of LAYER_IDS) {
      expect(files.has(`${id}.ts`), `${id} should be its own module`).toBe(true);
    }
  });
});

describe('the environment stays inside its budget', () => {
  // jsdom has no matchMedia. The atmosphere layer guards against its absence,
  // but stub it so the test exercises the normal path rather than the
  // reduced-motion one.
  beforeAll(() => {
    if (!window.matchMedia) {
      Object.defineProperty(window, 'matchMedia', {
        value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
      });
    }
  });

  /** Load a prop GLB from disk, so the test measures the real scene graph. */
  async function diskLoader(url: string): Promise<Object3D> {
    const path = `public${url}`;
    const buf = readFileSync(path);
    const array = new ArrayBuffer(buf.byteLength);
    new Uint8Array(array).set(buf);
    return new Promise((resolve, reject) => {
      new GLTFLoader().parse(array, '', (gltf) => resolve(gltf.scene), reject);
    });
  }

  it('builds the full environment under the triangle and material budget', async () => {
    const env = await Environment.build(LEVEL_1, new Set(LAYER_IDS), diskLoader);
    const { triangles, materials } = env.measure();

    // design.md section 11: aim below 150k visible triangles and 100 draw
    // calls in the busiest scene. Materials stand in for draw calls here,
    // since the real count needs a renderer.
    expect(triangles, `${triangles} triangles`).toBeLessThan(150_000);
    expect(materials, `${materials} materials`).toBeLessThan(60);
    // A floor too: a budget nobody can hit means the layers silently failed.
    expect(triangles).toBeGreaterThan(5_000);

    env.dispose();
  }, 60_000);

  it('releases every object on dispose, so a replay cannot accumulate', async () => {
    const env = await Environment.build(LEVEL_1, new Set(LAYER_IDS), diskLoader);
    expect(env.layers.length).toBe(LAYER_IDS.length);
    expect(env.object.children.length).toBeGreaterThan(0);

    env.dispose();

    expect(env.layers).toHaveLength(0);
    expect(env.measure().triangles).toBe(0);
  }, 60_000);

  it('builds only what was asked for', async () => {
    const env = await Environment.build(LEVEL_1, new Set(['sky', 'rooftop']), diskLoader);
    expect(env.layers.map((l) => l.id)).toEqual(['sky', 'rooftop']);
    env.dispose();
  }, 60_000);
});
