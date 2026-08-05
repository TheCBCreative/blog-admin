/**
 * Better Auth factory.
 *
 * The package owns the configuration so security defaults are set once here
 * rather than re-decided per client site. Consumers pass a connection string and
 * a base URL and get a configured instance back.
 */

import { betterAuth } from 'better-auth';
import { Pool } from '@neondatabase/serverless';

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
    },

    // NOTE: Better Auth ships built-in rate limiting, but verify the current
    // config shape against the docs before relying on it — an unthrottled login
    // endpoint is brute-forceable, and a single admin password is the whole
    // security boundary here.
    // https://www.better-auth.com/docs/concepts/rate-limit
  });
}
