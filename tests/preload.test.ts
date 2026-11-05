import { describe, expect, it } from 'vitest';
import { assetManifest, preloadAssets } from '../src/assets/preload';
import { SOURCES } from '../src/assets/manifest';
import {
  BOSS_ACTORS,
  BOSS_ANIMATION_LIBRARIES,
  BOSS_PARTICLES,
  BOSS_PROPS,
} from '../src/assets/boss/catalog';
import { PROPS } from '../src/render/environment/props';
import { STREET_PROPS } from '../src/render/skyline-props';
import { STORY_IMAGES, storyImageUrl } from '../src/story/script';

/**
 * The preload manifest's only job is to be complete.
 *
 * An asset missing from it is not a visible bug — the level still loads it,
 * just mid-game, which is exactly the stall the preload exists to remove. So
 * the test is that every registry in the project is represented, derived from
 * the registries themselves. Adding a prop and forgetting the manifest then
 * fails here instead of looking like a slow phone.
 */
describe('asset manifest', () => {
  const manifest = assetManifest();
  const listed = new Set(manifest);

  const registries: ReadonlyArray<readonly [string, readonly string[]]> = [
    ['characters', Object.values(SOURCES.characters)],
    ['animation libraries', SOURCES.animationLibraries],
    ['manifest props', Object.values(SOURCES.props)],
    ['environment props', Object.values(PROPS).map((p) => p.url)],
    ['street props', Object.values(STREET_PROPS).map((p) => p.url)],
    ['boss actors', Object.values(BOSS_ACTORS).map((a) => a.url)],
    ['boss animation libraries', BOSS_ANIMATION_LIBRARIES],
    ['boss props', BOSS_PROPS.map((p) => p.url)],
    ['boss particles', Object.values(BOSS_PARTICLES)],
    ['story artwork', STORY_IMAGES.map(storyImageUrl)],
  ];

  for (const [name, urls] of registries) {
    it(`covers every ${name}`, () => {
      expect(urls.length).toBeGreaterThan(0);
      const missing = urls.filter((url) => !listed.has(url));
      expect(missing).toEqual([]);
    });
  }

  it('fetches nothing twice', () => {
    // The character GLBs are reachable through both the level 1/2 manifest
    // and the boss catalogue. A duplicate would charge the player for a
    // download they already have.
    expect(manifest.length).toBe(listed.size);
  });

  it('asks only for absolute, servable paths', () => {
    for (const url of manifest) {
      expect(url.startsWith('/'), url).toBe(true);
      expect(/\.(glb|png|jpe?g|webp)$/i.test(url), url).toBe(true);
    }
  });
});

describe('preloadAssets', () => {
  it('reports progress monotonically from 0 to 1', async () => {
    const seen: number[] = [];
    const urls = ['/a.glb', '/b.glb', '/c.png'];
    // Nothing is served in the test environment, so every fetch fails — which
    // is the case worth asserting anyway: a failed asset must still advance
    // the bar, or a 404 leaves the player on a progress bar that never fills.
    const report = await preloadAssets((f) => seen.push(f), urls);

    expect(seen[0]).toBe(0);
    expect(seen.at(-1)).toBe(1);
    expect([...seen]).toEqual([...seen].sort((a, b) => a - b));
    expect(report.total).toBe(3);
    expect(report.loaded).toBe(3);
  });

  it('resolves rather than throwing when assets are unavailable', async () => {
    const report = await preloadAssets(undefined, ['/missing.glb']);
    expect(report.failed).toEqual(['/missing.glb']);
  });

  it('completes immediately on an empty list', async () => {
    const fractions: number[] = [];
    const report = await preloadAssets((f) => fractions.push(f), []);
    expect(report).toEqual({ total: 0, loaded: 0, failed: [] });
    expect(fractions).toEqual([0]);
  });
});
