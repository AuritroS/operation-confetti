/**
 * Entry routing.
 *
 * The campaign is the default. `?level=1` and `?level=2` open a single
 * level's standalone review page instead; level 3's lives at `/level3.html`
 * because it carries its own HUD markup until that is shared.
 *
 * `?tutorial=N` is different from `?level=N`: it opens the *campaign* at that
 * level with its tutorial sheet up, which is the only way to look at a sheet
 * without playing the levels before it. `?story=<id>` does the same for a
 * single comic panel.
 */
const params = new URLSearchParams(location.search);
const level = params.get('level');
if (params.has('tutorial') || params.has('story')) {
  void import('./campaign');
} else if (level === '1') {
  void import('./main');
} else if (level === '2') {
  void import('./level2');
} else {
  void import('./campaign');
}
