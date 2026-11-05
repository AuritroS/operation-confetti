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

/**
 * How a panel is framed.
 *
 * `zoom` of 1 shows the artwork fitted to the panel; above 1 it is enlarged
 * about `origin`. The origin has to sit *on* the subject, because scaling
 * holds that point still and pushes everything else outward — an origin
 * beside a face enlarges the face straight out of frame. Keep the origin a
 * little above a head rather than level with it, or the crown of the head
 * is the first thing the crop takes. Positioning alone was not enough:
 * the panel frame is close to the illustrations' own aspect, so there was
 * barely any overflow to pan within and every reframing of the two-shot came
 * out looking like the same picture. Enlarging first is what creates the room
 * to move, which is what makes one image read as three moments.
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

export interface StoryBeat {
  readonly id: string;
  readonly image: StoryImage;
  readonly framing: Framing;
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
    framing: { zoom: 1, origin: '50% 50%' },
    lines: [],
    next: 'Start',
    cover: true,
  },
  intro: {
    id: 'intro',
    image: 'aurora',
    // Her whole taunt: crown, cake and the hand reaching for the camera.
    framing: { zoom: 1, origin: '50% 50%' },
    lines: [
      { who: 'AURORA', text: 'Looking for your cake?' },
      { who: 'MATTHEW', text: "That's my birthday cake." },
      { who: 'AURORA', text: 'Then come get it.' },
    ],
    next: 'Next',
  },
  chase: {
    id: 'chase',
    /*
     * The cover art, serving a second beat.
     *
     * This was the rooftop two-shot, which put Aurora at his shoulder while
     * she says "keep up" from a distance — the picture argued with the line.
     * Here he is mid-grapple, using the present he has just found, and she
     * is off-panel, which is what "distant" means.
     *
     * The zoom is doing real work: it crops the painted title out of frame
     * so the image can be used away from the cover. The title sits to the
     * right of his head, so holding the frame left of it is what removes it.
     */
    image: 'matthew',
    framing: { zoom: 1.7, origin: '28% 33%' },
    lines: [
      { who: 'MATTHEW', text: 'Okay. These are good presents.' },
      { who: 'AURORA', text: 'Keep up.' },
    ],
    next: 'Next',
  },
  rooftop: {
    id: 'rooftop',
    image: 'matthew-aurora',
    // Both of them, which is the whole point of the confrontation.
    framing: { zoom: 1, origin: '50% 50%' },
    lines: [
      { who: 'AURORA', text: 'You brought a party popper?' },
      { who: 'MATTHEW', text: 'Birthday equipment.' },
    ],
    next: 'Next',
  },
  win: {
    id: 'win',
    image: 'matthew-aurora',
    // In on her and the cake, with Matthew's reach just out of frame.
    framing: { zoom: 1.45, origin: '33% 28%' },
    lines: [
      { who: 'AURORA', text: 'Save me a slice?' },
      { who: 'MATTHEW', text: "You're on cleanup." },
    ],
    next: 'Results',
  },
  loss: {
    id: 'loss',
    image: 'aurora',
    // Her and the cake, close. The intro uses this artwork wide, so the
    // ending has to be a different distance or it reads as a repeat.
    framing: { zoom: 1.55, origin: '70% 26%' },
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
