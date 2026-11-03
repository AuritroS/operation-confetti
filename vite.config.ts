import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const entry = (f: string) => fileURLToPath(new URL(f, import.meta.url));

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
    host: true,
    port: 5173,
    // Proxy /api to the local Worker so dev routing matches production.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8787', changeOrigin: true },
    },
  },
});
