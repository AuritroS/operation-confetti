import { route } from './motion';
import type { Course, Direction, Entity, Lane, TravelMode } from './types';

/**
 * Lateral scale.
 *
 * Halved from 6. The camera could not come closer than 36 units while the
 * outer lanes sat at +/-6 with hazards reaching +/-7.7 — and at 36 units
 * Matthew filled 5.3% of the frame against level 1's 22.3%, which is what
 * made this level read as shrunken and sparse. Lanes had to narrow before the
 * camera could come in; see `skyline-view.ts`.
 *
 * Forward speed scales with it, so apparent speed is unchanged: halving the
 * world and halving the stand-off leaves the same angular motion on screen.
 * Vertical does NOT scale — `groundY` is pinned by the character's own foot
 * drop, and compressing the swing band would collapse the gap between the
 * high road and the low road, which is the whole point of the level.
 */
const LANE_WIDTH = 3.2;

export const SKYLINE: Course = {
  duration: 45, speed: 8.5, laneWidth: LANE_WIDTH, groundY: 1.25, cycle: 3.2, entities: [],
};

/**
 * The two canonical height bands, as [bottom, top] in world units.
 *
 * Level 2 is a 3 x 2 grid: three lanes by two heights. Running puts the
 * player's collider at 0.35-2.15 and swinging at 4.1-11.9 (the arc moves,
 * the band it occupies does not), so GROUND catches a runner and never a
 * swinger, and OVERHEAD the reverse.
 *
 * Authoring outside these bands is possible and would NOT be caught by
 * playtesting, because a hazard at, say, 7-9 depends on where in the 3.2
 * second swing arc the player happens to be when they reach it — and the
 * player has no control over that. `tests/skyline-zone.test.ts` therefore
 * refuses any hazard whose span is not exactly one of these.
 */
export const BAND = {
  ground: [0, 3],
  overhead: [5, 13],
} as const;

/**
 * Half-width of the interactive zone.
 *
 * The contract between gameplay and decoration: lanes, anchors, gifts and
 * hazards live inside it and nothing decorative may enter. It lives HERE,
 * with the course, because it is a gameplay fact — the render layer imports
 * it rather than keeping its own copy.
 */
export const GAME_ZONE_HALF = 4.6;

/** Half-extents, in the rescaled world. Collision reads these directly. */
const LANE_HALF_X = 0.91; // ~57% of a lane, as before the rescale
/**
 * A span hazard blocks the whole interactive zone BY DEFINITION.
 *
 * Derived rather than written down: at 4.5 against a 4.6 zone it left a
 * 0.1-unit sliver the art covered but the collider did not — a strip that
 * looks blocked and is not. Tying the two together makes that unexpressible.
 */
const SPAN_HALF_X = GAME_ZONE_HALF;
const HALF_Z = 0.45;
const SPAN_HALF_Z = 0.95;

function gift(id: string, lane: Lane, time: number, mode: TravelMode, scored = true): Entity {
  return {
    id, lane, kind: 'gift', ...route(SKYLINE, lane, time, mode).p,
    halfX: 0.8, halfY: 0.8, halfZ: 0.8, scored,
  };
}

const at = (lane: Lane, time: number): { x: number; z: number } =>
  ({ x: lane * LANE_WIDTH, z: time * SKYLINE.speed });

/** Centre and half-height for a canonical band, so no archetype restates it. */
const band = ([low, high]: readonly [number, number]): { y: number; halfY: number } =>
  ({ y: (low + high) / 2, halfY: (high - low) / 2 });

/**
 * Hazard archetypes.
 *
 * Named for what the player has to DO about them, and each maps to exactly
 * one asset arrangement in `skyline-obstacles.ts`. Authoring by archetype
 * rather than raw half-extents is what keeps the art and the collider from
 * drifting apart: there are four shapes, not thirteen.
 */
/** Street level in one lane. Swing over it, or change lane. */
const lowBlock = (id: string, lane: Lane, time: number): Entity => ({
  id, lane, kind: 'hazard', ...at(lane, time),
  ...band(BAND.ground), halfX: LANE_HALF_X, halfZ: HALF_Z, scored: false,
});
/** Overhead in one lane. Drop under it, or change lane. */
const overhead = (id: string, lane: Lane, time: number): Entity => ({
  id, lane, kind: 'hazard', ...at(lane, time),
  ...band(BAND.overhead), halfX: LANE_HALF_X, halfZ: HALF_Z, scored: false,
});
/** Overhead across every lane. The only answer is the low road. */
const bridgeSpan = (id: string, time: number): Entity => ({
  id, lane: 0, kind: 'hazard', ...at(0, time),
  ...band(BAND.overhead), halfX: SPAN_HALF_X, halfZ: SPAN_HALF_Z, scored: false,
});
/** Street level across every lane. The only answer is the high road. */
const wallSpan = (id: string, time: number): Entity => ({
  id, lane: 0, kind: 'hazard', ...at(0, time),
  ...band(BAND.ground), halfX: SPAN_HALF_X, halfZ: 0.53, scored: false,
});

/**
 * One lane shut at every height — a COMPOSITION, not an archetype.
 *
 * This used to be a single 0-12 collider, which no asset in any pack can
 * honestly fill: it rendered as a construction barrier stretched to five
 * times the character's height. Its meaning is "ground blocked AND overhead
 * blocked", so that is what it is now — two ordinary entities at the same z,
 * each the right size for a real prop.
 *
 * It still bills once. A runner only ever meets the ground half and a
 * swinger only the overhead half; a player caught mid-transition through
 * both is covered by the one-second protection window.
 */
const shutLane = (id: string, lane: Lane, time: number): Entity[] => [
  lowBlock(`${id}-low`, lane, time),
  overhead(`${id}-high`, lane, time),
];

/**
 * The 45-second route.
 *
 * Four acts. Scored gifts are capped at four by the scoring rules, so the
 * extra nine seconds over the old 36 buy hazard variety and breathing room,
 * not more collectibles: a longer route with the old thirteen beats would
 * have been emptier, not richer.
 *
 *   teach    0-11   one archetype at a time, nothing fatal in combination
 *   commit   11-23  the bridge and the barricade, which each admit one answer
 *   mix      23-34  lane choice and height choice in the same beat
 *   closing  34-45  tightest spacing, every archetype in play
 */
SKYLINE.entities = [
  // ---- teach -----------------------------------------------------------
  gift('teach', 0, 3.5, 'swing', false),
  gift('gift-left', -1, 7, 'swing'),
  ...shutLane('first-middle', 0, 7),
  lowBlock('cone-right', 1, 11),

  // ---- commit ----------------------------------------------------------
  gift('gift-ground', 0, 13.5, 'run'),
  bridgeSpan('bridge', 15.5),
  overhead('sign-left', -1, 19.5),
  wallSpan('barricade', 22),

  // ---- mix -------------------------------------------------------------
  gift('gift-right', 1, 25, 'swing'),
  overhead('upper-left', -1, 25),
  ...shutLane('centre-tower', 0, 29),
  lowBlock('fence-right', 1, 31.5),

  // ---- closing ---------------------------------------------------------
  gift('gift-low-left', -1, 34, 'run'),
  lowBlock('low-right', 1, 34),
  overhead('mid-high', 0, 38),
  lowBlock('final-ground', 0, 41),
  overhead('final-high', 1, 41),
  ...shutLane('last-left', -1, 43.5),
].flat().sort((a, b) => a.z - b.z);

/** Ordinary inputs for the automated review; no privileged state mutation. */
export const REVIEW_SWIPES: readonly { time: number; direction: Direction }[] = [
  { time: 0, direction: 'up' },      // start swinging
  { time: 5, direction: 'left' },    // gift-left, and clear of first-middle
  { time: 11.0, direction: 'right' },// back to centre for the ground gift
  { time: 11.8, direction: 'down' }, // low road, under the bridge
  { time: 20, direction: 'up' },     // high road, over the barricade
  { time: 23.0, direction: 'right' },
  { time: 23.2, direction: 'right' },// gift-right, clear of upper-left
  { time: 31.0, direction: 'left' },
  { time: 31.2, direction: 'left' }, // clear of centre-tower, toward gift-low-left
  { time: 31.8, direction: 'down' },
  { time: 41.5, direction: 'right' },// off lane -1 before last-left
];
