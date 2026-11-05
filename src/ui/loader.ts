import './loader.css';

/**
 * The boot progress screen.
 *
 * Deliberately dumb: it is handed a fraction and shows it. The decision about
 * what is being loaded belongs to `assets/preload.ts`, and the decision about
 * when the game may start belongs to the campaign — a progress bar that also
 * owns the sequencing is the kind of thing that ends up gating a level on a
 * decorative texture.
 */
export class LoadingScreen {
  private readonly root = document.createElement('div');
  private readonly track = document.createElement('div');
  private readonly bar = document.createElement('div');
  private readonly note = document.createElement('p');

  constructor(container: HTMLElement) {
    this.root.className = 'loading';

    const title = document.createElement('p');
    title.className = 'loading__title';
    title.textContent = 'Operation Confetti';

    this.track.className = 'loading__track';
    this.track.setAttribute('role', 'progressbar');
    this.track.setAttribute('aria-valuemin', '0');
    this.track.setAttribute('aria-valuemax', '100');
    this.bar.className = 'loading__bar';
    this.track.append(this.bar);

    this.note.className = 'loading__note';
    this.note.textContent = 'Loading…';

    this.root.append(title, this.track, this.note);
    container.append(this.root);
  }

  /** `fraction` is 0..1. */
  set(fraction: number): void {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    this.bar.style.width = `${pct}%`;
    this.track.setAttribute('aria-valuenow', String(pct));
    this.note.textContent = pct >= 100 ? 'Ready' : `Loading… ${pct}%`;
  }

  /**
   * Say that some assets are missing, without blocking the game.
   *
   * Worth showing rather than only logging: it is the difference between "the
   * game looks wrong" and "the game told me three models were missing", and
   * at a party nobody is reading a console.
   */
  warn(count: number): void {
    this.note.textContent = `Ready · ${count} asset${count === 1 ? '' : 's'} unavailable`;
  }

  hide(): void { this.root.hidden = true; }

  dispose(): void { this.root.remove(); }
}
