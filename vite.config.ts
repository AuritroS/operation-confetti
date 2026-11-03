import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (f: string) => fileURLToPath(new URL(f, import.meta.url));

/**
 * `npm run dev` binds loopback only, which is what `tailscale serve` proxies
 * to and what the Bash sandbox permits. Set HOST=0.0.0.0 to expose the server
 * on the LAN directly instead.
 */
const host = process.env['HOST'] ?? '127.0.0.1';

export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      input: {
        main: entry('./index.html'),
        probe: entry('./probe.html'),
      },
    },
  },
  server: {
    host,
    port: 5173,
    strictPort: true,
    // Accept the Host header Tailscale sends when serving the tailnet name.
    allowedHosts: ['.ts.net', 'localhost', '127.0.0.1'],
    proxy: {
      // Keeps dev routing identical to production, where the Worker owns /api.
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
