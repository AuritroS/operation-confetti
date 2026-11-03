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
  private readonly score = document.getElementById('hud-score') as HTMLElement;
  private readonly delta = document.getElementById('hud-delta') as HTMLElement;
  private readonly vignette = document.getElementById('vignette') as HTMLElement;
  private shown = 0;

  setScore(points: number): void {
    if (points === this.shown) return;
    this.shown = points;
    this.score.textContent = String(points);
  }

  /**
   * Show what a hit cost, and pulse the screen edge.
   *
   * Without this the score simply drops and nothing connects the number to
   * the cause. Re-triggering restarts both animations, which is why each
   * element is removed from the flow and re-added rather than just having a
   * class toggled.
   */
  showPenalty(points: number): void {
    this.delta.textContent = `${points}`;
    restartAnimation(this.delta);
    restartAnimation(this.vignette);
  }

  reset(): void {
    this.shown = -1;
    this.setScore(0);
    this.delta.hidden = true;
    this.vignette.hidden = true;
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
