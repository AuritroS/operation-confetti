import './loader.css';
import { storyImageUrl } from '../story/script';

/**
 * The boot progress screen: the comic's inside cover.
 *
 * Deliberately dumb: it is handed a fraction and shows it. The decision about
 * what is being loaded belongs to `assets/preload.ts`, and the decision about
 * when the game may start belongs to the campaign — a progress bar that also
 * owns the sequencing is the kind of thing that ends up gating a level on a
 * decorative texture.
 *
 * The cover art sits dimmed behind the bar so the wait already looks like
 * the game, and so the first image the player sees is the same one the cover
 * then shows at full strength.
 */
export class LoadingScreen {
  private readonly root = document.createElement('div');
  private readonly track = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly note = document.createElement('p');

  constructor(container: HTMLElement) {
    this.root.className = 'loading halftone';
    this.root.style.setProperty('--cover', `url("${storyImageUrl('matthew')}")`);

    const card = document.createElement('div');
    card.className = 'loading__card frame';

    const issue = document.createElement('p');
    issue.className = 'eyebrow';
    issue.textContent = 'Issue #27';

    const title = document.createElement('h1');
    title.className = 'headline loading__title';
    title.append('Operation', document.createElement('br'), 'Confetti');

    this.track.className = 'loading__track';
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.bar.className = 'loading__bar';
    this.track.append(this.bar);

    this.note.className = 'loading__note';
    this.note.textContent = 'Loading…';

    card.append(issue, title, this.track, this.note);
    this.root.append(card);
    container.append(this.root);
  }

  /** `fraction` is 0..1. */
  set(fraction: number): void {
    const pct = Math.round(Math.max(0, Math.min(1, fraction)) * 100);
    this.bar.style.width = `${pct}%`;
    this.track.setAttribute('aria-valuenow', String(pct));
    this.note.textContent = pct < 100 ? `Loading… ${pct}%` : 'Ready';
  }

  /**
   * Note that some files did not arrive.
   *
   * Said once and quietly: every consumer falls back to a primitive, so the
   * game still plays, and a wall of red over a party game would be the
   * worse outcome.
   */
  warn(count: number): void {
    this.note.textContent = `${count} file${count === 1 ? '' : 's'} could not be loaded. Playing anyway.`;
  }

  hide(): void { this.root.hidden = true; }

  get isOpen(): boolean { return !this.root.hidden; }

  dispose(): void { this.root.remove(); }
}
