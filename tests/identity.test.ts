// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { NameEntry } from '../src/ui/name-entry';
import { StoryPlayer } from '../src/ui/story';
import { BEATS } from '../src/story/script';
import { loadIdentity } from '../src/net/scoreClient';

/**
 * Name entry gates the cover's Start button.
 *
 * The rule the leaderboard depends on is that a run always carries a name the
 * server will also accept, and the way that is enforced is the Start button
 * staying disabled. These assert the gate from the outside — through the
 * panel, as a player meets it — because a `ready()` that returns false while
 * the button is still live is the failure that matters.
 */
const typeInto = (root: HTMLElement, value: string): void => {
  const input = root.querySelector<HTMLInputElement>('.name__input');
  if (!input) throw new Error('no name field');
  input.value = value;
  input.dispatchEvent(new Event('input'));
};

const nextButton = (): HTMLButtonElement => {
  const b = document.querySelector<HTMLButtonElement>('.story__next');
  if (!b) throw new Error('no next button');
  return b;
};

describe('NameEntry', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('blocks the panel until the name is valid, and never offers a skip past it', () => {
    const app = document.createElement('div');
    document.body.append(app);
    const story = new StoryPlayer(app);
    const name = new NameEntry();

    void story.show(BEATS.title, name);

    expect(nextButton().disabled).toBe(true);

    typeInto(name.node, 'A');
    expect(nextButton().disabled).toBe(true);
    expect(name.identity()).toBeNull();

    typeInto(name.node, 'Aurora');
    expect(nextButton().disabled).toBe(false);
    expect(name.identity()?.displayName).toBe('Aurora');

    // 21 characters: one past what the schema's CHECK constraint allows.
    typeInto(name.node, 'x'.repeat(21));
    expect(nextButton().disabled).toBe(true);
  });

  it('accepts the panel being closed and reopened without leaving a stale gate', () => {
    const app = document.createElement('div');
    document.body.append(app);
    const story = new StoryPlayer(app);
    const name = new NameEntry();

    const first = story.show(BEATS.title, name);
    typeInto(name.node, 'Matthew');
    nextButton().click();
    void first;

    // A panel with no slot must not inherit the previous one's disabled state.
    void story.show(BEATS.intro);
    expect(nextButton().disabled).toBe(false);
    expect(document.querySelectorAll('.name').length).toBe(0);
  });

  it('normalises whitespace the way the server does', () => {
    const name = new NameEntry();
    typeInto(name.node, '  Matthew   Mc Cake  ');
    expect(name.identity()?.displayName).toBe('Matthew Mc Cake');
  });

  it('keeps one player id across a rename, so replays stay one history', () => {
    const name = new NameEntry();
    typeInto(name.node, 'Matthew');
    const first = name.commit();
    expect(first).not.toBeNull();
    expect(loadIdentity()?.displayName).toBe('Matthew');

    typeInto(name.node, 'Matty');
    const second = name.commit();
    expect(second?.playerId).toBe(first?.playerId);
    expect(loadIdentity()?.displayName).toBe('Matty');
  });

  it('reuses a stored id and prefills the saved name on a return visit', () => {
    const first = new NameEntry();
    typeInto(first.node, 'Aurora');
    const saved = first.commit();

    const second = new NameEntry();
    const input = second.node.querySelector<HTMLInputElement>('.name__input');
    expect(input?.value).toBe('Aurora');
    // Already valid, so a returning player taps straight through.
    expect(second.ready()).toBe(true);
    expect(second.identity()?.playerId).toBe(saved?.playerId);
  });

  it('mints an id that the Worker will accept as a UUID', () => {
    const name = new NameEntry();
    typeInto(name.node, 'Matthew');
    // The Worker rejects anything that is not a v4-shaped UUID, so a fallback
    // id generator that produced some other shape would fail every
    // submission with a 400 and look like a server problem.
    expect(name.identity()?.playerId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });
});
