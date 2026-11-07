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
  | 'loss';

interface ArtSource {
  /** Basename under `/story/`, without extension. */
  readonly file: string;
  /** True while this id is served by another image's file. */
  readonly placeholder?: true;
}

/**
 * Which file carries each image.
 *
 * `matthew` has its title painted in, so it is only ever the cover. `chase`
 * is the 7 Nov probe render at low quality, standing in until the final is
 * chosen. The other new panels borrow the closest existing art so the
 * sequence can be walked end to end.
 */
export const STORY_ART: Record<StoryImage, ArtSource> = {
  matthew: { file: 'matthew' },
  aurora: { file: 'aurora' },
  'matthew-aurora': { file: 'matthew-aurora' },
  vault: { file: 'matthew', placeholder: true },
  chase: { file: 'chase', placeholder: true },
  rooftop: { file: 'matthew-aurora', placeholder: true },
  win: { file: 'matthew-aurora', placeholder: true },
  loss: { file: 'aurora', placeholder: true },
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
    // Her whole taunt first, then in on her and the cake.
    from: WHOLE,
    to: { zoom: 1.25, origin: '62% 30%' },
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
    // Tight on the open door, pulling back to the city beyond it. While the
    // cover art stands in, the zoom also keeps its painted title out of frame.
    from: { zoom: 1.7, origin: '28% 38%' },
    to: { zoom: 1.45, origin: '30% 45%' },
    owner: 'matthew',
    lines: [
      { text: 'The vault opens on the whole city.' },
      { who: 'MATTHEW', text: "Presents, check. She's already across town." },
      { who: 'AURORA', text: 'Keep up.' },
    ],
    next: 'Next',
  },
  chase: {
    id: 'chase',
    image: 'chase',
    // The street first, then in on him mid-swing.
    from: WHOLE,
    to: { zoom: 1.35, origin: '45% 28%' },
    owner: 'aurora',
    lines: [
      { text: 'She is dropping presents as she runs.' },
      { who: 'MATTHEW', text: "Fine. I'll take those too." },
    ],
    next: 'Next',
  },
  rooftop: {
    id: 'rooftop',
    image: 'rooftop',
    // Her and the cake, then a pan across to him and the cannon.
    from: { zoom: 1.15, origin: '70% 25%' },
    to: { zoom: 1.15, origin: '30% 55%' },
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
    // In on the cake, then out to the whole confetti shower.
    from: { zoom: 1.45, origin: '66% 26%' },
    to: { zoom: 1.1, origin: '50% 40%' },
    owner: 'matthew',
    lines: [
      { text: 'Cake recovered.' },
      { who: 'AURORA', text: 'Save me a slice?' },
      { who: 'MATTHEW', text: "You're on cleanup." },
    ],
    next: 'Results',
  },
  loss: {
    id: 'loss',
    image: 'loss',
    // Follow her off the edge: wide, then in on her and the cake.
    from: WHOLE,
    to: { zoom: 1.38, origin: '66% 36%' },
    owner: 'aurora',
    lines: [
      { text: 'The cake remains at large.' },
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
