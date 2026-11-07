import './speedlines.css';

/**
 * Comic speed lines at the screen's edges.
 *
 * A frame effect, like the reward glow and the hit vignette: thin lines
 * down the left and right edges fading toward the centre, streaming toward
 * the viewer, as strong as the level says. Drawn over the canvas rather
 * than in it, so they can never cross an obstacle or the gate, and they
 * cost no draw calls. Level 2 feeds its speed ramp in; nothing else does.
 */
export class SpeedLines {
  private readonly root = document.createElement('div');
  private shown = -1;

  constructor(container: HTMLElement) {
    this.root.className = 'speedlines';
    this.root.hidden = true;
    for (const side of ['left', 'right']) {
      const band = document.createElement('div');
      band.className = `speedlines__band speedlines__band--${side}`;
      this.root.append(band);
    }
    container.append(this.root);
  }

  /** `strength` 0..1. Below a sliver the overlay is hidden outright. */
  set(strength: number): void {
    const k = Math.max(0, Math.min(1, strength));
    const q = Math.round(k * 50) / 50;
    if (q === this.shown) return;
    this.shown = q;
    this.root.hidden = q < 0.02;
    this.root.style.setProperty('--speed', String(q));
  }

  dispose(): void { this.root.remove(); }
}
