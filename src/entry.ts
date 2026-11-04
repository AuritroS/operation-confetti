/** Review entries stay separate. Level 1's controller and content are frozen. */
const level = new URLSearchParams(location.search).get('level');
if (level === '1') {
  void import('./main');
} else {
  void import('./level2');
}
