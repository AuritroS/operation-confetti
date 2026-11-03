import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Default to node; files needing a DOM opt in with
    // `// @vitest-environment jsdom` at the top.
    environment: 'node',
  },
});
