// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushPending,
  newId,
  pendingCount,
  submitRun,
  type RunSubmission,
} from '../src/net/scoreClient';
import { SCORING_VERSION } from '../src/core/scoring';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const run = (): RunSubmission => ({
  runId: newId(),
  playerId: newId(),
  displayName: 'Matthew',
  scoringVersion: SCORING_VERSION,
  outcome: 'win',
  levelScores: [600, 600, 1100],
  events: [],
  isTest: false,
});

const respond = (status: number, body: unknown): void => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })));
};

describe('newId', () => {
  it('always produces a UUID the Worker will accept', () => {
    // The Worker answers 400 to any other shape, so a fallback that drifted
    // from this would fail every submission on a non-secure origin.
    for (let i = 0; i < 20; i++) expect(newId()).toMatch(UUID);
  });

  it('produces UUIDs without randomUUID available', () => {
    const real = crypto.randomUUID;
    // @ts-expect-error -- simulating a plain-http origin, where it is absent.
    crypto.randomUUID = undefined;
    try {
      const ids = new Set(Array.from({ length: 50 }, newId));
      for (const id of ids) expect(id).toMatch(UUID);
      expect(ids.size).toBe(50);
    } finally {
      crypto.randomUUID = real;
    }
  });
});

/**
 * The three ways a submission can end, and what each leaves in the queue.
 *
 * These were one `null` before, which is why an invalid run and a dead
 * network looked alike: the player was told they were offline when the server
 * had in fact refused the stream, and the run sat in the queue retrying
 * something that could never succeed.
 */
describe('submitRun', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('reports the server rank on acceptance and clears the queue', async () => {
    respond(200, { runId: 'x', totalScore: 2300, levelScores: [600, 600, 1100], outcome: 'win', rank: 3, accepted: true });
    const result = await submitRun(run());

    expect(result.kind).toBe('accepted');
    if (result.kind === 'accepted') expect(result.run.rank).toBe(3);
    expect(pendingCount()).toBe(0);
  });

  it('keeps a run queued when the network is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const result = await submitRun(run());

    expect(result.kind).toBe('queued');
    expect(pendingCount()).toBe(1);
  });

  it('keeps a run queued on a 5xx, which may be transient', async () => {
    respond(502, { error: 'store failed' });
    expect((await submitRun(run())).kind).toBe('queued');
    expect(pendingCount()).toBe(1);
  });

  it('drops a run the server rejected, rather than retrying it forever', async () => {
    respond(422, { error: 'event stream rejected', violations: ['victory with boss HP remaining'] });
    const result = await submitRun(run());

    expect(result.kind).toBe('rejected');
    if (result.kind === 'rejected') expect(result.status).toBe(422);
    expect(pendingCount()).toBe(0);
  });

  it('is idempotent on runId, so a retry does not queue the run twice', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    const once = run();
    await submitRun(once);
    await submitRun(once);
    expect(pendingCount()).toBe(1);
  });
});

describe('flushPending', () => {
  beforeEach(() => { localStorage.clear(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('uploads a run that was played offline and empties the queue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('offline'); }));
    await submitRun(run());
    expect(pendingCount()).toBe(1);

    respond(200, { runId: 'x', totalScore: 1200, levelScores: [400, 400, 400], outcome: 'win', rank: 7, accepted: true });
    const accepted = await flushPending();

    expect(accepted).toHaveLength(1);
    expect(accepted[0]?.rank).toBe(7);
    expect(pendingCount()).toBe(0);
  });

  it('does nothing and reports nothing when the queue is empty', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await flushPending()).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
