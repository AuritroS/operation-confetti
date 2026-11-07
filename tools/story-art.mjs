#!/usr/bin/env node
/**
 * Generate the comic's panels with the OpenAI images API.
 *
 * The prompts, references and budget are the ones in `docs/STORY_PASS.md`.
 * Every panel is an *edit*: the existing illustrations go in as likeness
 * references and the 3D plates as prop references, so a generated panel
 * shows the same people and the same props the player then sees in 3D.
 *
 * Money is the constraint, so the script keeps a ledger. Every response's
 * `usage` is priced and appended to `.local-tmp/story-art/ledger.json`, and
 * the script refuses to call again once cumulative spend reaches the cap.
 * The cap is enforced here, not remembered.
 *
 * Usage:
 *   node tools/story-art.mjs <panel|all> [--n 2] [--quality low] [--tag r1]
 *                                        [--size 832x1792] [--prompt-suffix "..."]
 *   node tools/story-art.mjs --ledger        print spend so far
 *
 * Output: .local-tmp/story-art/<panel>/<tag>-<i>.webp and a contact sheet
 * per panel at .local-tmp/story-art/<panel>/sheet-<tag>.png.
 *
 * Needs OPENAI_API_KEY in .env (gitignored). Never logs it.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { loadEnv } from './env.mjs';

const OUT = resolve('.local-tmp/story-art');
const REFS = join(OUT, 'refs');
const LEDGER = join(OUT, 'ledger.json');
const CAP_USD = 2.95;
/** Spent on the 7 Nov probes before the ledger existed. */
const PRIOR_USD = 0.065;
const PRICE = { textIn: 5 / 1e6, imageIn: 8 / 1e6, imageOut: 30 / 1e6 };
const MODEL = 'gpt-image-2.6-sunburst';

const GUARD =
  ' Same painted illustration style, palette and lighting as image 1: saturated night, gold and'
  + ' purple light, soft painterly rendering of every object including props. Tall phone-screen'
  + ' portrait composition. No text, no title, no lettering, no logos, no watermark. Keep the top'
  + ' 12% of the frame free of faces and key objects (a button sits there), and keep the bottom'
  + ' quarter free of faces and text, with ground, street or rooftop there instead. Faces and'
  + ' hands fully in frame and anatomically correct, five fingers per hand, nothing important cut'
  + ' by the edges.';

/** Panel id → references (in order; "image 1" is the first) and prompt. */
const PANELS = {
  vault: {
    refs: ['matthew', 'gate', 'blaster', 'tower', 'present'],
    prompt:
      'The man in image 1, same face, glasses, hair and navy-and-gold suit, stands in the open'
      + ' doorway of a huge round vault door like image 2, its gift emblem catching gold light.'
      + ' He has just picked up the gold grapple blaster from image 3 and holds it loosely, looking'
      + ' out. Beyond the door: a rooftop edge and the Toronto skyline at night with the CN Tower'
      + ' from image 4 lit purple, and a full moon. A few yellow presents like image 5 are stacked'
      + ' at his feet. Low three-quarter angle from behind his shoulder, so the city is the subject;'
      + ' his face is seen in profile. His whole figure sits in the lower two thirds of the frame'
      + ' with generous night sky above his head.',
  },
  chase: {
    refs: ['matthew', 'blaster', 'present', 'tower'],
    prompt:
      'The man in image 1, same face, glasses, hair and suit, swinging on a glowing gold cable'
      + ' from the blaster in image 2, low over a Toronto night street between brick buildings'
      + ' with striped awnings and hanging street signs, CN Tower from image 4 behind him and the'
      + ' full moon low on the left side of the sky. A yellow present like image 3 is tucked under'
      + ' his arm, and two more presents are falling ahead of him down the street, as if dropped by'
      + ' someone fleeing. Dynamic diagonal composition, motion lines on the cable, his whole body'
      + ' and the raised blaster arm fully inside the middle of the frame with clear sky above.',
  },
  rooftop: {
    refs: ['aurora', 'matthew-aurora', 'tower'],
    prompt:
      'The woman in image 1, same face, crown and purple-and-gold gown, and the man in image 2,'
      + ' same face, glasses, hair and navy-and-gold suit, facing each other on a rooftop at'
      + ' night, a brick parapet between them. He holds up a confetti cannon: a chunky, short,'
      + ' wide-barrelled toy blaster in steel grey and deep blue with gold bands, a gold grip and a'
      + ' grey bowl-shaped hopper on top, painted with the same soft materials and highlights as'
      + ' his suit, clearly a party toy and not a real gun. She holds the same birthday cake she'
      + ' holds in image 1, candles lit, head tilted, unimpressed and amused. Toronto skyline with'
      + ' the CN Tower from image 3 and the full moon behind her. Three-quarter view with him'
      + ' nearer the camera, cannon fully visible, both faces in the upper middle of the frame.',
  },
  win: {
    refs: ['matthew-aurora', 'aurora'],
    prompt:
      'The two people in image 1, same faces, hair and costumes; her face also as in image 2.'
      + ' On a rooftop at night under confetti falling everywhere in gold and purple. The man'
      + ' stands on the rooftop with his whole body visible down to his boots, holding the same'
      + ' birthday cake she holds in image 2 with all its candles lit, grinning. A chunky toy'
      + ' confetti cannon in steel grey, deep blue and gold is slung on his back, still smoking a'
      + ' little. The woman sits on the parapet behind him, arms crossed, smiling despite herself,'
      + ' her crown slightly askew. Toronto skyline and CN Tower behind. The rooftop floor fills'
      + ' the bottom of the frame in front of him. Warm, celebratory.',
  },
  loss: {
    refs: ['aurora', 'matthew'],
    prompt:
      'The woman in image 1, same face, crown and purple-and-gold gown, standing on the edge of'
      + ' a rooftop parapet, turning back over her shoulder to laugh at the viewer the instant'
      + ' before she leaps into the night, holding the same birthday cake she holds in image 1'
      + ' in both hands at chest height, candles lit. A spiral of magenta magic winds around her.'
      + ' In the near foreground at the bottom left, the gloved hand and arm of the man in'
      + ' image 2 reaching after her, the cake just out of reach. Toronto skyline and moon'
      + ' beyond. Her face and the cake in the upper middle of the frame, nothing in the top'
      + ' corners. Playful, not grim.',
  },
};

/**
 * Depth layers, cut from a chosen panel.
 *
 * Two edits of the same picture so the composition is identical: one with
 * the people painted out, one with only the people on a transparent ground.
 * The player moves them at different rates for the parallax.
 */
const LAYERS = {
  background: {
    prompt:
      'Remove every person from this image, along with anything they are holding, wearing or'
      + ' trailing (cable, magic, confetti they hold). Fill in the street, buildings, sky and'
      + ' rooftop behind them in exactly the same style, palette and lighting. Change nothing'
      + ' else. No text.',
    background: 'opaque',
  },
  characters: {
    prompt:
      'Keep only the people in this image, exactly as they are, with what they hold and wear.'
      + ' Remove everything else and make the background fully transparent. No text.',
    background: 'transparent',
  },
};

// ---- args ---------------------------------------------------------------

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const which = args.find((a) => !a.startsWith('--') && !Object.values(opts()).includes(a));
function opts() { return { n: opt('n'), quality: opt('quality'), tag: opt('tag'), size: opt('size'), suffix: opt('prompt-suffix') }; }
const N = Number(opt('n', '2'));
const QUALITY = opt('quality', 'medium');
const TAG = opt('tag', 'r1');
const SIZE = opt('size', '1024x2208');
const SUFFIX = opt('prompt-suffix', '');

// ---- ledger -------------------------------------------------------------

function ledger() {
  if (!existsSync(LEDGER)) return { prior: PRIOR_USD, calls: [] };
  return JSON.parse(readFileSync(LEDGER, 'utf8'));
}
function spent(l) { return l.prior + l.calls.reduce((a, c) => a + c.usd, 0); }
function price(usage) {
  const d = usage.input_tokens_details ?? {};
  return (d.text_tokens ?? 0) * PRICE.textIn
    + (d.image_tokens ?? 0) * PRICE.imageIn
    + (usage.output_tokens ?? 0) * PRICE.imageOut;
}

if (args.includes('--ledger')) {
  const l = ledger();
  console.log(`spent $${spent(l).toFixed(3)} of $${CAP_USD} (${l.calls.length} calls, $${l.prior} prior)`);
  for (const c of l.calls) console.log(`  ${c.at}  ${c.panel.padEnd(8)} ${c.tag.padEnd(4)} n=${c.n} ${c.size} ${c.quality.padEnd(6)} $${c.usd.toFixed(3)}`);
  process.exit(0);
}

// ---- generate -------------------------------------------------------------

const env = loadEnv();
const KEY = env.OPENAI_API_KEY;
if (!KEY) { console.error('OPENAI_API_KEY is not set in .env'); process.exit(1); }

const LAYER_SRC = opt('layers', '');
const targets = which === 'all' || !which ? Object.keys(PANELS) : [which];
for (const t of targets) if (!PANELS[t]) { console.error(`no panel "${t}". Try: ${Object.keys(PANELS).join(', ')}`); process.exit(1); }

async function generate(panel, layer = null) {
  const l = ledger();
  const so_far = spent(l);
  if (so_far >= CAP_USD) {
    console.error(`cap reached: $${so_far.toFixed(3)} of $${CAP_USD}. Not calling.`);
    return false;
  }
  const spec = layer ? { refs: [], prompt: LAYERS[layer].prompt } : PANELS[panel];
  mkdirSync(OUT, { recursive: true });
  // curl rather than fetch: it honours the environment's proxy settings,
  // which Node's fetch does not, and multipart uploads are its home turf.
  // The key goes in via a header file, never on the command line.
  const headerFile = join(OUT, '.auth');
  writeFileSync(headerFile, `Authorization: Bearer ${KEY}\n`, { mode: 0o600 });
  const promptFile = join(OUT, `.prompt-${panel}.txt`);
  writeFileSync(promptFile, spec.prompt + GUARD + (SUFFIX ? ` ${SUFFIX}` : ''));
  const argv = ['-s', '-m', '900', 'https://api.openai.com/v1/images/edits', '-H', `@${headerFile}`,
    '-F', `model=${MODEL}`];
  for (const ref of spec.refs) {
    const file = join(REFS, `${ref}.png`);
    if (!existsSync(file)) throw new Error(`missing reference ${file}; downscale the references first`);
    argv.push('-F', `image[]=@${file};type=image/png`);
  }
  if (layer) {
    // The chosen panel itself is the one and only reference.
    argv.push('-F', `image[]=@${resolve(LAYER_SRC)};type=image/webp`);
    argv.push('-F', `background=${LAYERS[layer].background}`);
  }
  argv.push('-F', `prompt=<${promptFile}`, '-F', `size=${SIZE}`, '-F', `quality=${QUALITY}`,
    '-F', `n=${layer ? 1 : N}`, '-F', 'output_format=webp');

  process.stdout.write(`${panel}: ${N} × ${QUALITY} ${SIZE} … `);
  const started = Date.now();
  let body;
  try {
    body = JSON.parse(execFileSync('curl', argv, { maxBuffer: 64 * 1024 * 1024 }).toString());
  } catch (e) {
    console.error(`\n  curl failed: ${e.message.slice(0, 300)}`);
    return false;
  }
  if (body.error) {
    console.error(`\n  ${body.error.message ?? JSON.stringify(body).slice(0, 300)}`);
    return false;
  }
  const dir = join(OUT, panel);
  mkdirSync(dir, { recursive: true });
  const files = [];
  body.data.forEach((d, i) => {
    const file = join(dir, layer ? `${TAG}-${layer}.webp` : `${TAG}-${i + 1}.webp`);
    writeFileSync(file, Buffer.from(d.b64_json, 'base64'));
    files.push(file);
  });
  const usd = price(body.usage);
  l.calls.push({
    at: new Date().toISOString(), panel, tag: TAG, n: N, size: SIZE, quality: QUALITY,
    usage: body.usage, usd, files: files.map((f) => f.replace(`${OUT}/`, '')),
  });
  writeFileSync(LEDGER, JSON.stringify(l, null, 2));
  console.log(`$${usd.toFixed(3)} in ${Math.round((Date.now() - started) / 1000)}s → ${files.length} file(s). Total $${spent(l).toFixed(3)}`);
  await sheet(panel);
  return true;
}

/** One image per panel with every candidate side by side, for review. */
async function sheet(panel) {
  const sharp = (await import('sharp')).default;
  const dir = join(OUT, panel);
  const files = readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
  const W = 360;
  const metas = await Promise.all(files.map((f) => sharp(join(dir, f)).metadata()));
  const H = Math.round(W * (metas[0].height / metas[0].width));
  const cols = Math.min(files.length, 4);
  const rows = Math.ceil(files.length / cols);
  const tiles = await Promise.all(files.map(async (f, i) => ({
    input: await sharp(join(dir, f)).resize(W, H).png().toBuffer(),
    left: (i % cols) * (W + 10), top: Math.floor(i / cols) * (H + 10),
  })));
  await sharp({ create: { width: cols * (W + 10), height: rows * (H + 10), channels: 3, background: '#333' } })
    .composite(tiles).png().toFile(join(dir, `sheet-${TAG}.png`));
  console.log(`  sheet: ${files.join(', ')}`);
}

if (LAYER_SRC) {
  // node tools/story-art.mjs <panel> --layers assets/<panel>.webp --tag layer
  if (!existsSync(LAYER_SRC)) { console.error(`no such file ${LAYER_SRC}`); process.exit(1); }
  const only = opt('only', '');
  for (const layer of ['background', 'characters']) {
    if (only && layer !== only) continue;
    if (!(await generate(targets[0], layer))) break;
  }
} else {
  for (const panel of targets) {
    if (!(await generate(panel))) break;
  }
}
