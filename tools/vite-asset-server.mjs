/**
 * Dev-only Vite plugin backing the asset gallery.
 *
 * Serves the raw CC0 source packs under /asset-src and routes /assets to the
 * gallery page.
 *
 * The packs are 42 MB, so they are deliberately NOT copied into public/: that
 * would put all of it into `dist` and inflate the deployed game from 2.9 MB to
 * nearly 45 MB. Streaming them straight off disk in dev keeps the gallery a
 * development tool and the shipped build unchanged.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain; charset=utf-8',
};

export function assetServer({ root = 'assets', prefix = '/asset-src/' } = {}) {
  const base = resolve(root);

  return {
    name: 'operation-confetti:asset-server',
    apply: 'serve',

    configureServer(server) {
      // /assets and /assets/ both land on the gallery, so the path the user
      // was told about works in dev exactly as it does through the Worker.
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/assets' || req.url === '/assets/') req.url = '/assets.html';
        next();
      });

      // The index lives outside public/ so it never lands in `dist`; serve it
      // here at the path the gallery fetches.
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/asset-index.json') return next();
        const file = resolve('.asset-index.json');
        if (!existsSync(file)) {
          res.statusCode = 404;
          return res.end('{"error":"run: npm run assets:index"}');
        }
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', 'no-store');
        return createReadStream(file).pipe(res);
      });

      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith(prefix)) return next();

        const relative = decodeURIComponent(req.url.slice(prefix.length).split('?')[0] ?? '');
        const target = resolve(join(base, normalize(relative)));

        // Containment check: never serve outside the pack directory.
        if (target !== base && !target.startsWith(base + sep)) {
          res.statusCode = 403;
          return res.end('forbidden');
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          res.statusCode = 404;
          return res.end('not found');
        }

        res.setHeader('content-type', MIME[extname(target).toLowerCase()] ?? 'application/octet-stream');
        res.setHeader('content-length', String(statSync(target).size));
        // Source packs are pinned and immutable, so caching is safe and makes
        // browsing 120 models feel instant on a second pass.
        res.setHeader('cache-control', 'public, max-age=3600');
        createReadStream(target).pipe(res);
      });
    },
  };
}
