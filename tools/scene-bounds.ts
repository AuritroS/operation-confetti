/**
 * Prop facts for offline tooling, measured from the staged glTF.
 *
 * The browser builds the same `PropFacts` from loaded GLBs. Both must agree
 * or the audit certifies a scene nobody ships, which is why the bounds come
 * from the file rather than from a copy of the numbers.
 */
import { glbBounds } from '../tests/glb-bounds';
import { STREET_PROPS, type StreetPropId } from '../src/render/skyline-props';
import type { PropFacts, PropLookup } from '../src/levels/skyline/resolve';

export function propLookup(): PropLookup {
  const cache = new Map<string, PropFacts | null>();
  return (prop: string): PropFacts | null => {
    if (cache.has(prop)) return cache.get(prop) ?? null;
    const spec = STREET_PROPS[prop as StreetPropId];
    if (!spec) {
      cache.set(prop, null);
      return null;
    }
    const b = glbBounds(spec.url.replace(/^\//, 'public/'));
    const s = spec.scale;
    // Base-seated at load, so the measured minimum lands on y=0.
    const lift = -b.min[1] * s;
    const facts: PropFacts = {
      box: {
        min: { x: b.min[0] * s, y: b.min[1] * s + lift, z: b.min[2] * s },
        max: { x: b.max[0] * s, y: b.max[1] * s + lift, z: b.max[2] * s },
      },
      front: spec.front,
      long: spec.long,
      points: spec.points,
    };
    cache.set(prop, facts);
    return facts;
  };
}
