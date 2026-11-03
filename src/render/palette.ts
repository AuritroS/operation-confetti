/**
 * The project palette (design doc §10).
 *
 * Every colour traces to `assets/matthew.png` or `assets/aurora.png` — the
 * supplied reference art — rather than being invented, so the 3D, the UI and
 * the story panels cannot drift apart. Extracted by colour-quantising both
 * images and taking the dominant values.
 *
 * `src/styles.css` mirrors these as CSS custom properties. A test asserts the
 * two stay in sync, because a silent divergence between the HUD and the world
 * is exactly the kind of thing nobody notices until it looks wrong.
 *
 * The colour language, which carries narrative meaning rather than just
 * convention:
 *
 *   BLUE is Matthew's — collectibles, anything to take.
 *   MAGENTA is Aurora's — every hazard, every attack, her magic and her
 *   guards' searchlights. One colour, one meaning, all three levels.
 */

export const PALETTE = {
  /** Night sky base and deepest shadow. From matthew.png. */
  ink: 0x18101a,
  /** Matthew's body, rooftop surfaces. */
  navyDeep: 0x1b275c,
  /** Building silhouettes. */
  navy: 0x12368f,
  /** Lane dividers, UI accent. */
  blue: 0x234ca8,
  /** Collectible sparkle. The "take it" signal. */
  blueLight: 0x6295e1,
  /** All trim, the grapple cable, the mask emblem, confetti. */
  gold: 0xeaac5b,
  /** Aurora's robe. From aurora.png. */
  purpleDeep: 0x5c175c,
  /** Every hazard and all of Aurora's magic. The "avoid it" signal. */
  magenta: 0xcc29c3,
  /** Window lights. What makes the skyline read as warm rather than grey. */
  orangeWarm: 0xf29e59,
  /** Neon accents. */
  cyan: 0x53a6f9,

  /**
   * Muted environment tones, desaturated out of navyDeep.
   *
   * The doc asks for a muted blue/slate environment with a saturated
   * character (§10), and the first build ignored it: the floor, the lane
   * dividers and Matthew were all saturated blue at nearly the same
   * luminance, so he had no silhouette at all. These sit well below the
   * character in both saturation and value so he reads against them.
   */
  slate: 0x1a1f2e,
  slateLine: 0x2b3450,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/** `#rrggbb` form, for CSS and for the recolour recipes. */
export function hex(key: PaletteKey): string {
  return `#${PALETTE[key].toString(16).padStart(6, '0')}`;
}

/**
 * Semantic roles, so gameplay code asks for "the hazard colour" rather than
 * naming a hue. Changing the language then means editing one line here.
 */
export const ROLE = {
  collectible: PALETTE.blueLight,
  hazard: PALETTE.magenta,
  auroraMagic: PALETTE.magenta,
  trim: PALETTE.gold,
  skyTop: PALETTE.ink,
  skyBottom: PALETTE.navyDeep,
  ground: PALETTE.slate,
  laneDivider: PALETTE.slateLine,
  windowLight: PALETTE.orangeWarm,
  neon: PALETTE.cyan,
} as const;
