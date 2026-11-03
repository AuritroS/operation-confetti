import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import sharp from 'sharp';
import { PALETTE } from '../src/render/palette';

/**
 * Verifies the recolour actually ran, by reading pixels out of the generated
 * atlases rather than trusting that a file exists.
 *
 * The atlases are 8x4 grids of gradient ramps. A recipe targets a named cell,
 * so sampling that cell's centre and comparing hue against the palette proves
 * the bake happened and hit the right swatch.
 */

const GRID_X = 8;
const GRID_Y = 4;

function toRgb(n: number): [number, number, number] {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Hue in degrees, which survives the lightness variation within a ramp. */
function hue([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d === 0) return -1;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

async function sampleCell(file: string, cell: string): Promise<[number, number, number]> {
  const image = sharp(file).ensureAlpha();
  const { width = 1024, height = 1024 } = await image.metadata();
  const cx = cell.charCodeAt(0) - 65;
  const cy = Number(cell.slice(1)) - 1;
  const x = Math.round((cx + 0.5) * (width / GRID_X));
  const y = Math.round((cy + 0.5) * (height / GRID_Y));
  const { data } = await image.raw().toBuffer({ resolveWithObject: true });
  const i = (y * width + x) * 4;
  return [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
}

const ATLAS = (id: string) => `public/models/textures/${id}_atlas.png`;

describe('recoloured atlases', () => {
  it('generates one atlas per character', () => {
    for (const id of ['matthew', 'aurora', 'guard']) {
      expect(existsSync(ATLAS(id)), `${ATLAS(id)} — run npm run assets:recolour`).toBe(true);
    }
  });

  it('puts the saturated navy on Matthew’s cloth swatch', async () => {
    // B2 is the cloth shared by hood, cape and tunic. It was pack green.
    const sampled = await sampleCell(ATLAS('matthew'), 'B2');
    expect(hueGap(hue(sampled), hue(toRgb(PALETTE.navy)))).toBeLessThan(25);
  });

  it('puts gold on Matthew’s trim swatches', async () => {
    for (const cell of ['G1', 'F1']) {
      const sampled = await sampleCell(ATLAS('matthew'), cell);
      expect(hueGap(hue(sampled), hue(toRgb(PALETTE.gold))), `cell ${cell}`).toBeLessThan(25);
    }
  });

  it('puts purple on Aurora’s robe and magenta on her cape', async () => {
    expect(hueGap(hue(await sampleCell(ATLAS('aurora'), 'A2')), hue(toRgb(PALETTE.purpleDeep))))
      .toBeLessThan(30);
    expect(hueGap(hue(await sampleCell(ATLAS('aurora'), 'C2')), hue(toRgb(PALETTE.magenta))))
      .toBeLessThan(30);
  });

  it('puts navy on the guard’s armour swatch', async () => {
    expect(hueGap(hue(await sampleCell(ATLAS('guard'), 'D1')), hue(toRgb(PALETTE.navyDeep))))
      .toBeLessThan(30);
  });

  it('keeps the skin swatch a skin tone, never a clothing colour', async () => {
    // A1 is skin on every character. It IS deliberately recoloured now — to
    // tones sampled from each reference face — but recolouring skin with a
    // clothing colour is the specific failure design.md section 10 warns
    // about, so assert it still reads as skin: warm, with red above green
    // above blue, and nowhere near any garment hue in the palette.
    const garments = [PALETTE.navy, PALETTE.navyDeep, PALETTE.purpleDeep, PALETTE.magenta, PALETTE.steel];

    for (const id of ['matthew', 'aurora', 'guard']) {
      const [r, g, b] = await sampleCell(ATLAS(id), 'A1');
      expect(r, `${id} skin should be warm`).toBeGreaterThan(g);
      expect(g, `${id} skin should be warm`).toBeGreaterThan(b);
      expect(r, `${id} skin should not be dark`).toBeGreaterThan(120);

      const skinHue = hue([r, g, b]);
      for (const garment of garments) {
        expect(
          hueGap(skinHue, hue(toRgb(garment))),
          `${id} skin must not take garment colour #${garment.toString(16)}`,
        ).toBeGreaterThan(40);
      }
    }
  });

  it('gives Matthew and Aurora the skin tones from their references', async () => {
    const [mr, mg, mb] = await sampleCell(ATLAS('matthew'), 'A1');
    const [ar, ag, ab] = await sampleCell(ATLAS('aurora'), 'A1');

    const luma = (r: number, g: number, b: number): number =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;

    // Aurora's reference face is lighter and warmer than Matthew's, and the
    // bake must preserve that difference rather than flattening both.
    expect(luma(ar, ag, ab)).toBeGreaterThan(luma(mr, mg, mb));
  });

  it('keeps the character silhouette readable against the floor', () => {
    // The first build made Matthew, the floor and the lane dividers all
    // saturated blue at the same luminance, and he vanished into the ground.
    const luma = (n: number): number => {
      const [r, g, b] = toRgb(n);
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const separation = luma(PALETTE.navy) - luma(PALETTE.slate);
    expect(separation).toBeGreaterThan(18);
  });
});
