/**
 * Gesture recogniser (design doc §4).
 *
 * Rules implemented here:
 *  - A horizontal swipe fires once per gesture, as soon as the threshold is
 *    crossed, and reports exactly one lane of movement.
 *  - A tap fires on release, only if the pointer barely moved and was quick.
 *  - A swipe cancels the tap for that gesture.
 *  - Ambiguous gestures (slow, mostly vertical, below threshold) do nothing.
 *  - One active gameplay pointer. Secondary touches are ignored entirely.
 *  - Hold/release is reported separately for the level 2 grapple.
 */

export type Gesture =
  | { type: 'swipe'; dir: -1 | 1 }
  | { type: 'tap' }
  | { type: 'holdStart' }
  | { type: 'holdEnd'; heldMs: number }
  | { type: 'holdCancel' }
  /** Keyboard-only convenience commands. Never produced by touch. */
  | { type: 'pauseToggle' }
  | { type: 'restart' };

export type GestureHandler = (g: Gesture) => void;

export interface RecogniserConfig {
  /** Minimum travel in CSS pixels before a swipe is recognised. */
  swipePx: number;
  /** Require |dx| >= swipeRatio * |dy| so vertical drags do not steer lanes. */
  swipeRatio: number;
  /** A tap may not move more than this many CSS pixels. */
  tapMaxPx: number;
  /** A tap may not last longer than this many milliseconds. */
  tapMaxMs: number;
}

export const DEFAULT_RECOGNISER: RecogniserConfig = {
  swipePx: 24,
  swipeRatio: 1.5,
  tapMaxPx: 12,
  tapMaxMs: 250,
};

type Resolution = 'pending' | 'swiped' | 'void';

interface ActivePointer {
  id: number;
  startX: number;
  startY: number;
  startT: number;
  resolution: Resolution;
}

export class InputRecogniser {
  private active: ActivePointer | null = null;
  private handler: GestureHandler = () => {};
  private enabled = true;
  private keyHeldSince: number | null = null;
  private readonly cfg: RecogniserConfig;
  private attached = false;

  constructor(
    private readonly surface: HTMLElement,
    config: Partial<RecogniserConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_RECOGNISER, ...config };
  }

  onGesture(handler: GestureHandler): void {
    this.handler = handler;
  }

  /** While disabled, all input is dropped and held state is cleared. */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) this.clearHeld();
  }

  /** Drop any in-flight gesture. Used on pause, focus loss and state changes. */
  clearHeld(): void {
    if (this.active) {
      this.active = null;
      this.handler({ type: 'holdCancel' });
    }
    if (this.keyHeldSince !== null) {
      this.keyHeldSince = null;
      this.handler({ type: 'holdCancel' });
    }
  }

  attach(): void {
    if (this.attached) return;
    this.attached = true;
    this.surface.addEventListener('pointerdown', this.onDown);
    this.surface.addEventListener('pointermove', this.onMove);
    this.surface.addEventListener('pointerup', this.onUp);
    this.surface.addEventListener('pointercancel', this.onCancel);
    this.surface.addEventListener('lostpointercapture', this.onCancel);
    // Belt and braces for iOS Safari double-tap zoom and long-press menus.
    this.surface.addEventListener('contextmenu', preventDefault);
    this.surface.addEventListener('dblclick', preventDefault);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached = false;
    this.surface.removeEventListener('pointerdown', this.onDown);
    this.surface.removeEventListener('pointermove', this.onMove);
    this.surface.removeEventListener('pointerup', this.onUp);
    this.surface.removeEventListener('pointercancel', this.onCancel);
    this.surface.removeEventListener('lostpointercapture', this.onCancel);
    this.surface.removeEventListener('contextmenu', preventDefault);
    this.surface.removeEventListener('dblclick', preventDefault);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.active = null;
    this.keyHeldSince = null;
  }

  // ---- pointer ---------------------------------------------------------

  private readonly onDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    // Exactly one gameplay pointer: a second finger must not shoot or steer.
    if (this.active) return;
    e.preventDefault();
    this.active = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startT: e.timeStamp,
      resolution: 'pending',
    };
    try {
      this.surface.setPointerCapture(e.pointerId);
    } catch {
      /* capture is an optimisation, not a requirement */
    }
    this.handler({ type: 'holdStart' });
  };

  private readonly onMove = (e: PointerEvent): void => {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    if (a.resolution !== 'pending') return;

    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;

    if (Math.abs(dx) >= this.cfg.swipePx && Math.abs(dx) >= this.cfg.swipeRatio * Math.abs(dy)) {
      a.resolution = 'swiped';
      this.handler({ type: 'swipe', dir: dx > 0 ? 1 : -1 });
    }
  };

  private readonly onUp = (e: PointerEvent): void => {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    e.preventDefault();
    this.active = null;
    this.release(e.pointerId);

    const dx = e.clientX - a.startX;
    const dy = e.clientY - a.startY;
    const dist = Math.hypot(dx, dy);
    const heldMs = e.timeStamp - a.startT;

    // A swipe consumed this gesture, so no tap is emitted.
    if (a.resolution === 'pending' && dist <= this.cfg.tapMaxPx && heldMs <= this.cfg.tapMaxMs) {
      this.handler({ type: 'tap' });
    }

    this.handler({ type: 'holdEnd', heldMs });
  };

  private readonly onCancel = (e: PointerEvent): void => {
    const a = this.active;
    if (!a || a.id !== e.pointerId) return;
    this.active = null;
    this.release(e.pointerId);
    this.handler({ type: 'holdCancel' });
  };

  private release(id: number): void {
    try {
      if (this.surface.hasPointerCapture(id)) this.surface.releasePointerCapture(id);
    } catch {
      /* already released */
    }
  }

  // ---- keyboard (desktop controls) -------------------------------------
  //
  // Lane movement: ArrowLeft/ArrowRight or A/D.
  // Tap and hold:  Space (short press is a tap, long press is a hold).
  // Convenience:   P or Escape to pause, R to restart.
  //
  // W and S are accepted as part of the WASD cluster but intentionally do
  // nothing: there is no forward or backward axis in any level, so binding
  // them would imply movement the simulation does not have.

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    // Never steal keys from a text field such as the name entry.
    if (isTypingTarget(e.target)) return;

    switch (e.code) {
      case 'KeyP':
      case 'Escape':
        // Pause must work while input is disabled, so it is handled first.
        if (e.repeat) return;
        e.preventDefault();
        this.handler({ type: 'pauseToggle' });
        return;
      case 'KeyR':
        if (e.repeat) return;
        e.preventDefault();
        this.handler({ type: 'restart' });
        return;
      default:
        break;
    }

    if (!this.enabled) return;
    // Ignore auto-repeat so one physical press is one action.
    if (e.repeat) return;

    switch (e.code) {
      case 'ArrowLeft':
      case 'KeyA':
        e.preventDefault();
        this.handler({ type: 'swipe', dir: -1 });
        break;
      case 'ArrowRight':
      case 'KeyD':
        e.preventDefault();
        this.handler({ type: 'swipe', dir: 1 });
        break;
      case 'Space':
        // Swallow Space unconditionally: it would otherwise scroll the page
        // or re-activate whichever button last had focus.
        e.preventDefault();
        if (this.keyHeldSince === null) {
          this.keyHeldSince = e.timeStamp;
          this.handler({ type: 'holdStart' });
        }
        break;
      case 'KeyW':
      case 'KeyS':
      case 'ArrowUp':
      case 'ArrowDown':
        // Claimed so the page cannot scroll, but deliberately inert.
        e.preventDefault();
        break;
      default:
        break;
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (e.code !== 'Space') return;
    if (isTypingTarget(e.target)) return;
    if (this.keyHeldSince === null) return;
    e.preventDefault();
    const heldMs = e.timeStamp - this.keyHeldSince;
    this.keyHeldSince = null;
    // Mirror the pointer rule: a short press is a tap, a long one a hold.
    if (heldMs <= this.cfg.tapMaxMs) this.handler({ type: 'tap' });
    this.handler({ type: 'holdEnd', heldMs });
  };
}

/** True when the event targets a text input, so gameplay keys must not fire. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function preventDefault(e: Event): void {
  e.preventDefault();
}
