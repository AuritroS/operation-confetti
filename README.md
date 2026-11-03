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

Three pages in dev:

| Path | What it is |
|---|---|
| `/` | the game |
| `/assets` | asset gallery — browse all 120 models, pick the ones to use |
| `/probe.html` | character harness — play any clip, attach props |

The gallery needs an index first:

```bash
npm run assets:index   # writes .asset-index.json
```

It is a **development tool only**. The source packs are 42 MB, so they are
streamed off disk by a dev-only Vite plugin rather than copied into `public/`,
which would inflate the deployed game from 2.9 MB to nearly 45 MB. `/assets`
is therefore not part of `npm run build`.

### Desktop controls

| Key | Action |
|---|---|
| `←` `→` or `A` `D` | Move one lane |
| `Space` | Tap (short press) or hold/release (level 2 grapple) |
| `P` or `Esc` | Pause / resume |
| `R` | Restart the run |

`W`, `S` and the vertical arrows are claimed so the page cannot scroll, but do
nothing — no level has a forward or backward axis. Gameplay keys are ignored
while a text field has focus, so name entry types normally.

### Testing on a phone

`npm run dev` binds loopback only. To reach it from your phone, serve it over
your tailnet:

```bash
npm run dev            # terminal 1
npm run tunnel         # terminal 2 — prints the https://<host>.ts.net URL
npm run tunnel -- off  # tear down when finished
```

This goes over **HTTPS on purpose**, not the raw `100.x` address: a plain
`http://` origin is not a secure context, so `crypto.randomUUID` — which mints
run and player IDs — is undefined there and the phone test would diverge from
production. `tailscale serve` terminates TLS with a real cert for the tailnet
name. It needs MagicDNS and HTTPS certificates enabled in the Tailscale admin
console (DNS section).

`npm run dev:lan` binds `0.0.0.0` instead, if you would rather use the plain
LAN address and accept the insecure-context caveat.

## Checks

```bash
npm run typecheck        # tsc, no emit
npm test                 # scoring, lane and gesture checks
npm run assets:inspect   # real GLB metrics: triangles, clips, attachments
```

Current measured cold transfer, pre-compression: **2.9 MB** — 1.9 MB
characters and animation libraries, 428 KB story panels, 604 KB JS/CSS
(≈140 KB gzipped). Targets are 5 MB total and 500 KB compressed JS/CSS.

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
tools/         asset inspection, asset staging, stripping, db push, tunnel
tests/         focused automated checks
assets/        pinned CC0 source packs (committed on purpose)
```

## Licensing

All three source packs are CC0: KayKit Adventurers 2.0, KayKit City Builder
Bits 1.0, Kenney Blaster Kit 2.1. Attribution is optional but intended —
"Kay Lousberg (kaylousberg.com)" and "Kenney (kenney.nl)". The `License.txt`
of each pack is kept in place under `assets/`.
