import './fade.css';

/** How long a close or an open takes. */
const DURATION = 480;

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The iris between a level and whatever comes next.
 *
 * `cover` closes a circle of ink down onto the centre of the frame and
 * resolves once the screen is dark, so the caller can tear down one level
 * and build the next behind it without either being seen. `reveal` opens it
 * again. It is also where a slow mount hides: the iris simply stays shut
 * until the next level is ready.
 *
 * Drawn as a radial gradient whose transparent radius is animated, which is
 * one element and no clip-path support question. The radius is in pixels
 * from the frame's own diagonal, so the circle always clears the corners.
 */
export class Fade {
  private readonly root = document.createElement('div');
  private frame = 0;

  constructor(container: HTMLElement) {
    // Starts open: the stylesheet's default radius clears any frame, and the
    // real size is only known once this is laid out, at the first `cover`.
    this.root.className = 'fade';
    container.append(this.root);
  }

  cover(): Promise<void> {
    this.root.classList.add('fade--on');
    return this.run(1, 0);
  }

  /**
   * Shut at once, with no animation.
   *
   * For when something opaque — the cover, the results — is already over
   * the stage: nobody can see the iris close, so a half-second wait there is
   * only a delay before the next thing. The later `reveal` still opens.
   */
  shut(): void {
    cancelAnimationFrame(this.frame);
    this.root.classList.add('fade--on');
    this.setRadius(0);
  }

  reveal(): Promise<void> {
    return this.run(0, 1).then(() => { this.root.classList.remove('fade--on'); });
  }

  /** 0 is shut, 1 is fully open. */
  private setRadius(open: number): void {
    const w = this.root.clientWidth || 390;
    const h = this.root.clientHeight || 844;
    const max = Math.hypot(w, h) * 0.52;
    this.root.style.setProperty('--iris', `${(max * open).toFixed(1)}px`);
  }

  /**
   * Animate the radius, with a timer as the thing that resolves.
   *
   * A hidden or background tab never runs animation frames, and a transition
   * that never resolves would strand the campaign mid-change with the screen
   * black. The timer always comes back, and the end state is set regardless
   * of how many frames were drawn.
   */
  private run(from: number, to: number): Promise<void> {
    cancelAnimationFrame(this.frame);
    const instant = reduced();
    const ms = instant ? 1 : DURATION;
    const start = performance.now();
    const ease = (t: number): number => (to < from ? 1 - (1 - t) * (1 - t) : t * t);
    const tick = (now: number): void => {
      const t = Math.min(1, (now - start) / ms);
      this.setRadius(from + (to - from) * ease(t));
      if (t < 1) this.frame = requestAnimationFrame(tick);
    };
    if (!instant) this.frame = requestAnimationFrame(tick);
    return new Promise((resolve) => setTimeout(() => {
      cancelAnimationFrame(this.frame);
      this.setRadius(to);
      resolve();
    }, ms + 20));
  }

  dispose(): void { this.root.remove(); }
}
