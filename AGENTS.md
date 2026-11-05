# Parallel level development

Read `docs/COLLABORATION.md` before changing game code. It defines file ownership,
worktree setup, development ports, shared-change coordination and integration gates.
Read `design-level3.md` for the Level 3 proposal and staged build order.

- Claude owns the ongoing Level 2 work in the original checkout. Preserve its
  uncommitted changes; never stash, reset, clean, stage or commit another stream's work.
- Codex implements Level 3 only in its separate `codex/level3` worktree after setup
  succeeds. Planning documents may be prepared in the original checkout.
- Keep Level 3 simulation, rendering, UI, assets and tests in their owned paths.
  Shared modules are read-only during parallel implementation unless a specific
  change has an agreed owner and integration sequence.
- Simulation owns gameplay state, timings and collision geometry. Rendering reads
  snapshots and events; meshes and animation callbacks never determine damage.
- Preserve the user's stage order: verbs, asset selection, environment, interactive
  arena, then polish. Record evidence for each gate before expanding the next layer.
- Run dev servers on explicitly assigned ports with strict binding. Never stop
  another stream's process or silently fall back to a different port.
- Inspect the changed-file list before every commit. Commit only your own paths.
  Integrate shared routing and campaign transitions after both levels are stable.

These rules record the proposed collaboration boundary. They do not establish
that another agent has read or accepted it; acknowledge cross-stream changes
before relying on them.
