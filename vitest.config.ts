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
    coverage: {
      provider: 'v8',
      // Only the package itself — the demo app and scripts/ are verified by
      // building and by hand, not by this suite, so counting them here would
      // just water the number down with files nothing here is meant to cover.
      include: ['src/**'],
      exclude: [
        // Pure re-export barrels and type-only files: no logic of their own
        // to miss. The functions they re-export are exercised directly (tests
        // import from e.g. src/core/link.js, not the barrel), so these would
        // otherwise show as 0% for lines nothing actually needed to run.
        // Listed explicitly rather than as `**/index.ts` — adapters/neon's
        // index.ts is the real adapter implementation, not a barrel, and
        // should stay counted.
        'src/index.ts',
        'src/adapters/index.ts',
        'src/auth/index.ts',
        'src/service/index.ts',
        'src/client/index.ts',
        'src/types.ts',

        // Verified by tests/neon.integration.test.ts against a real database
        // rather than by this unit suite — it skips itself without
        // DATABASE_URL, so counting it here would report real, untested rows
        // as a coverage gap in a suite that was never meant to catch them.
        'src/adapters/neon/index.ts',

        // Wiring, not logic: these hand a config object to betterAuth() and
        // make a fetch call to Resend. What's worth testing about them —
        // "does disableSignUp flip with allowSignUp", "does the reset email
        // actually arrive" — is exercised by db:seed-admin and by hand
        // against a real inbox, not by mocking two third-party libraries to
        // re-assert an object literal.
        'src/auth/create-auth.ts',
        'src/auth/email.ts',
      ],
    },
  },
});
