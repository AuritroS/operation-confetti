# Operation Confetti

A short portrait-only browser game for Matthew's birthday. Guests scan a QR
code, enter a display name, play three levels, and land on a leaderboard.

Design doc: [`design.md`](./design.md) · Settled tech spec: [`docs/TECH_SPEC.md`](./docs/TECH_SPEC.md)

- **Stack:** Vite + TypeScript + Three.js, plain HTML/CSS overlays
- **Hosting:** Cloudflare Worker serving static assets *and* the score API,
  on `operation-confetti.auritro.com`
- **Data:** Supabase Postgres, reached only from the Worker

---

## First-time setup

```bash
# 1. Dependencies
npm install

# 2. Secrets
cp .env.example .env            # fill in SUPABASE_DB_PASSWORD + the API keys
cp .dev.vars.example .dev.vars  # fill in SUPABASE_SERVICE_ROLE_KEY

# 3. Database
npm run db:push                 # applies supabase/schema.sql
npm run db:check                # confirms tables exist

# 4. Stage runtime assets into public/
npm run assets:build
```

`.env`, `.dev.vars` and `supabase.txt` are gitignored. The service-role key
belongs only in `.dev.vars` and in `wrangler secret`; it must never reach the
browser bundle.

## Daily development

```bash
npm run worker:dev   # terminal 1 — Worker + API on :8787
npm run dev          # terminal 2 — Vite on :5173, proxies /api to the Worker
```

Open `http://localhost:5173` for the game and `/probe.html` for the asset
harness. Vite listens on all interfaces, so a phone on the same Wi-Fi can load
the printed LAN address — which is how portrait sizing and touch actually get
tested.

Keyboard equivalents for desktop work: arrows or `A`/`D` to change lane,
`Space` to hold (level 2) or shoot (level 3).

## Checks

```bash
npm run typecheck        # tsc, no emit
npm test                 # scoring, lane and gesture checks
npm run assets:inspect   # real GLB metrics: triangles, clips, attachments
```

## Deploy

```bash
wrangler login
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
npm run deploy
```

The custom domain in `wrangler.toml` requires `auritro.com` to be an active
zone on the same Cloudflare account; Wrangler creates the DNS record.

## Layout

```
src/core/      loop, input recogniser, lanes, lifecycle, scoring (pure)
src/render/    renderer and camera
src/assets/    manifest (pinned versions + clip map), character loader
src/ui/        HUD and overlays
src/net/       score client with offline retry
worker/        Cloudflare Worker: static host + /api
supabase/      schema.sql
tools/         asset inspection, asset staging, db push
tests/         focused automated checks
assets/        pinned CC0 source packs (committed on purpose)
```

## Licensing

All three source packs are CC0: KayKit Adventurers 2.0, KayKit City Builder
Bits 1.0, Kenney Blaster Kit 2.1. Attribution is optional but intended —
"Kay Lousberg (kaylousberg.com)" and "Kenney (kenney.nl)". The `License.txt`
of each pack is kept in place under `assets/`.
