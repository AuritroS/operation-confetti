import './fade.css';

/** How long the CSS transition runs. Kept in step with `fade.css`. */
const DURATION = 350;

/**
 * A black curtain the shell draws across a level change.
 *
 * `cover` resolves once the screen is actually black, so the caller can tear
 * down one level and build the next behind it without either being seen. It
 * is also where a slow mount hides: the curtain simply stays up until the
 * next level is ready.
 */
export class Fade {
  private readonly root = document.createElement('div');

  constructor(container: HTMLElement) {
    this.root.className = 'fade';
    container.append(this.root);
  }

  cover(): Promise<void> {
    this.root.classList.add('fade--on');
    return this.settle();
  }

  reveal(): Promise<void> {
    this.root.classList.remove('fade--on');
    return this.settle();
  }

  /**
   * Wait for the transition, with a timer rather than `transitionend`.
   *
   * A hidden or background tab never fires `transitionend`, and a transition
   * that never resolves would strand the campaign mid-change with the screen
   * black. The timer always comes back.
   */
  private settle(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, DURATION + 20));
  }

  dispose(): void { this.root.remove(); }
}
