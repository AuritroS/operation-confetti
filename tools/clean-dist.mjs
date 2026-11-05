#!/usr/bin/env node
/**
 * Remove files that must never be published from the build output.
 *
 * Vite copies `public/` into `dist/` wholesale, with no exclude list, so
 * anything Finder leaves in there ships. A `.DS_Store` is not just clutter:
 * it lists the directory's entries, including files nothing links to, and
 * `wrangler deploy` served two of them at the site root.
 *
 * Deleting them from `public/` does not hold — Finder writes them back the
 * next time someone opens the folder — so the guard belongs here, after the
 * build and before the upload.
 */
import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const DROP = new Set(['.DS_Store', 'Thumbs.db', '.AppleDouble']);
const root = process.argv[2] ?? 'dist';

let removed = 0;
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (DROP.has(entry.name)) {
      rmSync(path, { recursive: true, force: true });
      removed++;
      console.log(`  dropped ${path}`);
    } else if (entry.isDirectory()) {
      walk(path);
    }
  }
};

walk(root);
if (removed > 0) console.log(`  ${removed} file(s) kept out of the deploy\n`);
