/**
 * The player-facing HUD (design doc §3).
 *
 * Score and pause, nothing else. The doc also proposes gift count and route
 * progress; those moved to the debug panel on the view that a clean frame
 * reads better in one hand than a complete one, and that neither number
 * changes a decision mid-run. No timer is ever displayed, which the doc does
 * require.
 */
export class Hud {
  private readonly score = document.getElementById('hud-score') as HTMLElement | null;
  private readonly delta = document.getElementById('hud-delta') as HTMLElement | null;
  private readonly vignette = document.getElementById('vignette') as HTMLElement | null;
  private shown = -1;

  setScore(points: number): void {
    if (points === this.shown) return;
    this.shown = points;
    if (this.score) this.score.textContent = String(points);
  }

  showDelta(points: number): void {
    if (!this.delta) return;
    const isPositive = points > 0;
    this.delta.textContent = isPositive ? `+${points}` : `${points}`;
    this.delta.classList.remove('hud__delta--reward', 'hud__delta--penalty');
    this.delta.classList.add(isPositive ? 'hud__delta--reward' : 'hud__delta--penalty');
    restartAnimation(this.delta);
  }

  /**
   * Show what a hit cost.
   */
  showPenalty(points: number): void {
    this.showDelta(points);
    if (this.vignette) restartAnimation(this.vignette);
  }

  /**
   * Show what a gift collection awarded.
   */
  showReward(points: number): void {
    this.showDelta(points);
  }

  reset(): void {
    this.shown = -1;
    this.setScore(0);
    if (this.delta) this.delta.hidden = true;
    if (this.vignette) this.vignette.hidden = true;
  }
}

/** Re-run a CSS animation on an element that may already be showing. */
function restartAnimation(el: HTMLElement): void {
  el.hidden = true;
  // Reading offsetWidth forces a reflow, so the browser treats the next
  // frame as a fresh start rather than continuing the previous animation.
  void el.offsetWidth;
  el.hidden = false;
}

export class Overlay {
  private readonly el = document.getElementById('overlay') as HTMLElement;
  private readonly title = document.getElementById('overlay-title') as HTMLElement;
  private readonly body = document.getElementById('overlay-body') as HTMLElement;
  private readonly btn = document.getElementById('overlay-btn') as HTMLButtonElement;
  private onConfirm: (() => void) | null = null;

  constructor() {
    this.btn.addEventListener('click', () => {
      const fn = this.onConfirm;
      this.hide();
      fn?.();
    });
  }

  show(title: string, body: string, buttonLabel: string, onConfirm: () => void): void {
    this.title.textContent = title;
    // Display names and story copy render as plain text, never HTML (§8).
    this.body.textContent = body;
    this.btn.textContent = buttonLabel;
    this.onConfirm = onConfirm;
    this.el.hidden = false;
  }

  hide(): void {
    this.el.hidden = true;
    this.onConfirm = null;
  }

  get isVisible(): boolean {
    return !this.el.hidden;
  }
}

/**
 * Developer readout. Everything the HUD no longer shows lives here, so the
 * information is still one key away without crowding the player's frame.
 */
export class DebugPanel {
  private readonly el = document.getElementById('debug') as HTMLElement;

  set(lines: Record<string, string | number>): void {
    this.el.textContent = Object.entries(lines)
      .map(([k, v]) => `${k.padEnd(9)} ${v}`)
      .join('\n');
  }

  setVisible(v: boolean): void {
    this.el.hidden = !v;
  }
}
