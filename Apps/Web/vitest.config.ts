import { defineConfig, mergeConfig } from 'vitest/config';

import viteConfig from './vite.config';

// Vitest would otherwise also sweep in the Playwright specs under e2e/.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      environment: 'jsdom',
    },
  }),
);
