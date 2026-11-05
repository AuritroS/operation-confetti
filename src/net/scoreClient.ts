/**
 * Score submission client (design doc §8).
 *
 * The browser never holds a privileged key. Everything goes to the Worker on
 * the same origin, which validates and recomputes server-side.
 *
 * Offline behaviour: the run is persisted locally with its run ID and retried.
 * A rank is only shown once the server has accepted the run.
 */

const IDENTITY_KEY = 'oc.identity.v1';
const PENDING_KEY = 'oc.pending.v1';

export interface Identity {
  playerId: string;
  displayName: string;
}

export interface RunSubmission {
  runId: string;
  playerId: string;
  displayName: string;
  scoringVersion: number;
  outcome: 'win' | 'loss';
  levelScores: [number, number, number];
  events: unknown[];
  isTest: boolean;
}

export interface AcceptedRun {
  runId: string;
  totalScore: number;
  levelScores: [number, number, number];
  outcome: 'win' | 'loss';
  /**
   * The player's position, or null when the server stored the run but could
   * not read a rank back. Never synthesised here: a position the client made
   * up is one the player would repeat out loud.
   */
  rank: number | null;
  accepted: true;
}

/**
 * What became of a submission.
 *
 * Three outcomes, not two, because the UI has to say different things:
 * accepted has a rank, `queued` means offline and will retry on its own, and
 * `rejected` means the server refused the stream and retrying cannot help.
 * Collapsing the last two into one null is what made an invalid run look
 * like a network problem.
 */
export type SubmitResult =
  | { kind: 'accepted'; run: AcceptedRun }
  | { kind: 'rejected'; status: number; detail: string }
  | { kind: 'queued' };

function safeLocal<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export function loadIdentity(): Identity | null {
  return safeLocal(() => {
    const raw = localStorage.getItem(IDENTITY_KEY);
    return raw ? (JSON.parse(raw) as Identity) : null;
  }, null);
}

export function saveIdentity(id: Identity): void {
  safeLocal(() => localStorage.setItem(IDENTITY_KEY, JSON.stringify(id)), undefined);
}

/** 2-20 characters after trimming (§8). Returns null when invalid. */
export function normaliseDisplayName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 20 ? name : null;
}

/**
 * A v4-shaped UUID, always.
 *
 * The shape is not cosmetic: the Worker validates both `runId` and `playerId`
 * against a UUID pattern and answers 400 to anything else, and the column is
 * a Postgres `uuid`. The old fallback here returned `"mf3k9x-a7b2c1d4"`,
 * which meant that on any origin without `crypto.randomUUID` — notably plain
 * http, so `npm run dev:lan` and the tunnel — every submission failed with a
 * client error that looked like a server fault.
 *
 * `randomUUID` and `getRandomValues` both need a secure context; the last
 * branch does not. It is weaker entropy, used only where the alternative is
 * not submitting at all, and a collision costs one dropped run rather than a
 * corrupted row — the ID is the idempotency key, so a clash is ignored as a
 * duplicate.
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  // Version 4, variant 1, as the pattern the Worker matches expects.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20),
  ].join('-');
}

function readPending(): RunSubmission[] {
  return safeLocal(() => {
    const raw = localStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as RunSubmission[]) : [];
  }, []);
}

function writePending(runs: RunSubmission[]): void {
  safeLocal(() => localStorage.setItem(PENDING_KEY, JSON.stringify(runs)), undefined);
}

function queue(run: RunSubmission): void {
  const pending = readPending().filter((r) => r.runId !== run.runId);
  pending.push(run);
  writePending(pending);
}

function dequeue(runId: string): void {
  writePending(readPending().filter((r) => r.runId !== runId));
}

/**
 * Submit a run. Idempotent on `runId`: a retry of the same run produces one
 * stored result.
 *
 * The run is queued locally *before* the request, so a tab closed mid-flight
 * still has it to retry. It is dequeued on acceptance, and also on a 4xx —
 * the server has judged the stream invalid, and replaying it forever would
 * only mean every future boot starts with a request that cannot succeed.
 */
export async function submitRun(run: RunSubmission): Promise<SubmitResult> {
  queue(run);
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      // A 4xx means the server rejected it as invalid; retrying will not help.
      if (res.status >= 400 && res.status < 500) {
        dequeue(run.runId);
        return { kind: 'rejected', status: res.status, detail };
      }
      // A 5xx might be transient, so it stays queued.
      return { kind: 'queued' };
    }
    const accepted = (await res.json()) as AcceptedRun;
    dequeue(run.runId);
    return { kind: 'accepted', run: accepted };
  } catch {
    return { kind: 'queued' };
  }
}

/** Retry every queued run. Safe to call on load and on reconnect. */
export async function flushPending(): Promise<AcceptedRun[]> {
  const out: AcceptedRun[] = [];
  for (const run of readPending()) {
    const result = await submitRun(run);
    if (result.kind === 'accepted') out.push(result.run);
  }
  return out;
}

export function pendingCount(): number {
  return readPending().length;
}

export interface LeaderboardRow {
  rank: number;
  displayName: string;
  totalScore: number;
  outcome: 'win' | 'loss';
  isSelf: boolean;
}

export async function fetchLeaderboard(
  playerId: string | null,
  scope: 'overall' | '1' | '2' | '3' = 'overall',
): Promise<LeaderboardRow[]> {
  const params = new URLSearchParams({ scope });
  if (playerId) params.set('playerId', playerId);
  const res = await fetch(`/api/leaderboard?${params}`);
  if (!res.ok) throw new Error(`leaderboard ${res.status}`);
  return (await res.json()) as LeaderboardRow[];
}

export async function health(): Promise<{ ok: boolean; db: boolean; detail: string }> {
  try {
    const res = await fetch('/api/health');
    return (await res.json()) as { ok: boolean; db: boolean; detail: string };
  } catch (e) {
    return { ok: false, db: false, detail: String(e) };
  }
}
