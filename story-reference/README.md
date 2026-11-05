# Story reference plates

Renders of the assets the comic has to depict, taken from the shipped build.

Regenerate with `node tools/story-reference.mjs`. They are committed rather
than ignored because their whole purpose is to be handed to someone drawing
the panels, so they have to survive a clean checkout.

These are shape, colour and proportion references. They are software
rasterised on a flat plate with even light, so they are **not** a reference
for the game's lighting or mood — for that, see `tools/shots/campaign/`,
which photographs each level through the real gameplay camera.

## What the panels must match

- **Matthew** is the unhooded Rogue with grafted curls. **No hood, no bandit
  mask.** Navy and gold. The storyboard says he wears glasses; the model has
  none, and he is seen from behind for almost the whole game, so the comic
  may draw them and the model will catch up later if there is time.
- **Aurora** wears the **crown**, not the mage hat — the hat is hidden at
  runtime. Purple and gold.
- **The gates** carry a **gift emblem**, not a bandit mask. Both level 1 and
  level 2 end at one.
- **The gifts differ by level**: levels 1 and 2 collect the *yellow* present,
  level 3 the *blue* one. `present.png` is the yellow one.
- **Two weapons, not one**: the grapple blaster (level 2) and the confetti
  cannon (level 3). Both gold.

## Plates

| File | Shows |
| --- | --- |
| `matthew-front/-three-quarter/-back` | The player character, unarmed |
| `matthew-with-grapple-blaster` | Level 2 loadout, as mounted in-game |
| `matthew-with-confetti-cannon` | Level 3 loadout, as mounted in-game |
| `aurora-front/-three-quarter` | The antagonist, crowned |
| `cake` | The stolen cake |
| `present` | The scored collectible (levels 1 and 2) |
| `grapple-blaster`, `confetti-cannon` | The two weapons alone |
| `gate-vault-door` | A gate, with its gift emblem |
| `gift-emblem` | The emblem alone |
| `cn-tower`, `moon` | The two motifs carried across all three levels |
