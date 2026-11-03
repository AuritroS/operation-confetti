/** DOM HUD (design doc §3). No timer is ever displayed. */
export class Hud {
  private readonly stage = document.getElementById('hud-stage') as HTMLElement;
  private readonly score = document.getElementById('hud-score') as HTMLElement;
  private readonly gifts = document.getElementById('hud-gifts') as HTMLElement;
  private readonly progress = document.getElementById('hud-progress') as HTMLElement;

  setStage(n: number, of = 3): void {
    this.stage.textContent = `${n}/${of}`;
  }

  setScore(points: number): void {
    this.score.textContent = String(points);
  }

  setGifts(collected: number, total: number): void {
    this.gifts.textContent = `${collected} / ${total}`;
  }

  /** `t` is 0..1 route progress. */
  setProgress(t: number): void {
    this.progress.style.width = `${Math.round(Math.min(1, Math.max(0, t)) * 100)}%`;
  }
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
