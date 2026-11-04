// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { SkylineSwipeInput } from '../src/core/skyline-swipe-input';
let surface: HTMLElement, input: SkylineSwipeInput;
let events: { type: string; direction?: string }[];
function pointer(type: string, x: number, y: number, id = 1): void {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(e, { clientX: { value: x }, clientY: { value: y }, pointerId: { value: id }, button: { value: 0 } });
  surface.dispatchEvent(e);
}
beforeEach(() => {
  document.body.innerHTML = '<div id="surface"></div>'; surface = document.getElementById('surface')!;
  events = []; input = new SkylineSwipeInput(surface); input.onGesture((g) => events.push(g)); input.attach();
});
afterEach(() => input.detach());
it.each([[-80,0,'left'],[80,0,'right'],[0,-80,'up'],[0,80,'down']] as const)('recognises %s/%s as %s', (dx,dy,direction) => {
  pointer('pointerdown', 200, 300); pointer('pointermove', 200+dx,300+dy); pointer('pointerup',200+dx,300+dy);
  expect(events).toEqual([{ type: 'swipe', direction }]);
});
it('taps and small jitter are inert', () => {
  pointer('pointerdown',100,100); pointer('pointermove',110,109); pointer('pointerup',110,109); expect(events).toEqual([]);
});
it('a long stroke fires once even if it changes direction', () => {
  pointer('pointerdown',100,100); pointer('pointermove',170,100); pointer('pointermove',250,100); pointer('pointermove',20,100);
  pointer('pointerup',20,100); expect(events).toEqual([{ type:'swipe', direction:'right' }]);
});
it('ambiguous diagonals wait for a dominant axis', () => {
  pointer('pointerdown',100,100); pointer('pointermove',140,140); expect(events).toEqual([]);
  pointer('pointermove',145,180); expect(events[0]?.direction).toBe('down');
});
it('accepts two separate swipes immediately', () => {
  for(let i=0;i<2;i++) { pointer('pointerdown',200,200); pointer('pointerup',120,200); }
  expect(events.map(e=>e.direction)).toEqual(['left','left']);
});
it('ignores extra fingers and clears cancelled or paused strokes', () => {
  pointer('pointerdown',100,100); pointer('pointermove',180,100,2); expect(events).toEqual([]);
  pointer('pointercancel',100,100); pointer('pointerdown',100,100); input.clear(); pointer('pointerup',200,100);
  expect(events).toEqual([]); pointer('pointerdown',100,100); pointer('pointerup',100,180); expect(events[0]?.direction).toBe('down');
});
it('supports arrow keys and WASD without key-repeat moves', () => {
  for(const code of ['KeyA','ArrowRight','KeyW','ArrowDown']) window.dispatchEvent(new KeyboardEvent('keydown',{code}));
  window.dispatchEvent(new KeyboardEvent('keydown',{code:'KeyD',repeat:true}));
  expect(events.map(e=>e.direction)).toEqual(['left','right','up','down']);
});
