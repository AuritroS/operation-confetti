/**
 * The course, DERIVED from the scene.
 *
 * Nothing is authored here any more. `scene.ts` names each encounter and
 * its assembly; this file turns that into the colliders the runner tests,
 * using the one `ASSEMBLY` table. The arrow used to run the other way, with
 * the renderer guessing which model to build from a collider's width and
 * bottom height — which is how `cone-right` came to render as a row of
 * barriers.
 *
 * The consequence worth stating: a collider can no longer disagree with its
 * art, because neither is written down twice.
 */
import { route } from './motion';
import {
  ASSEMBLY,
  BAND,
  BAY,
  COURSE,
  GAME_ZONE_HALF,
  PLAYER_HALF,
  ROUTE_LENGTH,
  bandBox,
  positionAt,
  speedAt,
  timeAt,
  type AssemblyId,
  type Encounter,
} from './config';
import { SCENE } from './scene';
import type { Course, Entity } from './types';

export { BAND, BAY, GAME_ZONE_HALF, PLAYER_HALF, ROUTE_LENGTH, positionAt, speedAt, timeAt };

export const SKYLINE: Course = {
  duration: COURSE.duration,
  speed: COURSE.speed,
  laneWidth: COURSE.laneWidth,
  groundY: COURSE.groundY,
  cycle: COURSE.cycle,
  entities: [],
};

/**
 * One encounter to one collider.
 *
 * A gift's height comes from the route it sits on — it has to be exactly
 * where the player will be — so it is sampled rather than banded. A hazard's
 * comes from its assembly's canonical band, which is what makes the 3 x 2
 * grid true rather than incidental.
 */
function toEntity(e: Encounter): Entity {
  const spec = ASSEMBLY[e.assembly];
  const z = positionAt(e.t);

  if (spec.kind === 'gift') {
    const at = route(SKYLINE, e.lane, e.t, e.mode ?? 'swing').p;
    return {
      id: e.id,
      lane: e.lane,
      kind: 'gift',
      assembly: e.assembly,
      x: at.x,
      y: at.y,
      z: at.z,
      halfX: spec.halfX,
      halfY: spec.halfX,
      halfZ: spec.halfZ,
      scored: e.scored ?? false,
    };
  }

  const band = spec.band ?? BAND.ground;
  const { y, halfY } = bandBox(band);
  return {
    id: e.id,
    lane: e.lane,
    kind: 'hazard',
    assembly: e.assembly,
    x: e.lane * COURSE.laneWidth,
    y,
    z,
    halfX: spec.halfX,
    halfY,
    halfZ: spec.halfZ,
    scored: false,
  };
}

SKYLINE.entities = SCENE.encounters.map(toEntity).sort((a, b) => a.z - b.z);

/** Assembly for an entity id, for the renderer. Never inferred from a size. */
export function assemblyOf(id: string): AssemblyId | null {
  return SCENE.encounters.find((e) => e.id === id)?.assembly ?? null;
}
