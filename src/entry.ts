/**
 * Entry routing.
 *
 * The campaign is the default. `?level=1` and `?level=2` open a single level's
 * standalone review page instead; level 3's lives at `/level3.html` because it
 * carries its own HUD markup until that is shared.
 */
const level = new URLSearchParams(location.search).get('level');
if (level === '1') {
  void import('./main');
} else if (level === '2') {
  void import('./level2');
} else {
  void import('./campaign');
}
