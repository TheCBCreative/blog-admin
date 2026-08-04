import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Fixed zone so DST assertions don't depend on the machine running them.
    env: { TZ: 'UTC' },
  },
});
