import { defineConfig } from 'vitest/config';

/**
 * Vitest doesn't load .env into process.env, which the integration suite's
 * skipIf reads; without this those tests silently skip.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env: the integration suite skips itself.
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Fixed zone so DST assertions don't depend on the machine running them.
    env: { TZ: 'UTC' },
    coverage: {
      provider: 'v8',
      // The demo app and scripts/ are verified by building and by hand.
      include: ['src/**'],
      exclude: [
        // Re-export barrels and type-only files. Listed explicitly, not as
        // `**/index.ts`, because adapters/neon/index.ts is a real implementation.
        'src/index.ts',
        'src/adapters/index.ts',
        'src/auth/index.ts',
        'src/service/index.ts',
        'src/client/index.ts',
        'src/types.ts',

        // Covered by tests/neon.integration.test.ts against a real database.
        'src/adapters/neon/index.ts',

        // Third-party wiring (Better Auth config, Resend call), verified by
        // db:seed-admin and by hand rather than by mocking.
        'src/auth/create-auth.ts',
        'src/auth/email.ts',
      ],
    },
  },
});
