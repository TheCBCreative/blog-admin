/**
 * Better Auth factory.
 *
 * The package owns the configuration so security defaults are set once here
 * rather than re-decided per client site. Consumers pass a connection string and
 * a base URL and get a configured instance back.
 */

import { betterAuth } from 'better-auth';
import { Pool, types } from '@neondatabase/serverless';

/**
 * Return Postgres bigint (int8, OID 20) as a number rather than a string.
 *
 * ── The bug this fixes ──────────────────────────────────────────────────────
 * Better Auth's rateLimit table stores lastRequest as bigint. The driver returns
 * bigint as a string by default (correctly — int8 can exceed Number.MAX_SAFE_
 * INTEGER). Better Auth then does arithmetic on it, so `lastRequest + window`
 * concatenates instead of adding. Two consequences: X-Retry-After came back as a
 * nonsense 15-digit number, and the window check always looked expired, so the
 * limit triggered but never held — you could retry immediately.
 *
 * Coercing to Number is safe for this use: these are epoch-millisecond
 * timestamps, and Number stays exact until year ~287396. Do not rely on this if
 * a future table stores genuinely large bigints such as Snowflake IDs.
 */
types.setTypeParser(20, (value: string) => Number(value));

export interface BlogAuthConfig {
  /** Postgres connection string. Use the pooled Neon string. */
  databaseUrl: string;
  /** Public origin of the site, e.g. https://alpenglowaesthetique.com */
  baseUrl: string;
  /** 32+ chars, high entropy. `openssl rand -base64 32`. */
  secret: string;
  /**
   * Allows sign-up. Defaults to false and should stay false in production —
   * with it enabled, anyone who finds /api/auth/sign-up/email can create an
   * account on a client's admin. The seed script flips this on deliberately to
   * create the single admin, then it goes back off.
   */
  allowSignUp?: boolean;
  /** Session lifetime in seconds. Default 7 days. */
  sessionMaxAge?: number;
  /**
   * Turns rate limiting off. Only for local development where repeated failed
   * logins while testing are expected. Never set this in production.
   */
  disableRateLimit?: boolean;
}

export type BlogAuth = ReturnType<typeof createBlogAuth>;

export function createBlogAuth(config: BlogAuthConfig) {
  if (!config.secret || config.secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters.');
  }

  return betterAuth({
    // The Pool is the pg-compatible driver, which routes Better Auth through
    // its built-in Kysely adapter — that's what makes `npx auth@latest migrate`
    // able to create the auth tables directly.
    database: new Pool({ connectionString: config.databaseUrl }),

    baseURL: config.baseUrl,
    secret: config.secret,

    emailAndPassword: {
      enabled: true,
      // Closed by default. See the note on allowSignUp above.
      disableSignUp: config.allowSignUp !== true,
      minPasswordLength: 12,
      // A password reset here should kill every existing session — if the reset
      // is happening because a credential leaked, leaving old sessions alive
      // defeats the point.
      revokeSessionsOnPasswordReset: true,
    },

    session: {
      expiresIn: config.sessionMaxAge ?? 60 * 60 * 24 * 7,
    },

    advanced: {
      // Better Auth sets HttpOnly and SameSite by default; this forces the
      // Secure flag even when a proxy makes the request look like plain HTTP.
      useSecureCookies: config.baseUrl.startsWith('https://'),

      ipAddress: {
        /**
         * Single trusted header, not a forwarded chain.
         *
         * Better Auth deliberately distrusts comma-separated x-forwarded-for
         * values, because behind an appending proxy the leftmost token is
         * client-controlled and therefore spoofable. The Astro route handler
         * overwrites this header with ctx.clientAddress — a single value resolved
         * by the platform — so it's safe to read here.
         */
        ipAddressHeaders: ['x-forwarded-for'],
      },
    },

    rateLimit: {
      // Explicitly on rather than relying on the production-only default, so
      // the behaviour is the same in dev and can actually be tested.
      enabled: config.disableRateLimit !== true,

      window: 60,
      max: 100,

      /**
       * Database-backed, not the in-memory default.
       *
       * This is the part that matters on Vercel: serverless invocations don't
       * share memory, so in-memory counters reset constantly and the limit
       * becomes decorative. Requires the rateLimit table — run db:migrate-auth.
       */
      storage: 'database',
      modelName: 'rateLimit',

      customRules: {
        // Better Auth already defaults this to 3/10s. Stated explicitly because
        // it's the one limit standing between a leaked URL and a brute-forced
        // admin password, and it shouldn't be invisible in the config.
        '/sign-in/email': { window: 10, max: 3 },
        // Password reset can be used to spray email; same treatment.
        '/request-password-reset': { window: 60, max: 3 },
      },
    },
  });
}
