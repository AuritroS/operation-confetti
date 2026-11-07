import './story.css';
import { type StoryBeat, type StoryOwner, storyImageUrl } from '../story/script';

/**
 * How a panel talks back to the widget it is carrying.
 *
 * Two calls, because a gating widget needs exactly two things: to say its
 * state changed, and to act as though Next was pressed. Handing the widget
 * the button instead would make it depend on how the panel is built.
 */
export interface StorySlotHost {
  /** Re-evaluate `ready()` and enable or disable Next accordingly. */
  recheck(): void;
  /** Advance, if Next is currently enabled. */
  submit(): void;
}

/**
 * A widget a panel may carry in its caption area, which can block Next.
 *
 * This exists so the cover can ask for a name without the comic player
 * learning what an identity is: the panel knows only that something is
 * mounted there and whether it says it is ready.
 */
export interface StorySlot {
  readonly node: HTMLElement;
  /** Next is disabled while this returns false. */
  ready(): boolean;
  /** Given a host when the panel opens, null when it closes. */
  bind(host: StorySlotHost | null): void;
}

/** Seconds the opening camera move takes to settle. */
const MOVE_MS = 6000;
/** The slow push that keeps a settled panel alive. */
const DRIFT_MS = 22000;
const WIPE_MS = 280;

const reduced = (): boolean =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** `Element.animate` where the browser has it; jsdom does not. */
const canAnimate = (el: Element): boolean => typeof (el as HTMLElement).animate === 'function';

/**
 * The comic panel player.
 *
 * Plain DOM over the canvas rather than anything drawn in the scene: the
 * dialogue stays crisp at any size, it is selectable and translatable, and
 * the artwork is an `<img>` the browser caches.
 *
 * A panel is never static. The camera moves from the beat's opening framing
 * to its settled one over the first seconds, then keeps pushing in very
 * slowly; a two-layer panel moves its characters and its background at
 * different rates and follows the phone's tilt. Lines arrive one tap at a
 * time, and Next only advances once the last one is on screen — which is the
 * comic's own rhythm, and what makes a panel feel read rather than shown.
 *
 * Nothing auto-advances. A panel waits for the player, which is also what
 * makes it a safe place to finish loading the level behind it.
 */
export class StoryPlayer {
  private readonly root = document.createElement('div');
  private readonly backdrop = document.createElement('img');
  private readonly frame = document.createElement('div');
  private readonly drift = document.createElement('div');
  private readonly cam = document.createElement('div');
  private readonly tilt = document.createElement('div');
  private readonly art = document.createElement('img');
  private readonly chars = document.createElement('img');
  private readonly wipe = document.createElement('div');
  private readonly hint = document.createElement('div');
  private readonly foot = document.createElement('div');
  private readonly lines = document.createElement('div');
  private readonly next = document.createElement('button');
  private readonly skip = document.createElement('button');

  private resolve: ((skipped: boolean) => void) | null = null;
  private slot: StorySlot | null = null;
  private beat: StoryBeat | null = null;
  /** Lines not yet revealed, in order. */
  private pending: HTMLElement[] = [];
  private closeTimer: ReturnType<typeof setTimeout> | null = null;
  private animations: Animation[] = [];
  private layered = false;

  constructor(container: HTMLElement) {
    this.root.className = 'story';
    this.backdrop.className = 'story__backdrop';
    this.backdrop.alt = '';
    this.backdrop.hidden = true;
    this.frame.className = 'story__frame';
    this.drift.className = 'story__drift';
    this.cam.className = 'story__cam';
    this.tilt.className = 'story__tilt';
    this.art.className = 'story__art';
    this.art.alt = '';
    this.art.draggable = false;
    this.chars.className = 'story__art story__art--chars';
    this.chars.alt = '';
    this.chars.draggable = false;
    this.chars.hidden = true;
    this.wipe.className = 'story__wipe';
    this.wipe.hidden = true;
    this.hint.className = 'story__hint';
    this.hint.textContent = 'tap';
    this.hint.hidden = true;

    this.tilt.append(this.art, this.chars);
    this.cam.append(this.tilt);
    this.drift.append(this.cam);
    this.frame.append(this.drift);
    // A tap on the picture turns the page's next line, never the page.
    this.frame.addEventListener('click', () => this.reveal());

    this.foot.className = 'story__foot';
    this.lines.className = 'story__lines';
    this.lines.addEventListener('click', () => this.reveal());

    this.next.type = 'button';
    this.next.className = 'story__next btn btn--primary';
    this.next.addEventListener('click', () => {
      this.next.blur();
      // Next while lines remain reads the next line; the player never has
      // to learn two controls, and a hasty tap cannot skip a panel.
      if (this.pending.length > 0) this.reveal();
      else this.finish(false);
    });

    this.skip.type = 'button';
    this.skip.className = 'story__skip btn btn--quiet';
    this.skip.textContent = 'Skip story';
    this.skip.addEventListener('click', () => this.finish(true));

    this.foot.append(this.hint, this.lines, this.next);
    // The wipe is last so a page turn covers the caption area too.
    this.root.append(this.backdrop, this.frame, this.foot, this.skip, this.wipe);
    this.root.hidden = true;
    container.append(this.root);

    // The cover's art stops above the caption area, whose height depends on
    // what it carries (a name field, a hint, a link). Measure rather than
    // guess, so the poster is never hidden under its own Start button.
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => {
        this.root.style.setProperty('--foot', `${this.foot.offsetHeight}px`);
      }).observe(this.foot);
    }

    this.watchTilt();
  }

  /**
   * Show one beat and resolve when the player moves on.
   *
   * Resolves `true` if they skipped, so the caller can drop the rest of the
   * sequence rather than showing the next panel immediately after.
   */
  show(beat: StoryBeat, slot?: StorySlot): Promise<boolean> {
    // Called straight after the previous beat resolved: that is a page turn,
    // which gets a wipe rather than a blink to black and back.
    const consecutive = this.closeTimer !== null || !this.root.hidden;
    if (this.closeTimer !== null) { clearTimeout(this.closeTimer); this.closeTimer = null; }

    const promise = new Promise<boolean>((resolve) => { this.resolve = resolve; });
    if (consecutive && !reduced() && canAnimate(this.wipe)) {
      void this.turnPage(beat.owner, () => this.present(beat, slot));
    } else {
      this.present(beat, slot);
    }
    return promise;
  }

  /** Wipe across in the next beat's colour, swap the panel under it, wipe off. */
  private async turnPage(owner: StoryOwner, swap: () => void): Promise<void> {
    this.wipe.className = `story__wipe story__wipe--${owner}`;
    this.wipe.hidden = false;
    const ease = 'cubic-bezier(0.7, 0, 0.3, 1)';
    await this.wipe.animate(
      [{ transform: 'scaleX(0)', transformOrigin: '0 50%' }, { transform: 'scaleX(1)', transformOrigin: '0 50%' }],
      { duration: WIPE_MS, easing: ease, fill: 'forwards' },
    ).finished.catch(() => undefined);
    swap();
    await this.wipe.animate(
      [{ transform: 'scaleX(1)', transformOrigin: '100% 50%' }, { transform: 'scaleX(0)', transformOrigin: '100% 50%' }],
      { duration: WIPE_MS, easing: ease, fill: 'forwards' },
    ).finished.catch(() => undefined);
    this.wipe.hidden = true;
  }

  private present(beat: StoryBeat, slot?: StorySlot): void {
    this.beat = beat;
    this.stopMotion();

    const layers = beat.layers;
    this.layered = layers !== undefined;
    this.art.src = storyImageUrl(layers ? layers.background : beat.image);
    if (layers) { this.chars.src = storyImageUrl(layers.characters); this.chars.hidden = false; }
    else { this.chars.hidden = true; this.chars.removeAttribute('src'); }

    // A cover is shown whole over a blurred copy of itself, so its painted
    // title survives; every other panel fills the screen edge to edge and is
    // enlarged onto its subject.
    const cover = beat.cover === true;
    this.root.classList.toggle('story--cover', cover);
    this.backdrop.hidden = !cover;
    if (cover) this.backdrop.src = this.art.src;
    else this.backdrop.removeAttribute('src');
    this.next.textContent = beat.next;
    this.skip.hidden = beat.cover === true;

    this.lines.replaceChildren(...beat.lines.map((line) => {
      const p = document.createElement('p');
      if (line.who) {
        p.className = `story__line story__line--${line.who.toLowerCase()}`;
        const who = document.createElement('span');
        who.className = `story__who story__who--${line.who}`;
        who.textContent = line.who;
        p.append(who);
      } else {
        // Narration: a caption box, not a speech line.
        p.className = 'story__line story__line--caption caption';
      }
      // Appended as text, never markup: copy is content, not a template.
      p.append(document.createTextNode(line.text));
      p.hidden = true;
      return p;
    }));
    // The cover carries no dialogue. An empty box still claims the caption
    // grid's gaps on either side of it, which showed as a band of dead ink
    // between the poster and the name field.
    this.lines.hidden = beat.lines.length === 0;
    this.pending = [...this.lines.children] as HTMLElement[];
    // The first line is part of the picture; the rest are turned by hand.
    this.reveal();
    if (reduced()) while (this.pending.length > 0) this.reveal();

    this.mountSlot(slot ?? null);
    this.root.hidden = false;
    this.startMotion(beat);
  }

  /** Put the next line on screen, if there is one. */
  private reveal(): void {
    const line = this.pending.shift();
    if (line) {
      line.hidden = false;
      if (!reduced() && canAnimate(line)) {
        line.animate(
          [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }],
          { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
        );
      }
    }
    this.hint.hidden = this.pending.length === 0;
  }

  // ---- motion -----------------------------------------------------------

  private startMotion(beat: StoryBeat): void {
    const from = beat.cover ? { zoom: 1, origin: '50% 50%' } : beat.from;
    const to = beat.cover ? { zoom: 1, origin: '50% 50%' } : beat.to;
    const still = reduced() || !canAnimate(this.cam);

    // Always land on the settled framing, with or without the move.
    this.cam.style.transform = `scale(${to.zoom})`;
    this.cam.style.transformOrigin = to.origin;
    this.drift.style.transform = 'scale(1)';
    if (still) return;

    this.animations = [
      this.cam.animate(
        [
          { transform: `scale(${from.zoom})`, transformOrigin: from.origin },
          { transform: `scale(${to.zoom})`, transformOrigin: to.origin },
        ],
        { duration: MOVE_MS, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)', fill: 'forwards' },
      ),
      this.drift.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.045)' }],
        { duration: DRIFT_MS, easing: 'linear', fill: 'forwards' },
      ),
    ];
  }

  private stopMotion(): void {
    for (const a of this.animations) a.cancel();
    this.animations = [];
  }

  /**
   * Follow the phone's tilt, or the pointer on a desktop.
   *
   * A few pixels either way, more for the character layer than the
   * background, which is the whole of the depth effect. Listeners are cheap
   * and only act while a panel is up. iOS asks permission for orientation
   * events, which is not worth a prompt at a party, so there it simply does
   * nothing.
   */
  private watchTilt(): void {
    const apply = (x: number, y: number): void => {
      if (this.root.hidden) return;
      const dx = Math.max(-1, Math.min(1, x));
      const dy = Math.max(-1, Math.min(1, y));
      this.tilt.style.transform = `translate(${(dx * -5).toFixed(1)}px, ${(dy * -4).toFixed(1)}px)`;
      this.chars.style.transform = this.layered
        ? `translate(${(dx * 14).toFixed(1)}px, ${(dy * 9).toFixed(1)}px)`
        : '';
    };
    this.root.addEventListener('pointermove', (e) => {
      const r = this.frame.getBoundingClientRect();
      if (r.width === 0) return;
      apply(((e.clientX - r.left) / r.width) * 2 - 1, ((e.clientY - r.top) / r.height) * 2 - 1);
    });
    if (typeof window !== 'undefined' && 'DeviceOrientationEvent' in window) {
      window.addEventListener('deviceorientation', (e) => {
        if (e.gamma === null || e.beta === null) return;
        // Portrait: gamma is left/right tilt, beta is forward/back around 45°.
        apply(e.gamma / 25, (e.beta - 45) / 25);
      }, { passive: true });
    }
  }

  // ---- slot ----------------------------------------------------------------

  /**
   * Put a gating widget in the caption area, above the dialogue.
   *
   * Above rather than below, so the lines stay adjacent to Next and the
   * reading order is: artwork, question, answer, continue.
   */
  private mountSlot(slot: StorySlot | null): void {
    this.slot?.bind(null);
    this.slot?.node.remove();
    this.slot = slot;
    this.next.disabled = false;
    if (!slot) return;
    this.foot.prepend(slot.node);
    slot.bind({
      recheck: () => { this.next.disabled = !slot.ready(); },
      submit: () => { if (!this.next.disabled) this.finish(false); },
    });
    this.next.disabled = !slot.ready();
  }

  private finish(skipped: boolean): void {
    this.mountSlot(null);
    const done = this.resolve;
    this.resolve = null;
    // Hide a beat later rather than now: if the caller shows the next beat
    // straight away, the panel stays up and the page turns under a wipe.
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      this.root.hidden = true;
      this.stopMotion();
      this.beat = null;
    }, 0);
    done?.(skipped);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  /** The beat on screen, for review tooling. */
  get current(): StoryBeat | null { return this.beat; }

  dispose(): void { this.root.remove(); }
}
