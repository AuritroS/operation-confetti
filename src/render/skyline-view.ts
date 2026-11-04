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
 * Fog and clip, both functions of the stand-off.
 *
 * Level 1's values assume its over-the-shoulder camera. At any level 2
 * distance the hero is far enough away that level 1's 0.012 density drains
 * him before anything else is considered.
 */
export const FOG_DENSITY = 0.011;
export const CAMERA_FAR = 180;

/**
 * Half-width of the interactive zone, in world units.
 *
 * The contract between gameplay and decoration: lanes, anchors, gifts and
 * hazards live inside it, and nothing decorative may enter. Level 1 enforces
 * the same split through `isClearOfCorridor`; this is level 2's equivalent,
 * and `tests/skyline-zone.test.ts` fails if dressing crosses it.
 */
export const GAME_ZONE_HALF = 4.4;
