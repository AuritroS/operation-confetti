/**
 * Pause / resume lifecycle (design doc §9).
 *
 * Backgrounding, focus loss and landscape orientation pause the simulation,
 * clear held inputs and freeze cooldowns. Time spent away is never simulated
 * as catch-up — the loop clears its accumulator on stop.
 *
 * Desktop divergence, deliberate: the spec's focus-loss and portrait rules
 * exist for phone app-switching and rotation. On a fine-pointer device both
 * misfire during development — clicking devtools blurs the window, and a short
 * browser window matches the landscape query — so blur-pause and the portrait
 * gate are limited to coarse-pointer devices. Tab-hide still pauses
 * everywhere, which is what actually matters for correctness.
 */

export type PauseReason = 'user' | 'hidden' | 'blur' | 'orientation';

export interface LifecycleHooks {
  onPause(reason: PauseReason): void;
  onResumeRequested(reason: PauseReason): void;
  onOrientation(isLandscape: boolean): void;
}

/** True on phones and tablets; false for mouse/trackpad. */
export function isTouchDevice(): boolean {
  return window.matchMedia('(pointer: coarse)').matches;
}

export class Lifecycle {
  private reasons = new Set<PauseReason>();
  private attached = false;
  private readonly touch = isTouchDevice();

  private readonly landscapeQuery = window.matchMedia(
    '(orientation: landscape) and (max-height: 540px)',
  );

  constructor(private readonly hooks: LifecycleHooks) {}

  get isPaused(): boolean {
    return this.reasons.size > 0;
  }

  get pauseReasons(): readonly PauseReason[] {
    return [...this.reasons];
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;

    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.touch) {
      window.addEventListener('blur', this.onBlur);
      window.addEventListener('pagehide', this.onBlur);
      this.landscapeQuery.addEventListener('change', this.onOrientationChange);
      this.onOrientationChange();
    } else {
      // Desktop is portrait-agnostic for development; never show the prompt.
      this.hooks.onOrientation(false);
    }
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    document.removeEventListener('visibilitychange', this.onVisibility);
    window.removeEventListener('blur', this.onBlur);
    window.removeEventListener('pagehide', this.onBlur);
    this.landscapeQuery.removeEventListener('change', this.onOrientationChange);
    this.reasons.clear();
  }

  pause(reason: PauseReason): void {
    const wasPaused = this.isPaused;
    this.reasons.add(reason);
    if (!wasPaused) this.hooks.onPause(reason);
  }

  /**
   * Clear a pause reason. Resume stays explicit: the caller restarts the loop
   * after its countdown, and level 2 requires a fresh hold.
   */
  clear(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    if (!this.isPaused) this.hooks.onResumeRequested(reason);
  }

  toggleUserPause(): void {
    if (this.reasons.has('user')) this.clear('user');
    else this.pause('user');
  }

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') this.pause('hidden');
    else this.clear('hidden');
  };

  private readonly onBlur = (): void => {
    this.pause('blur');
  };

  private readonly onOrientationChange = (): void => {
    const landscape = this.landscapeQuery.matches;
    this.hooks.onOrientation(landscape);
    if (landscape) this.pause('orientation');
    else this.clear('orientation');
  };
}
