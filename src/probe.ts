// Asset selection is the default probe. Preserve the original animation
// harness at probe.html?characters for character/clip troubleshooting.
if (new URLSearchParams(location.search).has('characters')) {
  await import('./styles.css');
  await import('./probe-characters');
} else {
  await import('./probe-assets');
}
export {};
