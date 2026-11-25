import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same-origin setup: the SPA calls `/api/*`; in dev Vite forwards it to the
// PHP built-in server (`php -S 127.0.0.1:8080`), in production Apache serves
// both from one host, so no CORS anywhere.
// API_PORT moves the proxy target (the E2E run uses its own API on 8091 so it
// never stops the dev API on 8080); WEB_PORT moves the dev server off 5173.
const apiTarget = `http://127.0.0.1:${process.env.API_PORT || 8080}`;
const webPort = Number(process.env.WEB_PORT || 5173);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: webPort,
    strictPort: true,
    proxy: {
      '/api': apiTarget,
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': apiTarget,
    },
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          mantine: ['@mantine/core', '@mantine/hooks'],
          query: ['@tanstack/react-query'],
          router: ['react-router-dom'],
        },
      },
    },
  },
});
