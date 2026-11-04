/**
 * Every camera and framing constant for level 2, in one place.
 *
 * Collected here deliberately. The straight-on camera may yet become an
 * oblique one, and when the values were scattered across the camera, the
 * street layer and the scene, changing it meant hunting rather than editing.
 * Anything that encodes "where the lens is" belongs in this file, and
 * anything that reads it should derive rather than re-assume.
 *
 * ---- why the distance changed -------------------------------------------
 *
 * `stage.ts` runs a 64 degree vertical FOV in portrait, so at the old 36-unit
 * stand-off the frame was 45 world units tall and Matthew — 2.385 of them —
 * filled 5.3% of it. Level 1 puts its camera 5.2 units back for a 6.5-unit
 * frame, where the same character fills 22.3%. He was **4.2x smaller** here
 * than in the level the player has just come from, which is what made level 2
 * read as both shrunken and sparse: the same props spread over four times the
 * area.
 *
 * 18 units puts him at 10.6% — half of level 1's apparent scale, which is the
 * "a bit scaled down, more expansive" the review asked for, and twice what it
 * was. The lanes had to narrow first; see `LANE_WIDTH` in the course.
 */

/** Stand-off from the hero along +Z, before the portrait correction. */
export const CAMERA_DISTANCE = 18;

/**
 * Extra distance on narrow screens.
 *
 * Portrait crops horizontally, so a tall thin frame sees less of the street's
 * width at the same stand-off. Pulling back recovers the outer lanes rather
 * than letting them slide off the edge.
 */
export const CAMERA_ASPECT_REFERENCE = 0.48;
export const CAMERA_ASPECT_PULLBACK = 9;

/** Height above the tracked focus point. */
export const CAMERA_HEIGHT = 4.6;
/** Vertical offset of the look-at target, relative to the same focus point. */
export const CAMERA_LOOK_HEIGHT = 1.2;
/** How far down the route the camera aims, in units ahead. */
export const CAMERA_LOOK_AHEAD = -14;

/**
 * Lateral offset and yaw, for an oblique variant.
 *
 * Zero today — the camera looks straight down the street. They exist as named
 * constants so that becoming oblique is an edit here plus a retune, not a
 * search through three files. Anything that would break when these go
 * non-zero is called out at its own site.
 */
export const CAMERA_SIDE = 0;
export const CAMERA_YAW = 0;

/** Altitude tracking: how much of the hero's height the focus point follows. */
export const FOCUS_BASE = 3.4;
export const FOCUS_FOLLOW = 0.4;
/** Reduced motion follows less, so the frame moves less. */
export const FOCUS_FOLLOW_REDUCED = 0.25;
/** Exponential settle rate for the focus point. */
export const FOCUS_SETTLE = 4;

/** Starting focus height, also used on reset. */
export const FOCUS_START = 6.2;

/**
 * Fog, clip and draw distance — one interlocking set, not three dials.
 *
 * The constraint that ties them together: for content to FADE in rather than
 * snap, it has to be essentially invisible at the distance it first appears,
 * and that distance has to be inside the frustum. So
 *
 *     CAMERA_FAR  >=  SPAWN_DISTANCE  >=  ln(20) / FOG_DENSITY
 *
 * The previous values failed it badly. At far=180 the frustum cut 162 units
 * ahead of the player, towers were being placed out to 228, and fog at
 * density 0.011 still left them **17% visible** where the clip plane sliced
 * them off. They did not fade in; they appeared, whole, in one frame.
 *
 * Fog thin enough to read ten seconds of route ahead can never reach 95%
 * inside a 180-unit frustum — the horizon sits at 272 units. That is why the
 * fix is a bigger frustum rather than thicker fog: thicker fog would hide the
 * popping by also hiding the obstacle the player is supposed to be reading.
 */
export const FOG_DENSITY = 0.009;
/** 95% fogged: ln(20) / FOG_DENSITY, rounded up. Content spawns past this. */
export const FOG_HORIZON = 340;
export const CAMERA_FAR = 380;
/**
 * Near plane, raised from three.js's 0.1.
 *
 * Depth precision scales with far/near, and pushing far to 380 at near=0.1
 * would give a ratio of 3800 — enough to z-fight the crossing tiles against
 * the road they sit on. At 1.0 the ratio is 380, better than the 1800 we had
 * before this change, and nothing is ever within a metre of a camera that
 * sits eighteen units behind the hero.
 */
export const CAMERA_NEAR = 1;

/**
 * How far ahead gameplay entities are kept alive, in units.
 *
 * Longer than it needs to be for collision, because the complaint this
 * answers is that the player could not see what was coming. Their unfogged
 * markers are what actually carry at this range; the meshes themselves fade.
 */
export const ENTITY_DRAW_AHEAD = 300;

/**
 * Half-width of the interactive zone, re-exported from the course.
 *
 * Owned by gameplay, consumed here: the street layer needs it to keep
 * dressing out of the lanes, but it is not the render layer's number to
 * choose. Level 1 enforces the same split through `isClearOfCorridor`;
 * `tests/skyline-zone.test.ts` fails if dressing crosses it.
 */
export { GAME_ZONE_HALF } from '../levels/skyline/course';
