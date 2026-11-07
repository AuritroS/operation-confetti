// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResultsScreen } from '../src/ui/results';
import { MAX_TOTAL } from '../src/core/scoring';

const mount = (): { screen: ResultsScreen; replay: ReturnType<typeof vi.fn> } => {
  const app = document.createElement('div');
  document.body.append(app);
  return { screen: new ResultsScreen(app), replay: vi.fn() };
};

const rankText = (): string => document.querySelector('.results__rank')?.textContent ?? '';
const click = (label: string): void => {
  const button = [...document.querySelectorAll<HTMLButtonElement>('.results__btn')]
    .find((b) => b.textContent === label);
  if (!button) throw new Error(`no "${label}" button`);
  button.click();
};

describe('ResultsScreen', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  /**
   * The rule worth a test: a position is only ever printed if the server said
   * it. The client knows its own total — `scoreRun` is shared — but it cannot
   * know where that total places, and a guessed rank is a number the player
   * repeats to the room and then finds was wrong.
   */
  it('shows a pending line until the server answers, and never a guessed rank', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1800, levelScores: [600, 500, 700] }, 'p1', replay);

    expect(rankText()).toBe('Saving score…');
    expect(rankText()).not.toMatch(/#\d/);

    screen.setSaveState({ kind: 'saved', rank: 4 });
    expect(rankText()).toContain('#4');
  });

  it('says the score was stored, with no position, when the server returned no rank', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 10, levelScores: [10, 0, 0] }, 'p1', replay);
    screen.setSaveState({ kind: 'saved', rank: null });

    expect(rankText()).toBe('Score saved.');
    expect(rankText()).not.toMatch(/#/);
  });

  it('distinguishes offline from refused, since the fix differs', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'loss', total: 0, levelScores: [0, 0, 0] }, 'p1', replay);

    screen.setSaveState({ kind: 'offline' });
    expect(rankText()).toMatch(/offline/i);

    screen.setSaveState({ kind: 'skipped', why: 'Debug run — not submitted to the leaderboard.' });
    expect(rankText()).toMatch(/not submitted/i);
    expect(rankText()).not.toMatch(/offline/i);
  });

  it('shows the outcome, the total against the maximum, and every level', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1750, levelScores: [600, 450, 700] }, 'p1', replay);

    expect(document.querySelector('.results__outcome')?.textContent).toBe('Cake recovered');
    expect(document.querySelector('.results__score')?.textContent).toBe('1750');
    expect(document.querySelector('.results__of')?.textContent).toBe(`of ${MAX_TOTAL}`);
    expect([...document.querySelectorAll('.results__level-score')].map((e) => e.textContent))
      .toEqual(['600', '450', '700']);
  });

  it('names a loss as a loss', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'loss', total: 300, levelScores: [300, 0, 0] }, 'p1', replay);
    expect(document.querySelector('.results__outcome')?.textContent).toBe('The cake remains at large');
  });

  it('fetches the board only when it is opened', async () => {
    const fetchSpy = vi.fn(async (_url: string) => new Response(JSON.stringify([
      { rank: 1, displayName: 'Aurora', totalScore: 2300, outcome: 'win', isSelf: false },
      { rank: 2, displayName: 'Matthew', totalScore: 1800, outcome: 'win', isSelf: true },
    ]), { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchSpy);

    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1800, levelScores: [600, 500, 700] }, 'p1', replay);
    // A player who taps Play again should never have waited on a request
    // they did not ask for.
    expect(fetchSpy).not.toHaveBeenCalled();

    click('Leaderboard');
    await vi.waitFor(() => expect(document.querySelectorAll('.results__row').length).toBe(2));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(String(fetchSpy.mock.calls[0]?.[0])).toContain('playerId=p1');
    // Their own row is the one they came to find.
    const self = document.querySelector('.results__row--self');
    expect(self?.textContent).toContain('Matthew');
    expect(document.querySelectorAll('.results__row--self').length).toBe(1);
  });

  it('renders a player-supplied name as text, never as markup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { rank: 1, displayName: '<img src=x>', totalScore: 1, outcome: 'win', isSelf: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));

    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1, levelScores: [1, 0, 0] }, 'p1', replay);
    click('Leaderboard');
    await vi.waitFor(() => expect(document.querySelectorAll('.results__row').length).toBe(1));

    const name = document.querySelector('.results__name');
    expect(name?.textContent).toBe('<img src=x>');
    expect(name?.querySelector('img')).toBeNull();
  });

  it('says so plainly when the board cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1, levelScores: [1, 0, 0] }, null, replay);

    click('Leaderboard');
    await vi.waitFor(() => expect(document.querySelector('.results__empty')?.textContent)
      .toMatch(/could not reach/i));
  });

  it('replays from either pane', () => {
    const { screen, replay } = mount();
    screen.show({ outcome: 'win', total: 1, levelScores: [1, 0, 0] }, 'p1', replay);

    click('Play again');
    expect(replay).toHaveBeenCalledTimes(1);
  });
});

/**
 * The board, opened from the cover rather than from a result.
 *
 * Same pane, different way out: there is no score to go back to, so it
 * offers Close. Worth a test because the actions are rebuilt per use, and a
 * leftover "Play again" on the cover would start a run from a screen the
 * player opened to read.
 */
describe('ResultsScreen.showBoard', () => {
  beforeEach(() => {
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it('opens the board alone, with no result and no replay button', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([
      { rank: 1, displayName: 'Aurora', totalScore: 2300, outcome: 'win', isSelf: false },
    ]), { status: 200, headers: { 'content-type': 'application/json' } })));

    const { screen } = mount();
    screen.showBoard('p1');
    await vi.waitFor(() => expect(document.querySelectorAll('.results__row').length).toBe(1));

    // Scoped to the visible pane: the result pane still exists behind this
    // one, carrying its own buttons, and `[hidden]` only hides it visually.
    const pane = document.querySelector('.results__pane:not([hidden])');
    const labels = [...(pane?.querySelectorAll('.results__btn') ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(['Close']);
    expect(screen.isOpen).toBe(true);
  });

  it('closes back to whatever it was opened over', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]', {
      status: 200, headers: { 'content-type': 'application/json' },
    })));
    const onClose = vi.fn();

    const { screen } = mount();
    screen.showBoard(null, onClose);
    await vi.waitFor(() => expect(document.querySelector('.results__empty')?.textContent)
      .toMatch(/no runs yet/i));

    click('Close');
    expect(screen.isOpen).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
