/**
 * Pause / resume lifecycle (design doc §9).
 *
 * Backgrounding, focus loss and landscape orientation all pause the
 * simulation, clear held inputs and freeze cooldowns. Time spent away is
 * never simulated as catch-up — the loop clears its accumulator on stop.
 */

export type PauseReason = 'user' | 'hidden' | 'blur' | 'orientation';

export interface LifecycleHooks {
  onPause(reason: PauseReason): void;
  onResumeRequested(reason: PauseReason): void;
  onOrientation(isLandscape: boolean): void;
}

export class Lifecycle {
  private reasons = new Set<PauseReason>();
  private attached = false;

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
    window.addEventListener('blur', this.onBlur);
    window.addEventListener('pagehide', this.onBlur);
    this.landscapeQuery.addEventListener('change', this.onOrientationChange);
    this.onOrientationChange();
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
   * Clear a pause reason. Resume is explicit: the caller still has to restart
   * the loop after the resume countdown, and level 2 requires a fresh hold.
   */
  clear(reason: PauseReason): void {
    if (!this.reasons.delete(reason)) return;
    if (!this.isPaused) this.hooks.onResumeRequested(reason);
  }

  private readonly landscapeQuery = window.matchMedia(
    '(orientation: landscape) and (max-height: 540px)',
  );

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
