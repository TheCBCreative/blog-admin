import { defineConfig } from 'vitest/config';

/**
 * Load .env into process.env so the integration suite can see DATABASE_URL.
 *
 * Vitest exposes .env via import.meta.env but does NOT populate process.env,
 * which is what the skipIf guard reads. Without this the integration tests
 * silently skip — which in a summary line looks a lot like passing.
 *
 * process.loadEnvFile is built into Node 20.12+/22, so no dependency needed.
 */
try {
  process.loadEnvFile('.env');
} catch {
  // No .env present — fine, the integration suite skips itself by design.
}

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Fixed zone so DST assertions don't depend on the machine running them.
    env: { TZ: 'UTC' },
  },
});
