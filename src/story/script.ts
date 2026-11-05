/**
 * The comic, as data.
 *
 * Three images carry every beat, so reuse is carried by *framing and copy*
 * rather than by pretending two screens are different pictures: `focus`
 * shifts which part of the artwork the panel is cropped to, which is the
 * storyboard's "restrained pan and zoom" done in CSS.
 *
 * `matthew` has its title baked into the artwork, so it can only ever be the
 * cover — dropping it into a later beat would put "THE BIRTHDAY HERO" over a
 * moment that is not about that.
 *
 * Copy lives here and nowhere else, so rewording a line never touches code.
 */
export type StoryImage = 'matthew' | 'aurora' | 'matthew-aurora';

/** Which part of the artwork fills the frame. Maps to CSS object-position. */
export type Focus = 'centre' | 'left' | 'right' | 'top';

export interface StoryLine {
  /** Omitted for a caption that nobody says. */
  readonly who?: 'MATTHEW' | 'AURORA';
  readonly text: string;
}

export interface StoryBeat {
  readonly id: string;
  readonly image: StoryImage;
  readonly focus: Focus;
  readonly lines: readonly StoryLine[];
  /** Label on the continue button. */
  readonly next: string;
  /** A cover has no dialogue and no skip; it is the way in. */
  readonly cover?: boolean;
}

export const BEATS = {
  title: {
    id: 'title',
    image: 'matthew',
    focus: 'centre',
    lines: [],
    next: 'Start',
    cover: true,
  },
  intro: {
    id: 'intro',
    image: 'aurora',
    focus: 'centre',
    lines: [
      { who: 'AURORA', text: 'Looking for your cake?' },
      { who: 'MATTHEW', text: "That's my birthday cake." },
      { who: 'AURORA', text: 'Then come get it.' },
    ],
    next: 'Next',
  },
  vault: {
    id: 'vault',
    image: 'matthew-aurora',
    focus: 'left',
    lines: [
      { who: 'MATTHEW', text: 'Okay. These are good presents.' },
      { who: 'AURORA', text: 'Keep up.' },
    ],
    next: 'Next',
  },
  rooftop: {
    id: 'rooftop',
    image: 'matthew-aurora',
    focus: 'centre',
    lines: [
      { who: 'AURORA', text: 'You brought a party popper?' },
      { who: 'MATTHEW', text: 'Birthday equipment.' },
    ],
    next: 'Next',
  },
  win: {
    id: 'win',
    image: 'matthew-aurora',
    focus: 'right',
    lines: [
      { who: 'AURORA', text: 'Save me a slice?' },
      { who: 'MATTHEW', text: "You're on cleanup." },
    ],
    next: 'Results',
  },
  loss: {
    id: 'loss',
    image: 'aurora',
    focus: 'top',
    lines: [
      { who: 'AURORA', text: "I'll save you a slice." },
      { who: 'MATTHEW', text: "You'd better." },
    ],
    next: 'Results',
  },
  // `satisfies` rather than an annotation: the shape is still checked, but
  // the keys stay concrete, so `BEATS.intro` is a beat and not a maybe.
} satisfies Record<string, StoryBeat>;

/** Every image the comic uses, for preloading. */
export const STORY_IMAGES: readonly StoryImage[] = ['matthew', 'aurora', 'matthew-aurora'];

export type BeatId = keyof typeof BEATS;

export function storyImageUrl(image: StoryImage): string {
  return `/story/${image}.webp`;
}
