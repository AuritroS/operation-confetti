import './story.css';
import { type StoryBeat, storyImageUrl } from '../story/script';

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

/**
 * The comic panel player.
 *
 * Plain DOM over the canvas rather than anything drawn in the scene: the
 * dialogue stays crisp at any size, it is selectable and translatable, and
 * the artwork is a single `<img>` the browser caches. Nothing auto-advances —
 * a panel waits for the player, which is also what makes it a safe place to
 * finish loading the level behind it.
 */
export class StoryPlayer {
  private readonly root = document.createElement('div');
  private readonly frame = document.createElement('div');
  private readonly art = document.createElement('img');
  private readonly foot = document.createElement('div');
  private readonly lines = document.createElement('div');
  private readonly next = document.createElement('button');
  private readonly skip = document.createElement('button');
  private resolve: ((skipped: boolean) => void) | null = null;
  private slot: StorySlot | null = null;

  constructor(container: HTMLElement) {
    this.root.className = 'story';
    this.art.className = 'story__art';
    this.art.alt = '';

    this.frame.className = 'story__frame';
    this.frame.append(this.art);

    this.foot.className = 'story__foot';
    this.lines.className = 'story__lines';

    this.next.type = 'button';
    this.next.className = 'story__next';
    this.next.addEventListener('click', () => this.finish(false));

    this.skip.type = 'button';
    this.skip.className = 'story__skip';
    this.skip.textContent = 'Skip story';
    this.skip.addEventListener('click', () => this.finish(true));

    this.foot.append(this.lines, this.next);
    this.root.append(this.frame, this.skip, this.foot);
    this.root.hidden = true;
    container.append(this.root);
  }

  /**
   * Show one beat and resolve when the player moves on.
   *
   * Resolves `true` if they skipped, so the caller can drop the rest of the
   * sequence rather than showing the next panel immediately after.
   */
  show(beat: StoryBeat, slot?: StorySlot): Promise<boolean> {
    this.art.src = storyImageUrl(beat.image);
    // A cover is letterboxed so its painted title survives; every other
    // panel fills the frame and is enlarged onto its subject.
    this.art.className = beat.cover ? 'story__art story__art--fit' : 'story__art';
    this.art.style.setProperty('--zoom', String(beat.cover ? 1 : beat.framing.zoom));
    this.art.style.setProperty('--origin', beat.framing.origin);
    this.next.textContent = beat.next;
    this.skip.hidden = beat.cover === true;

    this.lines.replaceChildren(...beat.lines.map((line) => {
      const p = document.createElement('p');
      p.className = 'story__line';
      if (line.who) {
        const who = document.createElement('span');
        who.className = `story__who story__who--${line.who}`;
        who.textContent = line.who;
        p.append(who);
      }
      // Appended as text, never markup: copy is content, not a template.
      p.append(document.createTextNode(line.text));
      return p;
    }));
    // The cover carries no dialogue. An empty box still claims the caption
    // grid's gaps on either side of it, which showed as a band of dead ink
    // between the poster and the name field.
    this.lines.hidden = beat.lines.length === 0;

    this.mountSlot(slot ?? null);

    this.root.hidden = false;
    return new Promise((resolve) => { this.resolve = resolve; });
  }

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
    this.root.hidden = true;
    this.mountSlot(null);
    const done = this.resolve;
    this.resolve = null;
    done?.(skipped);
  }

  get isOpen(): boolean { return !this.root.hidden; }

  dispose(): void { this.root.remove(); }
}
