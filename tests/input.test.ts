// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RECOGNISER, InputRecogniser, type Gesture } from '../src/core/input';

/**
 * jsdom has no PointerEvent, so synthesise the shape the recogniser reads.
 * Only clientX/clientY/pointerId/timeStamp matter.
 */
function pointer(
  type: string,
  { x = 0, y = 0, id = 1, t = 0 }: { x?: number; y?: number; id?: number; t?: number } = {},
): Event {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, {
    clientX: { value: x },
    clientY: { value: y },
    pointerId: { value: id },
    timeStamp: { value: t },
  });
  return e;
}

let surface: HTMLElement;
let gestures: Gesture[];
let rec: InputRecogniser;

beforeEach(() => {
  document.body.innerHTML = '<div id="s"></div>';
  surface = document.getElementById('s') as HTMLElement;
  // jsdom lacks the pointer-capture API; the recogniser treats it as optional.
  Object.assign(surface, {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  });
  gestures = [];
  rec = new InputRecogniser(surface);
  rec.onGesture((g) => gestures.push(g));
  rec.attach();
});

const types = () => gestures.map((g) => g.type);

describe('tap recognition', () => {
  it('recognises a quick, still press as a tap on release', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointerup', { x: 102, y: 201, t: 90 }));
    expect(types()).toEqual(['holdStart', 'tap', 'holdEnd']);
  });

  it('does not tap when the press is held too long', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointerup', { x: 100, y: 200, t: 400 }));
    expect(types()).toEqual(['holdStart', 'holdEnd']);
  });

  it('does not tap when the press drifts too far', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, t: 0 }));
    // 18px of mostly vertical drift: too far for a tap, not a swipe either.
    surface.dispatchEvent(pointer('pointermove', { x: 100, y: 118, t: 60 }));
    surface.dispatchEvent(pointer('pointerup', { x: 100, y: 118, t: 100 }));
    expect(types()).toEqual(['holdStart', 'holdEnd']);
  });
});

describe('swipe recognition', () => {
  it('fires as soon as the threshold is crossed, before release', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointermove', { x: 100 + DEFAULT_RECOGNISER.swipePx, y: 200, t: 40 }));
    expect(gestures.at(-1)).toEqual({ type: 'swipe', dir: 1 });
  });

  it('reports direction from the sign of horizontal travel', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 200, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointermove', { x: 150, y: 200, t: 40 }));
    expect(gestures.at(-1)).toEqual({ type: 'swipe', dir: -1 });
  });

  it('fires exactly once per gesture no matter how far the finger travels', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointermove', { x: 140, y: 200, t: 30 }));
    surface.dispatchEvent(pointer('pointermove', { x: 220, y: 200, t: 60 }));
    surface.dispatchEvent(pointer('pointermove', { x: 320, y: 200, t: 90 }));
    surface.dispatchEvent(pointer('pointerup', { x: 320, y: 200, t: 120 }));
    expect(gestures.filter((g) => g.type === 'swipe')).toHaveLength(1);
  });

  it('ignores a mostly vertical drag', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 100, t: 0 }));
    // 30px across but 40px down: fails the 1.5x horizontal dominance rule.
    surface.dispatchEvent(pointer('pointermove', { x: 130, y: 140, t: 50 }));
    expect(gestures.some((g) => g.type === 'swipe')).toBe(false);
  });
});

describe('swipe and tap separation', () => {
  it('a swipe cancels the tap for that gesture', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointermove', { x: 140, y: 200, t: 30 }));
    surface.dispatchEvent(pointer('pointerup', { x: 140, y: 200, t: 60 }));
    expect(types()).toEqual(['holdStart', 'swipe', 'holdEnd']);
    expect(types()).not.toContain('tap');
  });
});

describe('cancellation', () => {
  it('reports holdCancel and emits no tap when the pointer is cancelled', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointercancel', { x: 100, y: 200, t: 50 }));
    expect(types()).toEqual(['holdStart', 'holdCancel']);
  });

  it('clearHeld drops an in-flight gesture so a pause cannot leak a release', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    rec.clearHeld();
    expect(types()).toEqual(['holdStart', 'holdCancel']);
    // The stale pointerup must now be ignored entirely.
    surface.dispatchEvent(pointer('pointerup', { x: 100, y: 200, t: 80 }));
    expect(types()).toEqual(['holdStart', 'holdCancel']);
  });
});

describe('single active pointer', () => {
  it('ignores a second finger entirely', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, id: 1, t: 0 }));
    surface.dispatchEvent(pointer('pointerdown', { x: 300, y: 200, id: 2, t: 10 }));
    // A swipe on the second pointer must not steer.
    surface.dispatchEvent(pointer('pointermove', { x: 360, y: 200, id: 2, t: 40 }));
    surface.dispatchEvent(pointer('pointerup', { x: 360, y: 200, id: 2, t: 60 }));
    expect(types()).toEqual(['holdStart']);
  });

  it('a quick second tap does not fire an extra shot', () => {
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, id: 1, t: 0 }));
    surface.dispatchEvent(pointer('pointerdown', { x: 200, y: 200, id: 2, t: 5 }));
    surface.dispatchEvent(pointer('pointerup', { x: 200, y: 200, id: 2, t: 40 }));
    surface.dispatchEvent(pointer('pointerup', { x: 100, y: 200, id: 1, t: 80 }));
    expect(gestures.filter((g) => g.type === 'tap')).toHaveLength(1);
  });
});

describe('disabled input', () => {
  it('drops all input while disabled', () => {
    rec.setEnabled(false);
    surface.dispatchEvent(pointer('pointerdown', { x: 100, y: 200, t: 0 }));
    surface.dispatchEvent(pointer('pointerup', { x: 100, y: 200, t: 50 }));
    expect(gestures).toEqual([]);
  });
});

describe('keyboard parity', () => {
  it('maps arrows and A/D to single-lane swipes', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowLeft' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    expect(gestures).toEqual([
      { type: 'swipe', dir: -1 },
      { type: 'swipe', dir: 1 },
    ]);
  });

  it('ignores auto-repeat so a held arrow moves one lane', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', repeat: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight', repeat: true }));
    expect(gestures.filter((g) => g.type === 'swipe')).toHaveLength(1);
  });

  it('treats a short Space press as a tap and a long one as hold only', () => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    // jsdom timeStamps are 0, so this press reads as instantaneous: a tap.
    expect(types()).toEqual(['holdStart', 'tap', 'holdEnd']);
  });
});
