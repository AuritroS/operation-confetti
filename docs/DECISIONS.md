# Decisions

What was chosen, and the reason. The design docs beside this file have the
long versions.

**Scores are recomputed on the server.** The browser sends a run's event
stream, never a total. The Worker reduces it with the same function the
browser used, from the same source file, and stores that. Nobody can type a
number into the leaderboard because the leaderboard never accepts one.

**The game and its API share one origin.** The Worker serves the static
build and `/api` together, so there is no CORS surface and the database
credentials never leave Cloudflare's secret store.

**A level owns its simulation and nothing else.** No DOM, no loop, no HUD,
no knowledge of other levels. The campaign shell sequences the three, and
the seams between them are where the comic and the transitions live. It is
also what lets a level be opened alone at a review URL.

**Courses are authored in seconds.** An encounter is a lane, a time and an
assembly name; the collider derives from the assembly and the art from the
collider. When a level's speed changes, the geometry moves and the rhythm
stays.

**Visual changes ship with captures.** Headless Chromium drives the real
build through the real routes and writes screenshots at fixed points, so a
before-and-after is a sheet of frames rather than an opinion. The captures
prove layout and colour; frame rate and feel are judged on a phone.

**Generated art has a spending cap in code.** The image generator prices
every call from the API's usage report, keeps a ledger, and refuses to run
past the cap. The cap can be raised, but only on purpose.
