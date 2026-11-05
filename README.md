# Operation Confetti

A short portrait-only browser game for Matthew's birthday. Guests scan a QR
code, enter a display name, play three levels, and land on a leaderboard.

Design doc: [`design.md`](./design.md) · Settled tech spec: [`docs/TECH_SPEC.md`](./docs/TECH_SPEC.md)

- **Stack:** Vite + TypeScript + Three.js, plain HTML/CSS overlays
- **Hosting:** Cloudflare Worker serving static assets *and* the score API,
  on `operation-confetti.auritro.com`
- **Data:** Supabase Postgres, reached only from the Worker

## Current review: level 2 — swipe, swing and run

The game opens in **Skyline Chase** at `/` (also `/?level=2`). Level 1 is
frozen at `/?level=1`; its gameplay, visuals and shared input are unchanged.

**Swipe left/right** to move one lane, **up to swing**, and **down to run**.
Desktop: **arrow keys or WASD**. The first swipe starts the course. Two quick
sideways swipes cross both lanes without waiting in the middle. A new swipe
can redirect a transition; current position, velocity and acceleration are
preserved. Taps, holds and key repeat are inert. Each stroke triggers one
dominant-axis action after 28 CSS pixels; ambiguous diagonals wait for a clear axis.

Running and swinging are available in **all three lanes**. Sideways movement
preserves the selected mode; up/down preserves the lane. Running persists
until an up-swipe, which leaps into an automatic swing. Down attaches a low
anchor and blends into a landing and run. An up-swipe beneath/near an overhead
obstruction is remembered: the HUD shows “Swing selected” and launch starts
after clearance. A down-swipe cancels that pending launch.

The **45-second** course teaches one archetype at a time, then commits: a
bridge that can only be run under, a barricade that can only be swung over,
and a closing stretch mixing lane and height choices. Four scored gifts
(+100 each) plus completion (+200) make 600.

The street is built from **Kenney City Kit Roads 2.2** (CC0) — road, bridge,
barriers, cones, hanging signs and the power cables the player grapples —
over a **KayKit** canyon, with level 1's sky and CN Tower reused for
continuity. Review affordances: `?clean` hides the debug panel, `?debug`
shows it, `?closeup` pulls the camera in, `?level=1` opens the frozen level.

Run `npm run check:swing` for the automated end-to-end review: real touch
gestures over six viewports, the full 600-point route, two-second warnings on
every hazard, and the 60,000-triangle / 60-draw budget.
A primitive articulated character demonstrates reaching, banking, landing,
running and launch; final character and city art remain future work.

`npm run check:route` now generates the review swipes from the scene-derived
course and verifies them with the production runner. The browser check drives
that generated schedule and derives its expected score and clearance scenario
from the current course. The solver also reports sampled input-timing tolerance;
failure to find a route is not proof that a course is impossible. See
[`docs/ROUTE_SOLVER.md`](./docs/ROUTE_SOLVER.md) for the checks and their limits.

There is one unscored teaching gift and four scored gifts, distributed across
all three lanes, with obstacles ahead of each choice. A verified safe route
collects all four for **600 points**. Gifts give +100, hits deduct 50, and
completion gives +200. A hit causes recoil and one second of protection;
travel and lane controls continue. The old freeze-and-reattach flow is removed.

**Replay / R** restarts; **P** pauses; **I** toggles debug (`?debug` starts with
it visible). Returning to the tab does not automatically resume. A fresh
swipe resumes and applies that direction. The bottom lane/mode indicators
are read-only, so swipes can begin over them too.

Implementation is isolated in `src/levels/skyline/`, `src/core/skyline-swipe-input.ts`,
`src/render/skyline-scene.ts`, `src/render/skyline-camera.ts` and `src/level2.ts`.
The earlier planar and hold-controlled implementations and tests have been removed.

`npm run check:swing` checks real touch/keyboard input, mid-transfer changes,
ground entry/exit, remembered launches, damage, pause, replay, six viewport sizes, a 600-point course
and the level 1 entry. It uses Playwright request interception and needs no
running web server. Screenshots are in `tools/shots/level2-swipes-*.png`.
Run the test suite and production build for the current validation results;
actual phone frame rate remains an on-device review item.

Before removal, the old prototype passed 174 tests and a production build.
The environment denied Git index writes, so a checkpoint commit could not be
created. Its 19 changed/new files are preserved in
[`checkpoints/level2-hold-2026-11-04.tar.gz`](./checkpoints/level2-hold-2026-11-04.tar.gz),
with file hashes and base commit `4be7b94` in the adjacent JSON manifest. The
archive was read back and byte-compared before replacing any source files.
See [`design-level2.md`](./design-level2.md) for the design and review history.

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

Review pages in dev:

| Path | What it is |
|---|---|
| `/` | the game |
| `/assets` | asset gallery — browse all 120 models, pick the ones to use |
| `/probe.html` | Level 2 asset review — rotate current assets, approve or mark for removal |
| `/probe.html?characters` | original character harness — play any clip, attach props |

The gallery needs an index first:

```bash
npm run assets:index   # writes .asset-index.json
```

The Level 2 probe reads the current scene and obstacle builders. Its Preview
selector shows obstacle parts in their assembled form. Approval/removal choices
are saved in the current browser; **Copy choices** produces a list to send back
for application to the scene. Marking a removal does not hide live gameplay art
or leave its collider behind. `?asset=barrier` (for example) links to an item.

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

### Headless visual check

```bash
npm run shoot -- http://127.0.0.1:5173/?clean --out game --wait 3500
```

Loads the page in headless Chromium, captures a screenshot to `tools/shots/`,
and reports the HUD, the debug panel, every console error, whether the page
scrolls, and whether anything full-screen and interactive sits above the input
surface — the bug class that once made the game unresponsive on a phone for
two rounds.

`?clean` hides the debug panel so the shot shows only what a player sees.

Two constraints worth knowing. It passes `--single-process`: Chromium's
multi-process model registers a Mach bootstrap port to rendezvous with its
renderers, and the Bash sandbox denies `bootstrap_check_in`, so the browser
dies at launch without it. And it renders through SwiftShader, which is a real
WebGL 2.0 context but not a phone GPU — this catches breakage, never feel.

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
