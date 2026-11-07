import './name-entry.css';
import { loadIdentity, newId, normaliseDisplayName, saveIdentity, type Identity } from '../net/scoreClient';
import type { StorySlot, StorySlotHost } from './story';

/**
 * Who is playing, asked once on the cover panel.
 *
 * A name is required, because the only thing a leaderboard is for is finding
 * your own row on it — a board of "Anonymous" entries is a list nobody can
 * read themselves into. So this gates the cover's Start button rather than
 * offering a skip.
 *
 * The player ID is separate from the name and is minted once per browser.
 * That is what makes "best run per player" mean anything across replays, and
 * it is why renaming yourself does not fork your history: the same ID, a new
 * label.
 *
 * Validation is `normaliseDisplayName` — the same function, by import rather
 * than by resemblance, that the Worker applies before storing a row. A field
 * that accepts a name the server will reject is worse than no field.
 */
export interface NameEntryOptions {
  /**
   * An extra link under the field.
   *
   * The campaign uses it for the leaderboard, which otherwise has no entrance
   * except finishing all three levels — at a party, most people never would.
   * The behaviour belongs to the campaign; only the markup belongs here.
   */
  readonly secondary?: { readonly label: string; readonly onClick: () => void };
}

export class NameEntry implements StorySlot {
  readonly node = document.createElement('div');
  private readonly input = document.createElement('input');
  private readonly hint = document.createElement('p');
  private host: StorySlotHost | null = null;
  /** The ID persists across renames; only the label is editable. */
  private readonly playerId: string;

  constructor(options: NameEntryOptions = {}) {
    const saved = loadIdentity();
    this.playerId = saved?.playerId ?? newId();

    this.node.className = 'name';

    const label = document.createElement('label');
    label.className = 'name__label';
    label.textContent = 'Who is playing?';
    label.htmlFor = 'name-input';

    this.input.id = 'name-input';
    this.input.className = 'name__input field';
    this.input.type = 'text';
    this.input.placeholder = 'Your name';
    this.input.maxLength = 20;
    this.input.setAttribute('autocomplete', 'nickname');
    // Capitalised like a name, and never spell-corrected — these are mostly
    // nicknames, and autocorrect rewriting one is a bad surprise.
    this.input.autocapitalize = 'words';
    this.input.spellcheck = false;
    // A replay should not retype it.
    this.input.value = saved?.displayName ?? '';

    this.hint.className = 'name__hint';

    this.input.addEventListener('input', () => this.refresh());
    // Enter is the obvious way to submit a single text field. It goes
    // through the panel rather than reaching for its button, so this stays
    // ignorant of how the panel is built.
    this.input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.host?.submit();
    });

    this.node.append(label, this.input, this.hint);

    if (options.secondary) {
      const link = document.createElement('button');
      link.type = 'button';
      link.className = 'name__secondary';
      link.textContent = options.secondary.label;
      const act = options.secondary.onClick;
      link.addEventListener('click', () => { link.blur(); act(); });
      this.node.append(link);
    }

    this.refresh();
  }

  /** The validated identity, or null while the field is unusable. */
  identity(): Identity | null {
    const displayName = normaliseDisplayName(this.input.value);
    return displayName ? { playerId: this.playerId, displayName } : null;
  }

  /** Store what they typed. Called once they commit by starting the game. */
  commit(): Identity | null {
    const id = this.identity();
    if (id) saveIdentity(id);
    return id;
  }

  // ---- StorySlot --------------------------------------------------------

  ready(): boolean { return this.identity() !== null; }

  bind(host: StorySlotHost | null): void {
    this.host = host;
    if (host) this.refresh();
  }

  private refresh(): void {
    const typed = this.input.value.trim();
    const ok = this.ready();
    // Silence until they have actually typed: an empty field is the starting
    // state, not a mistake to be told about.
    this.hint.textContent = ok || typed.length === 0 ? '' : '2 to 20 characters.';
    this.hint.classList.toggle('name__hint--bad', !ok && typed.length > 0);
    this.host?.recheck();
  }
}
