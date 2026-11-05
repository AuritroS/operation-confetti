/**
 * Boot-time asset preload.
 *
 * Every level used to fetch its own models when it was mounted, which put a
 * download between level 1's gate and level 2's first swing — the player sat
 * on a black screen at the one moment the game had just earned their
 * attention. So the whole catalogue is fetched once, behind a progress bar,
 * before the title panel appears.
 *
 * The mechanism is three.js's own `Cache`, not a parallel asset store:
 * `FileLoader` and `ImageLoader` both consult it before going to the network,
 * keyed `file:<url>` and `image:<url>`. Warming those keys means the six
 * existing `GLTFLoader`/`TextureLoader` call sites around the codebase are
 * served from memory without any of them learning that a preloader exists.
 * That is deliberate: a loader that each level has to opt into is a loader
 * some level will forget to use.
 *
 * Two consequences worth knowing:
 *
 *  - The response type has to match what the real consumer asks for, or the
 *    cached entry is the wrong shape. GLTFLoader reads `arraybuffer`, so GLBs
 *    are warmed as `arraybuffer`; textures go through ImageLoader, so PNGs are
 *    warmed as images under the `image:` key.
 *  - GLTF *parsing* still happens per load. That is microseconds of CPU
 *    against hundreds of milliseconds of radio, and leaving it alone keeps
 *    this file incapable of changing what a level ends up with.
 *
 * The URL list is derived from the registries rather than typed out, so a prop
 * added to `PROPS` or `STREET_PROPS` is preloaded by construction. A test
 * asserts that, because a hand-maintained copy of a list is the thing that
 * silently falls behind.
 */
import { Cache, FileLoader, ImageLoader } from 'three';
import { SOURCES } from './manifest';
import {
  BOSS_ACTORS,
  BOSS_ANIMATION_LIBRARIES,
  BOSS_PARTICLES,
  BOSS_PROPS,
} from './boss/catalog';
import { PROPS } from '../render/environment/props';
import { STREET_PROPS } from '../render/skyline-props';
import { STORY_IMAGES, storyImageUrl } from '../story/script';

/** Enabled once, here, because every warmed key is read back through it. */
Cache.enabled = true;

/**
 * Every URL the campaign will ask for, in the order it will ask.
 *
 * Ordering matters a little: the characters and the level 1 props come first,
 * so if a player starts the moment the bar fills, the assets needed soonest
 * have been in cache the longest.
 */
export function assetManifest(): readonly string[] {
  const urls = [
    ...Object.values(SOURCES.characters),
    ...SOURCES.animationLibraries,
    ...Object.values(SOURCES.props),
    ...Object.values(PROPS).map((p) => p.url),
    ...Object.values(STREET_PROPS).map((p) => p.url),
    ...Object.values(BOSS_ACTORS).map((a) => a.url),
    ...BOSS_ANIMATION_LIBRARIES,
    ...BOSS_PROPS.map((p) => p.url),
    ...Object.values(BOSS_PARTICLES),
    ...STORY_IMAGES.map(storyImageUrl),
  ];
  // The two character GLBs appear in both the level 1/2 manifest and the
  // boss catalogue, under the same path. Fetching them twice would charge
  // the player for a download they already have.
  return [...new Set(urls)];
}

export interface PreloadReport {
  readonly total: number;
  readonly loaded: number;
  /** URLs that could not be fetched. The game still starts. */
  readonly failed: readonly string[];
}

/**
 * Fetch everything, reporting progress as a 0..1 fraction.
 *
 * A failure is recorded and stepped over rather than thrown. Every consumer
 * in the codebase already degrades to a primitive when a model is missing,
 * and refusing to boot the party game because one decorative bush 404'd
 * would be the worse outcome.
 */
export async function preloadAssets(
  onProgress?: (fraction: number, report: PreloadReport) => void,
  urls: readonly string[] = assetManifest(),
): Promise<PreloadReport> {
  const total = urls.length;
  const failed: string[] = [];
  let loaded = 0;

  const tick = (): void => {
    loaded++;
    onProgress?.(total === 0 ? 1 : loaded / total, { total, loaded, failed });
  };

  // Bounded concurrency. Unbounded means ~60 simultaneous requests, which on
  // a phone queues behind itself and makes the bar sit still then jump;
  // serial means the whole wait is the sum of the latencies.
  const CONCURRENCY = 6;
  const queue = [...urls];
  const worker = async (): Promise<void> => {
    for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
      try {
        await warm(url);
      } catch {
        failed.push(url);
      }
      tick();
    }
  };

  onProgress?.(0, { total, loaded: 0, failed });
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, worker));
  return { total, loaded, failed };
}

/** Put one URL in the cache under the key its real consumer will look up. */
function warm(url: string): Promise<unknown> {
  if (/\.(png|jpe?g|webp)$/i.test(url)) {
    return new ImageLoader().loadAsync(url);
  }
  const loader = new FileLoader();
  loader.setResponseType('arraybuffer');
  return loader.loadAsync(url);
}
