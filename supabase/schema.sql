-- Operation Confetti schema (design doc §8)
-- Idempotent: safe to re-run.
--
-- Security model: no public access at all. Every read and write goes through
-- the Cloudflare Worker using the service-role key, which bypasses RLS. RLS is
-- enabled with no permissive policies so a leaked anon key grants nothing.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- runs ----
-- One row per completed attempt. `id` is the client-issued run ID and the
-- idempotency key: a retried submission resolves to this same row.
create table if not exists public.runs (
  id              uuid primary key,
  player_id       uuid not null,
  display_name    text not null,
  scoring_version integer not null,
  outcome         text not null,
  level1_score    integer not null,
  level2_score    integer not null,
  level3_score    integer not null,
  total_score     integer not null,
  is_test         boolean not null default false,
  events          jsonb not null,
  created_at      timestamptz not null default now(),

  constraint runs_outcome_chk      check (outcome in ('win', 'loss')),
  constraint runs_name_len_chk     check (char_length(btrim(display_name)) between 2 and 20),
  constraint runs_level1_chk       check (level1_score between 0 and 600),
  constraint runs_level2_chk       check (level2_score between 0 and 600),
  constraint runs_level3_chk       check (level3_score between 0 and 1100),
  constraint runs_total_chk        check (total_score between 0 and 2300),
  constraint runs_total_sum_chk    check (total_score = level1_score + level2_score + level3_score)
);

create index if not exists runs_player_idx on public.runs (player_id);
create index if not exists runs_board_idx  on public.runs (is_test, total_score desc, created_at asc);

alter table public.runs enable row level security;
-- Intentionally no policies: anon and authenticated roles get nothing.

-- ------------------------------------------------------- overall board ----
-- Best complete run per player. Both outcomes are eligible and ranking is by
-- score only, so a high-scoring loss can outrank a low-scoring win (§8).
-- Competition ranking (1, 2, 2, 4) via rank().
create or replace view public.leaderboard_overall as
with best as (
  select distinct on (player_id)
         id as run_id, player_id, display_name, total_score, outcome, created_at
  from public.runs
  where is_test = false
  -- Earliest achievement wins the tie-break for stable row ordering.
  order by player_id, total_score desc, created_at asc
)
select rank() over (order by total_score desc) as rank,
       run_id, player_id, display_name, total_score, outcome, created_at
from best;

create or replace view public.leaderboard_overall_test as
with best as (
  select distinct on (player_id)
         id as run_id, player_id, display_name, total_score, outcome, created_at
  from public.runs
  where is_test = true
  order by player_id, total_score desc, created_at asc
)
select rank() over (order by total_score desc) as rank,
       run_id, player_id, display_name, total_score, outcome, created_at
from best;

-- --------------------------------------------------------- level tabs ----
-- Personal level bests from completed runs, distinct from the overall run.
create or replace view public.leaderboard_level1 as
with best as (
  select distinct on (player_id) id as run_id, player_id, display_name,
         level1_score as score, outcome, created_at
  from public.runs where is_test = false
  order by player_id, level1_score desc, created_at asc
)
select rank() over (order by score desc) as rank, * from best;

create or replace view public.leaderboard_level2 as
with best as (
  select distinct on (player_id) id as run_id, player_id, display_name,
         level2_score as score, outcome, created_at
  from public.runs where is_test = false
  order by player_id, level2_score desc, created_at asc
)
select rank() over (order by score desc) as rank, * from best;

create or replace view public.leaderboard_level3 as
with best as (
  select distinct on (player_id) id as run_id, player_id, display_name,
         level3_score as score, outcome, created_at
  from public.runs where is_test = false
  order by player_id, level3_score desc, created_at asc
)
select rank() over (order by score desc) as rank, * from best;

-- Views inherit the base table's RLS, and no role but service_role may read.
revoke all on public.leaderboard_overall      from anon, authenticated;
revoke all on public.leaderboard_overall_test from anon, authenticated;
revoke all on public.leaderboard_level1       from anon, authenticated;
revoke all on public.leaderboard_level2       from anon, authenticated;
revoke all on public.leaderboard_level3       from anon, authenticated;
revoke all on public.runs                     from anon, authenticated;

-- --------------------------------------------------------- party reset ----
-- Clears only real runs, leaving test rows untouched (§12 Phase 5 gate).
create or replace function public.reset_party_scores()
returns bigint language plpgsql security definer as $$
declare removed bigint;
begin
  delete from public.runs where is_test = false;
  get diagnostics removed = row_count;
  return removed;
end;
$$;

revoke all on function public.reset_party_scores() from anon, authenticated;
