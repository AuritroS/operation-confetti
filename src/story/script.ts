/**
 * The comic, as data.
 *
 * Every beat names an image, a camera move, who owns the moment, and its
 * lines. Copy lives here and nowhere else, so rewording a line never touches
 * code. `docs/STORY_PASS.md` is the storyboard this encodes.
 *
 * Images are referred to by a stable id. Where the id's artwork has not been
 * generated yet, `STORY_ART` points it at the nearest existing picture and
 * says so, which is what lets the whole comic be reviewed for flow before the
 * last panel is painted. Swapping a placeholder for the real thing is one
 * line in that table.
 */
export type StoryImage =
  | 'matthew'
  | 'aurora'
  | 'matthew-aurora'
  | 'vault'
  | 'chase'
  | 'rooftop'
  | 'win'
  | 'loss'
  | 'chase-bg'
  | 'chase-chars';

interface ArtSource {
  /** Basename under `/story/`, without extension. */
  readonly file: string;
  /** True while this id is served by another image's file. */
  readonly placeholder?: true;
}

/**
 * Which file carries each image.
 *
 * `matthew` has its title painted in, so it is only ever the cover. The
 * five generated panels were rendered at the phone's own aspect (832×1792),
 * so they are shown whole at zoom 1 and the camera only ever pushes in.
 * `matthew-aurora` is kept for the preload list and review; no beat uses it
 * since the rooftop got its own image with the cannon.
 */
export const STORY_ART: Record<StoryImage, ArtSource> = {
  matthew: { file: 'matthew' },
  aurora: { file: 'aurora' },
  'matthew-aurora': { file: 'matthew-aurora' },
  vault: { file: 'vault' },
  chase: { file: 'chase' },
  rooftop: { file: 'rooftop' },
  win: { file: 'win' },
  loss: { file: 'loss' },
  // The chase cut into depth layers: the street without him, and him alone
  // on a transparent ground, both edits of the chosen render.
  'chase-bg': { file: 'chase-bg' },
  'chase-chars': { file: 'chase-chars' },
};

/**
 * How a panel is framed.
 *
 * `zoom` of 1 shows the artwork fitted to the panel; above 1 it is enlarged
 * about `origin`. The origin has to sit *on* the subject, because scaling
 * holds that point still and pushes everything else outward — an origin
 * beside a face enlarges the face straight out of frame. Keep the origin a
 * little above a head rather than level with it, or the crown of the head
 * is the first thing the crop takes.
 */
export interface Framing {
  readonly zoom: number;
  /** CSS transform-origin: what the zoom closes in on. */
  readonly origin: string;
  /**
   * CSS object-position: which part of the picture sits in the window.
   *
   * A phone shows only about half of these images' width even at zoom 1,
   * so this is how a panel chooses the half. Omitted means centred.
   */
  readonly pan?: string;
}

export interface StoryLine {
  /** Omitted for a caption that nobody says. */
  readonly who?: 'MATTHEW' | 'AURORA';
  readonly text: string;
}

/** Whose moment a beat is. Colours the wipe into it. */
export type StoryOwner = 'matthew' | 'aurora';

export interface StoryBeat {
  readonly id: string;
  readonly image: StoryImage;
  /**
   * Two layers over one another, moving at different rates.
   *
   * Optional: a panel with no layers is a single plate. When present, the
   * `characters` image must have a transparent background and the same
   * composition as `image`, which is why both are edits of one chosen
   * render rather than two generations.
   */
  readonly layers?: { readonly background: StoryImage; readonly characters: StoryImage };
  /** Where the camera starts and where it settles, over the first seconds. */
  readonly from: Framing;
  readonly to: Framing;
  readonly owner: StoryOwner;
  readonly lines: readonly StoryLine[];
  /** Label on the continue button. */
  readonly next: string;
  /** A cover has no dialogue and no skip; it is the way in. */
  readonly cover?: boolean;
}

const WHOLE: Framing = { zoom: 1, origin: '50% 50%' };

export const BEATS = {
  title: {
    id: 'title',
    image: 'matthew',
    from: WHOLE,
    to: WHOLE,
    owner: 'matthew',
    lines: [],
    next: 'Start',
    cover: true,
  },
  intro: {
    id: 'intro',
    image: 'aurora',
    // Open on her face, then ease right until her and the cake share the
    // window. The cake sits in the picture's right fifth, which a phone's
    // narrow window never reaches from the centre.
    from: { zoom: 1.15, origin: '45% 32%', pan: '45% 40%' },
    to: { zoom: 1, origin: '50% 50%', pan: '74% 40%' },
    owner: 'aurora',
    lines: [
      { who: 'AURORA', text: 'Looking for your cake?' },
      { who: 'MATTHEW', text: "That's my birthday cake." },
      { who: 'AURORA', text: 'Your presents are in my vault. Come and get them.' },
    ],
    next: 'Next',
  },
  vault: {
    id: 'vault',
    image: 'vault',
    // Tight on his face at the door, pulling back to the whole city.
    from: { zoom: 1.3, origin: '42% 22%' },
    to: WHOLE,
    owner: 'matthew',
    lines: [
      { text: 'The vault opens on the city' },
      { who: 'MATTHEW', text: "Presents, check. She's already across town." },
      { who: 'AURORA', text: 'Keep up.' },
    ],
    next: 'Next',
  },
  chase: {
    id: 'chase',
    image: 'chase',
    layers: { background: 'chase-bg', characters: 'chase-chars' },
    // The whole street first, then a push in on him mid-swing.
    from: WHOLE,
    to: { zoom: 1.16, origin: '48% 22%' },
    owner: 'aurora',
    lines: [
      { text: 'A trail of presents' },
      { who: 'MATTHEW', text: "Fine. I'll take those too." },
    ],
    next: 'Next',
  },
  rooftop: {
    id: 'rooftop',
    image: 'rooftop',
    // Her and the cake first, then out to him and the cannon.
    from: { zoom: 1.35, origin: '72% 20%' },
    to: WHOLE,
    owner: 'aurora',
    lines: [
      { who: 'AURORA', text: 'You brought a party popper?' },
      { who: 'MATTHEW', text: 'Birthday equipment.' },
    ],
    next: 'Next',
  },
  win: {
    id: 'win',
    image: 'win',
    // In on the cake and their faces, then out to the whole confetti shower.
    from: { zoom: 1.4, origin: '52% 28%' },
    to: WHOLE,
    owner: 'matthew',
    lines: [
      { text: 'Cake recovered' },
      { who: 'AURORA', text: 'Save me a slice?' },
      { who: 'MATTHEW', text: "You're on cleanup." },
    ],
    next: 'Results',
  },
  loss: {
    id: 'loss',
    image: 'loss',
    // Follow her off the edge: wide, then up and in on her and the cake.
    from: WHOLE,
    to: { zoom: 1.22, origin: '58% 18%' },
    owner: 'aurora',
    lines: [
      { text: 'The cake remains at large' },
      { who: 'AURORA', text: "I'll save you a slice." },
      { who: 'MATTHEW', text: "You'd better." },
    ],
    next: 'Results',
  },
  // `satisfies` rather than an annotation: the shape is still checked, but
  // the keys stay concrete, so `BEATS.intro` is a beat and not a maybe.
} satisfies Record<string, StoryBeat>;

export type BeatId = keyof typeof BEATS;

/** The comic in reading order, for the review route. */
export const SEQUENCE: readonly StoryBeat[] = [
  BEATS.title, BEATS.intro, BEATS.vault, BEATS.chase, BEATS.rooftop, BEATS.win, BEATS.loss,
];

/** Every image the comic uses, for preloading. Shared files are fetched once. */
export const STORY_IMAGES: readonly StoryImage[] = Object.keys(STORY_ART) as StoryImage[];

export function storyImageUrl(image: StoryImage): string {
  return `/story/${STORY_ART[image].file}.webp`;
}
