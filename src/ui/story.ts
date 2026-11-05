import './story.css';
import { type StoryBeat, STORY_IMAGES, storyImageUrl } from '../story/script';

/**
 * The comic panel player.
 *
 * Plain DOM over the canvas rather than anything drawn in the scene: the
 * dialogue stays crisp at any size, it is selectable and translatable, and
 * the artwork is a single `<img>` the browser caches. Nothing auto-advances —
 * a panel waits for the player, which is also what makes it a safe place to
 * finish loading the level behind it.
 */
export class StoryPlayer {
  private readonly root = document.createElement('div');
  private readonly art = document.createElement('img');
  private readonly lines = document.createElement('div');
  private readonly next = document.createElement('button');
  private readonly skip = document.createElement('button');
  private resolve: ((skipped: boolean) => void) | null = null;

  constructor(container: HTMLElement) {
    this.root.className = 'story';
    this.art.className = 'story__art';
    this.art.alt = '';

    const foot = document.createElement('div');
    foot.className = 'story__foot';
    this.lines.className = 'story__lines';

    this.next.type = 'button';
    this.next.className = 'story__next';
    this.next.addEventListener('click', () => this.finish(false));

    this.skip.type = 'button';
    this.skip.className = 'story__skip';
    this.skip.textContent = 'Skip story';
    this.skip.addEventListener('click', () => this.finish(true));

    foot.append(this.lines, this.next);
    this.root.append(this.art, this.skip, foot);
    this.root.hidden = true;
    container.append(this.root);
  }

  /**
   * Show one beat and resolve when the player moves on.
   *
   * Resolves `true` if they skipped, so the caller can drop the rest of the
   * sequence rather than showing the next panel immediately after.
   */
  show(beat: StoryBeat): Promise<boolean> {
    this.art.src = storyImageUrl(beat.image);
    // A cover is letterboxed so its painted title survives; every other
    // panel fills the frame.
    this.art.className = beat.cover
      ? 'story__art story__art--fit'
      : `story__art story__art--${beat.focus}`;
    this.next.textContent = beat.next;
    this.skip.hidden = beat.cover === true;

    this.lines.replaceChildren(...beat.lines.map((line) => {
      const p = document.createElement('p');
      p.className = 'story__line';
      if (line.who) {
        const who = document.createElement('span');
        who.className = `story__who story__who--${line.who}`;
        who.textContent = line.who;
        p.append(who);
      }
      // Appended as text, never markup: copy is content, not a template.
      p.append(document.createTextNode(line.text));
      return p;
    }));

    this.root.hidden = false;
    return new Promise((resolve) => { this.resolve = resolve; });
  }

  private finish(skipped: boolean): void {
    this.root.hidden = true;
    const done = this.resolve;
    this.resolve = null;
    done?.(skipped);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  /**
   * Warm the browser cache.
   *
   * A panel that opens on an undecoded image flashes its background first,
   * and these are the only large files the campaign loads after boot.
   */
  static preload(): void {
    for (const image of STORY_IMAGES) {
      const img = new Image();
      img.decoding = 'async';
      img.src = storyImageUrl(image);
    }
  }

  dispose(): void { this.root.remove(); }
}
