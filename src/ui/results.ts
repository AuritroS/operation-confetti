import './results.css';
import { MAX_TOTAL } from '../core/scoring';
import { fetchLeaderboard, type LeaderboardRow } from '../net/scoreClient';

export interface RunResult {
  readonly outcome: 'win' | 'loss';
  readonly total: number;
  readonly levelScores: readonly [number, number, number];
}

/** How the score's trip to the server is going. */
export type SaveState =
  | { readonly kind: 'saving' }
  | { readonly kind: 'saved'; readonly rank: number | null }
  /** Queued locally; it will be retried on the next load. */
  | { readonly kind: 'offline' }
  /** Not submitted on purpose — a `?level` jump is not a campaign run. */
  | { readonly kind: 'skipped'; readonly why: string };

const LEVEL_NAMES = ['The Gift Vault', 'Skyline Chase', 'Cake Showdown'] as const;

/**
 * The end-of-run screen, with the leaderboard behind it.
 *
 * The one rule this component enforces is about the rank line: it shows
 * "Saving score…" and will only print a position that arrived from the
 * server. The client already knows its own total — `scoreRun` is shared — but
 * it cannot know where that total places, and guessing produces a number the
 * player repeats to the room and then finds was wrong.
 *
 * The board is fetched when it is opened rather than with the result, so a
 * player who taps Play again never waits on a request they did not want.
 */
export class ResultsScreen {
  private readonly root = document.createElement('div');
  private readonly result = document.createElement('div');
  private readonly board = document.createElement('div');

  private readonly outcomeEl = document.createElement('h2');
  private readonly scoreEl = document.createElement('span');
  private readonly levelsEl = document.createElement('div');
  private readonly rankEl = document.createElement('p');
  private readonly listEl = document.createElement('div');
  private readonly boardActions = document.createElement('div');

  private playerId: string | null = null;
  private onReplay: (() => void) | null = null;
  /** Review only: rows to show instead of fetching. */
  private sample: LeaderboardRow[] | null = null;

  /** Fill the board with forty made-up rows, the player at 24th. */
  useSampleBoard(): void {
    this.sample = Array.from({ length: 40 }, (_, i) => ({
      rank: i + 1,
      displayName: i === 23 ? 'You' : `Guest ${i + 1}`,
      totalScore: 2300 - i * 37,
      outcome: 'win' as const,
      isSelf: i === 23,
    }));
  }

  constructor(container: HTMLElement) {
    this.root.className = 'results';
    this.root.hidden = true;

    this.result.className = 'results__pane frame';
    this.board.className = 'results__pane frame';
    this.board.hidden = true;

    this.buildResultPane();
    this.buildBoardPane();

    this.root.append(this.result, this.board);
    container.append(this.root);
  }

  private buildResultPane(): void {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow results__eyebrow';
    eyebrow.textContent = 'Issue #27 · Final page';

    this.outcomeEl.className = 'results__outcome caption';

    const total = document.createElement('div');
    total.className = 'results__total';
    this.scoreEl.className = 'results__score';
    const of = document.createElement('span');
    of.className = 'results__of';
    of.textContent = `of ${MAX_TOTAL}`;
    total.append(this.scoreEl, of);

    this.levelsEl.className = 'results__levels';
    this.rankEl.className = 'results__rank';

    const actions = document.createElement('div');
    actions.className = 'results__actions';
    actions.append(
      this.button('Leaderboard', false, () => void this.openBoard()),
      this.button('Play again', true, () => this.onReplay?.()),
    );

    this.result.append(eyebrow, this.outcomeEl, total, this.levelsEl, this.rankEl, actions);
  }

  private buildBoardPane(): void {
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'Leaderboard';
    const heading = document.createElement('h2');
    heading.className = 'results__heading headline';
    heading.textContent = 'Hall of Heroes';

    this.listEl.className = 'results__board';
    // Rebuilt per use: the way out of the board depends on how it was
    // reached. From a result it is "back to my score"; from the cover there
    // is no score to go back to, only the game to start.
    this.boardActions.className = 'results__actions';

    this.board.append(eyebrow, heading, this.listEl, this.boardActions);
  }

  private button(label: string, primary: boolean, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = primary ? 'results__btn btn btn--primary' : 'results__btn btn btn--ghost';
    b.textContent = label;
    b.addEventListener('click', () => { b.blur(); onClick(); });
    return b;
  }

  /**
   * Show the result. `playerId` is only used to highlight their own board
   * row, and is null for a run that was never submitted.
   */
  show(result: RunResult, playerId: string | null, onReplay: () => void): void {
    this.playerId = playerId;
    this.onReplay = onReplay;

    const won = result.outcome === 'win';
    this.outcomeEl.className = `results__outcome caption results__outcome--${won ? 'win' : 'loss'}`;
    // The same captions the comic's last panel uses, so the page agrees
    // with the picture before it.
    this.outcomeEl.textContent = won ? 'Cake recovered' : 'The cake remains at large';
    this.scoreEl.textContent = String(result.total);

    this.levelsEl.replaceChildren(...result.levelScores.map((score, i) => {
      const row = document.createElement('div');
      row.className = 'results__level';
      const name = document.createElement('span');
      name.className = 'results__level-name';
      name.textContent = `${i + 1} · ${LEVEL_NAMES[i]}`;
      const value = document.createElement('span');
      value.className = 'results__level-score';
      value.textContent = String(score);
      row.append(name, value);
      return row;
    }));

    this.setSaveState({ kind: 'saving' });
    this.boardActions.replaceChildren(
      this.button('Back', false, () => { this.board.hidden = true; this.result.hidden = false; }),
      this.button('Play again', true, () => this.onReplay?.()),
    );
    this.board.hidden = true;
    this.result.hidden = false;
    this.root.hidden = false;
  }

  /** Replace the rank line. Only ever called with something the server said. */
  setSaveState(state: SaveState): void {
    this.rankEl.replaceChildren();
    switch (state.kind) {
      case 'saving':
        this.rankEl.textContent = 'Saving score…';
        break;
      case 'saved': {
        if (state.rank === null) {
          this.rankEl.textContent = 'Score saved.';
          break;
        }
        const place = document.createElement('strong');
        place.textContent = `#${state.rank}`;
        this.rankEl.append('Saved — you are ', place, ' on the board.');
        break;
      }
      case 'offline':
        this.rankEl.textContent = 'Offline — your score is saved here and will upload later.';
        break;
      case 'skipped':
        this.rankEl.textContent = state.why;
        break;
    }
  }

  /**
   * Open the board on its own, with nothing behind it.
   *
   * Reachable from the cover, because a board you can only see by beating
   * three levels is one most people at a party never see. Closing just hides
   * this overlay — whatever it was opened over is still underneath it — so
   * `onClose` is only for a caller that needs to know.
   */
  showBoard(playerId: string | null, onClose?: () => void): void {
    this.playerId = playerId;
    this.boardActions.replaceChildren(
      this.button('Close', true, () => { this.hide(); onClose?.(); }),
    );
    this.root.hidden = false;
    void this.openBoard();
  }

  private async openBoard(): Promise<void> {
    this.result.hidden = true;
    this.board.hidden = false;
    this.listEl.replaceChildren(this.message('Loading…'));
    try {
      const rows = this.sample ?? await fetchLeaderboard(this.playerId);
      this.listEl.replaceChildren(
        ...(rows.length === 0
          ? [this.message('No runs yet. Yours could be first.')]
          : rows.map((row) => this.row(row))),
      );
      // Land on your own row: the one you came to find.
      const self = this.listEl.querySelector<HTMLElement>('.results__row--self');
      if (self && typeof self.scrollIntoView === 'function') {
        self.scrollIntoView({ block: 'center' });
      }
    } catch {
      this.listEl.replaceChildren(this.message('Could not reach the leaderboard.'));
    }
  }

  private row(row: LeaderboardRow): HTMLElement {
    const el = document.createElement('div');
    el.className = row.isSelf ? 'results__row results__row--self' : 'results__row';

    const place = document.createElement('span');
    place.className = 'results__place';
    place.textContent = `${row.rank}`;

    const name = document.createElement('span');
    name.className = 'results__name';
    // Text, never markup: a display name is player-supplied content.
    name.textContent = row.displayName;

    const points = document.createElement('span');
    points.className = 'results__points';
    points.textContent = String(row.totalScore);

    el.append(place, name, points);
    return el;
  }

  private message(text: string): HTMLElement {
    const p = document.createElement('p');
    p.className = 'results__empty';
    p.textContent = text;
    return p;
  }

  hide(): void { this.root.hidden = true; }

  get isOpen(): boolean { return !this.root.hidden; }

  dispose(): void { this.root.remove(); }
}
