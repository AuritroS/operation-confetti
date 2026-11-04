import type { Direction } from '../levels/skyline/types';
type Gesture = { type: 'swipe'; direction: Direction } | { type: 'pause' | 'restart' };
/** One dominant-axis action per stroke; short taps, holds and diagonal jitter are inert. */
export class SkylineSwipeInput {
  private active: { id: number; x: number; y: number; resolved: boolean } | null = null;
  private listener: (g: Gesture) => void = () => {};
  constructor(private surface: HTMLElement) {}
  onGesture(fn: (g: Gesture) => void): void { this.listener = fn; }
  clear(): void {
    const id = this.active?.id; this.active = null;
    if (id !== undefined && this.surface.hasPointerCapture?.(id)) this.surface.releasePointerCapture(id);
  }
  attach(): void {
    this.surface.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move, { passive: false });
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.cancel);
    this.surface.addEventListener('lostpointercapture', this.cancel);
    window.addEventListener('keydown', this.key);
    this.surface.addEventListener('contextmenu', this.menu);
  }
  detach(): void {
    this.clear(); this.surface.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move); window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.cancel); this.surface.removeEventListener('lostpointercapture', this.cancel);
    window.removeEventListener('keydown', this.key); this.surface.removeEventListener('contextmenu', this.menu);
  }
  private menu = (e: Event) => e.preventDefault();
  private down = (e: PointerEvent) => {
    if (e.button !== 0 || this.active) return;
    e.preventDefault(); this.active = { id: e.pointerId, x: e.clientX, y: e.clientY, resolved: false };
    try { this.surface.setPointerCapture(e.pointerId); } catch { /* Window listeners also handle releases. */ }
  };
  private move = (e: PointerEvent) => {
    const a = this.active; if (!a || a.id !== e.pointerId) return;
    e.preventDefault(); if (a.resolved) return;
    const dx = e.clientX - a.x, dy = e.clientY - a.y;
    const x = Math.abs(dx), y = Math.abs(dy);
    let direction: Direction;
    if (x >= 28 && x >= y * 1.25) direction = dx < 0 ? 'left' : 'right';
    else if (y >= 28 && y >= x * 1.25) direction = dy < 0 ? 'up' : 'down';
    else return;
    a.resolved = true; this.listener({ type: 'swipe', direction });
  };
  private up = (e: PointerEvent) => {
    if (this.active?.id !== e.pointerId) return;
    this.move(e); this.clear();
  };
  private cancel = (e: PointerEvent) => { if (this.active?.id === e.pointerId) this.clear(); };
  private key = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLElement && e.target.matches('input,textarea,select,[contenteditable]')) return;
    const keys: Record<string, Direction> = { KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right',
      KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down' };
    const direction = keys[e.code];
    if (direction) { e.preventDefault(); if (!e.repeat) this.listener({ type: 'swipe', direction }); }
    else if (['KeyP', 'Escape', 'KeyR'].includes(e.code)) {
      e.preventDefault(); if (!e.repeat) this.listener({ type: e.code === 'KeyR' ? 'restart' : 'pause' });
    }
  };
}
