#!/usr/bin/env node
/** Build only the standalone Level 3 control review, outside the campaign build. */
import { build } from 'vite';

await build({
  configFile: false,
  root: process.cwd(),
  base: './',
  build: {
    target: 'es2022',
    outDir: '.local-tmp/level3-build',
    emptyOutDir: true,
    rollupOptions: { input: 'level3.html' },
  },
});
