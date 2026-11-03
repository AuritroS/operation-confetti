/**
 * Cloudflare Worker: static asset host + score API (design doc §8).
 *
 * The game and its API share one origin, so there is no CORS surface and the
 * Supabase service-role key stays server-side. Scores are always recomputed
 * here from the submitted event stream; the client's own totals are ignored.
 */
import { SCORING_VERSION, scoreRun, type RunEvent } from '../src/core/scoring';

export interface Env {
  ASSETS: Fetcher;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SCORING_VERSION: string;
}

const MAX_BODY_BYTES = 64 * 1024;
const MAX_EVENTS = 400;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (e) {
        console.error('api error', e);
        return json({ error: 'internal' }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  switch (`${request.method} ${url.pathname}`) {
    case 'GET /api/health':
      return handleHealth(env);
    case 'POST /api/run':
      return handleSubmit(request, env);
    case 'GET /api/leaderboard':
      return handleLeaderboard(env, url);
    default:
      return json({ error: 'not found' }, 404);
  }
}

// ---- health ------------------------------------------------------------

async function handleHealth(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return json({ ok: true, db: false, detail: 'supabase secrets not configured' });
  }
  try {
    const res = await sb(env, 'runs?select=id&limit=1', { method: 'GET' });
    const detail = res.ok ? 'reachable' : `supabase ${res.status}: ${await res.text()}`;
    return json({ ok: true, db: res.ok, detail, scoringVersion: SCORING_VERSION });
  } catch (e) {
    return json({ ok: true, db: false, detail: String(e) });
  }
}

// ---- submission --------------------------------------------------------

interface SubmitBody {
  runId?: unknown;
  playerId?: unknown;
  displayName?: unknown;
  scoringVersion?: unknown;
  outcome?: unknown;
  events?: unknown;
  isTest?: unknown;
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return json({ error: 'body too large' }, 413);

  let body: SubmitBody;
  try {
    body = JSON.parse(raw) as SubmitBody;
  } catch {
    return json({ error: 'invalid json' }, 400);
  }

  const runId = asUuid(body.runId);
  const playerId = asUuid(body.playerId);
  if (!runId) return json({ error: 'invalid runId' }, 400);
  if (!playerId) return json({ error: 'invalid playerId' }, 400);

  const displayName = asDisplayName(body.displayName);
  if (!displayName) return json({ error: 'invalid displayName' }, 400);

  if (Number(body.scoringVersion) !== SCORING_VERSION) {
    return json({ error: 'scoring version mismatch', expected: SCORING_VERSION }, 409);
  }

  if (!Array.isArray(body.events) || body.events.length > MAX_EVENTS) {
    return json({ error: 'invalid events' }, 400);
  }

  const events = body.events as RunEvent[];
  // Authoritative recompute. The client's claimed scores are never trusted.
  const result = scoreRun(events);

  if (result.violations.length > 0) {
    return json({ error: 'event stream rejected', violations: result.violations }, 422);
  }
  if (result.outcome === 'incomplete') {
    return json({ error: 'run did not reach an outcome' }, 422);
  }
  if (body.outcome !== result.outcome) {
    return json({ error: 'outcome mismatch', computed: result.outcome }, 422);
  }

  const row = {
    id: runId,
    player_id: playerId,
    display_name: displayName,
    scoring_version: SCORING_VERSION,
    outcome: result.outcome,
    level1_score: result.levelScores[0],
    level2_score: result.levelScores[1],
    level3_score: result.levelScores[2],
    total_score: result.total,
    is_test: body.isTest === true,
    events,
  };

  // Idempotent on the primary key: a retried run resolves to one stored row.
  const res = await sb(env, 'runs?on_conflict=id', {
    method: 'POST',
    headers: {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  });

  if (!res.ok && res.status !== 409) {
    return json({ error: 'store failed', detail: await res.text() }, 502);
  }

  const rank = await rankFor(env, runId, row.is_test);

  return json({
    runId,
    totalScore: result.total,
    levelScores: result.levelScores,
    outcome: result.outcome,
    rank,
    accepted: true,
  });
}

async function rankFor(env: Env, runId: string, isTest: boolean): Promise<number | null> {
  const view = isTest ? 'leaderboard_overall_test' : 'leaderboard_overall';
  const res = await sb(env, `${view}?select=rank&run_id=eq.${runId}&limit=1`, { method: 'GET' });
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ rank: number }>;
  return rows[0]?.rank ?? null;
}

// ---- leaderboard -------------------------------------------------------

async function handleLeaderboard(env: Env, url: URL): Promise<Response> {
  const scope = url.searchParams.get('scope') ?? 'overall';
  const playerId = asUuid(url.searchParams.get('playerId'));
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50) || 50, 200);

  const view =
    scope === 'overall'
      ? 'leaderboard_overall'
      : scope === '1' || scope === '2' || scope === '3'
        ? `leaderboard_level${scope}`
        : null;

  if (!view) return json({ error: 'invalid scope' }, 400);

  const res = await sb(env, `${view}?select=*&order=rank.asc&limit=${limit}`, { method: 'GET' });
  if (!res.ok) return json({ error: 'query failed', detail: await res.text() }, 502);

  const rows = (await res.json()) as Array<Record<string, unknown>>;
  return json(
    rows.map((r) => ({
      rank: r['rank'],
      displayName: r['display_name'],
      totalScore: r['total_score'] ?? r['score'],
      outcome: r['outcome'],
      isSelf: playerId !== null && r['player_id'] === playerId,
    })),
  );
}

// ---- helpers -----------------------------------------------------------

function sb(env: Env, path: string, init: RequestInit): Promise<Response> {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json',
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function asUuid(v: unknown): string | null {
  return typeof v === 'string' && UUID_RE.test(v) ? v.toLowerCase() : null;
}

/** 2-20 characters after trimming, stored as plain text (§8). */
function asDisplayName(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const name = v.trim().replace(/\s+/g, ' ');
  return name.length >= 2 && name.length <= 20 ? name : null;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
