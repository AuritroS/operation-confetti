import './tutorial.css';

export type ControlIcon = 'left' | 'right' | 'up' | 'down' | 'tap';

export interface TutorialControl {
  /** The gesture, drawn. One or more arrows, or a tap. */
  readonly icons: readonly ControlIcon[];
  /** What it does. One or two words — the arrow says the rest. */
  readonly label: string;
}

export interface TutorialCopy {
  /** Chapter line, e.g. "1 · THE GIFT HEIST". */
  readonly chapter: string;
  readonly controls: readonly TutorialControl[];
}

/** A chevron with a shaft, rotated per direction by CSS. */
const ARROW = '<path d="M12.5 6 L7 12 l5.5 6" /><path d="M7.4 12 H17.5" />';
const TAP = '<circle cx="12" cy="12" r="3.6" class="tutorial__tap-dot" />'
  + '<circle cx="12" cy="12" r="8.4" class="tutorial__tap-ring" />';

function glyph(icon: ControlIcon): string {
  const body = icon === 'tap' ? TAP : ARROW;
  return `<svg class="tutorial__icon tutorial__icon--${icon}" viewBox="0 0 24 24"`
    + ` aria-hidden="true">${body}</svg>`;
}

/**
 * How to play this level, over the level.
 *
 * Drawn, not written: a row of arrows reads faster than a sentence about
 * arrows, and it survives a player who is not reading carefully — which, on
 * a phone, at the start of a level, is most of them. Each gesture gets its
 * glyph and at most two words.
 *
 * It sits in the bottom third so the scene stays visible behind it: the
 * player can try the verbs against the real level while the sheet is up, and
 * nothing they do in that rehearsal scores or hurts. It is also the beat a
 * transition hands off to, which is where a slow level load hides.
 */
export class Tutorial {
  private readonly root = document.createElement('div');
  private readonly chapter = document.createElement('p');
  private readonly controls = document.createElement('div');
  private readonly start = document.createElement('button');
  private onStart: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root.className = 'tutorial';
    this.chapter.className = 'tutorial__chapter';
    this.controls.className = 'tutorial__controls';

    this.start.type = 'button';
    this.start.className = 'tutorial__start';
    this.start.textContent = "Let's go";
    this.start.addEventListener('click', () => {
      this.start.blur();
      this.onStart?.();
    });

    this.root.append(this.chapter, this.controls, this.start);
    this.root.hidden = true;
    container.append(this.root);
  }

  show(copy: TutorialCopy, onStart: () => void): void {
    this.chapter.textContent = copy.chapter;
    this.controls.replaceChildren(...copy.controls.map((control) => {
      const group = document.createElement('div');
      group.className = 'tutorial__control';
      group.innerHTML = `<span class="tutorial__icons">${control.icons.map(glyph).join('')}</span>`
        + `<span class="tutorial__label"></span>`;
      // Label as text, never markup: copy is content, not a template.
      group.querySelector('.tutorial__label')!.textContent = control.label;
      return group;
    }));
    this.onStart = onStart;
    this.root.hidden = false;
  }

  hide(): void {
    this.root.hidden = true;
    this.onStart = null;
  }

  get isOpen(): boolean { return !this.root.hidden; }

  dispose(): void { this.root.remove(); }
}
