import './hud.css';
/**
 * The player-facing HUD (design doc §3).
 *
 * Score and pause, nothing else. The doc also proposes gift count and route
 * progress; those moved to the debug panel on the view that a clean frame
 * reads better in one hand than a complete one, and that neither number
 * changes a decision mid-run. No timer is ever displayed, which the doc does
 * require.
 */
const PRESENT =
  '<rect x="4" y="10" width="16" height="11" rx="1.5" class="hud__gift-box"/>'
  + '<rect x="3" y="7" width="18" height="4" rx="1" class="hud__gift-lid"/>'
  + '<rect x="10.5" y="7" width="3" height="14" class="hud__gift-ribbon"/>'
  + '<path d="M12 7c-2-3-5-3-5-1s3 1.5 5 1zm0 0c2-3 5-3 5-1s-3 1.5-5 1z" class="hud__gift-bow"/>';

export class Hud {
  private readonly root = document.getElementById('hud') as HTMLElement | null;
  private readonly score = document.getElementById('hud-score') as HTMLElement | null;
  private readonly delta = document.getElementById('hud-delta') as HTMLElement | null;
  private readonly vignette = document.getElementById('vignette') as HTMLElement | null;
  /** Gold edge glow on a reward. Built here so every page with a HUD has it. */
  private readonly glow: HTMLElement | null;
  /** The four presents of the level, filling in gold as they are taken. */
  private readonly gifts: HTMLElement | null;
  private readonly giftGlyphs: HTMLElement[] = [];
  private shown = -1;

  constructor() {
    const stage = this.root?.parentElement ?? null;
    if (stage) {
      this.glow = document.createElement('div');
      this.glow.className = 'hud__glow';
      this.glow.hidden = true;
      stage.append(this.glow);
    } else {
      this.glow = null;
    }
    const stats = this.root?.querySelector('.hud__stats') ?? null;
    if (stats) {
      this.gifts = document.createElement('div');
      this.gifts.className = 'hud__gifts';
      this.gifts.setAttribute('role', 'img');
      this.gifts.setAttribute('aria-label', 'Presents collected');
      for (let i = 0; i < 4; i++) {
        const g = document.createElement('span');
        g.className = 'hud__gift';
        g.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${PRESENT}</svg>`;
        this.gifts.append(g);
        this.giftGlyphs.push(g);
      }
      this.gifts.hidden = true;
      stats.append(this.gifts);
    } else {
      this.gifts = null;
    }
  }

  /**
   * How many of the level's four presents are taken, and whether the row is
   * shown at all. Levels 1 and 2 route the player past gifts, so the row is
   * a map of what is left; the boss fight has its own readouts and hides it.
   */
  setGifts(taken: number, visible = true): void {
    if (!this.gifts) return;
    this.gifts.hidden = !visible;
    this.giftGlyphs.forEach((g, i) => {
      const was = g.classList.contains('hud__gift--taken');
      const now = i < taken;
      g.classList.toggle('hud__gift--taken', now);
      if (now && !was) restartAnimation(g);
    });
  }

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
    if (this.glow) restartAnimation(this.glow);
  }

  /**
   * Show or hide the whole readout.
   *
   * Used at the end of a run: the live score is about a run in progress,
   * and leaving it on screen under a results card states something that
   * is no longer true.
   */
  setVisible(visible: boolean): void {
    if (this.root) this.root.hidden = !visible;
  }

  reset(): void {
    this.shown = -1;
    this.setScore(0);
    if (this.delta) this.delta.hidden = true;
    if (this.vignette) this.vignette.hidden = true;
    if (this.glow) this.glow.hidden = true;
    this.setGifts(0, this.gifts ? !this.gifts.hidden : false);
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
