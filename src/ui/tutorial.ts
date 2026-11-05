import './tutorial.css';

export interface TutorialCopy {
  /** Chapter line, e.g. "1 · THE GIFT HEIST". */
  readonly chapter: string;
  /** One short line per verb. Two or three; this is not documentation. */
  readonly verbs: readonly string[];
}

/**
 * How to play this level, over the level.
 *
 * One component for all three, because the thing being taught differs and the
 * shape of the teaching should not. It sits in the bottom third so the scene
 * stays visible behind it: the player can try the verbs against the real
 * level while the sheet is up, and nothing they do in that rehearsal scores
 * or hurts.
 *
 * It is also the beat a transition hands off to, which is where a slow level
 * load hides — the sheet is already on screen while the next level builds.
 */
export class Tutorial {
  private readonly root = document.createElement('div');
  private readonly chapter = document.createElement('p');
  private readonly verbs = document.createElement('ul');
  private readonly start = document.createElement('button');
  private onStart: (() => void) | null = null;

  constructor(container: HTMLElement) {
    this.root.className = 'tutorial';
    this.chapter.className = 'tutorial__chapter';
    this.verbs.className = 'tutorial__verbs';

    const free = document.createElement('p');
    free.className = 'tutorial__free';
    free.textContent = 'Try it out — nothing counts until you start.';

    this.start.type = 'button';
    this.start.className = 'tutorial__start';
    this.start.textContent = "Let's go";
    this.start.addEventListener('click', () => {
      this.start.blur();
      this.onStart?.();
    });

    this.root.append(this.chapter, this.verbs, free, this.start);
    this.root.hidden = true;
    container.append(this.root);
  }

  show(copy: TutorialCopy, onStart: () => void): void {
    this.chapter.textContent = copy.chapter;
    this.verbs.replaceChildren(...copy.verbs.map((verb) => {
      const item = document.createElement('li');
      item.textContent = verb;
      return item;
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
