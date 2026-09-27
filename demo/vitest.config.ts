import { defineConfig } from 'vitest/config';

// Its own config so Vitest doesn't pick up the package's vitest.config.ts
// one level up, which imports from the root's node_modules.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
