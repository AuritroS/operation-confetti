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
  rank: number;
  accepted: true;
}

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

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
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
 * stored result. Resolves to null when the server could not be reached, in
 * which case the run is queued for retry.
 */
export async function submitRun(run: RunSubmission): Promise<AcceptedRun | null> {
  queue(run);
  try {
    const res = await fetch('/api/run', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(run),
    });
    if (!res.ok) {
      // A 4xx means the server rejected it as invalid; retrying will not help.
      if (res.status >= 400 && res.status < 500) dequeue(run.runId);
      return null;
    }
    const accepted = (await res.json()) as AcceptedRun;
    dequeue(run.runId);
    return accepted;
  } catch {
    return null;
  }
}

/** Retry every queued run. Safe to call on load and on reconnect. */
export async function flushPending(): Promise<AcceptedRun[]> {
  const out: AcceptedRun[] = [];
  for (const run of readPending()) {
    const accepted = await submitRun(run);
    if (accepted) out.push(accepted);
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
