/**
 * Better Auth factory. The package owns the configuration so security defaults
 * are set once here rather than per client site.
 */

import { betterAuth } from 'better-auth';
import { Pool, types } from '@neondatabase/serverless';
import { createEmailSender } from './email.js';

/**
 * Parse Postgres bigint (int8, OID 20) as a number instead of the driver's
 * default string. Better Auth does arithmetic on rateLimit.lastRequest (a
 * bigint); as a string, `lastRequest + window` concatenates and the rate limit
 * never holds.
 *
 * Safe for epoch-millisecond timestamps. This is driver-global, so don't rely on
 * it for genuinely large bigints such as Snowflake IDs.
 */
types.setTypeParser(20, (value: string) => Number(value));

export interface BlogAuthConfig {
  /** Postgres connection string. Use the pooled Neon string. */
  databaseUrl: string;
  /** Public origin of the site, e.g. https://example.com */
  baseUrl: string;
  /** 32+ chars, high entropy. `openssl rand -base64 32`. */
  secret: string;
  /**
   * Allows sign-up. Default false; keep it false in production, or anyone who
   * finds /api/auth/sign-up/email can create an admin account. Only one-off
   * seed scripts enable it, to create the single admin.
   */
  allowSignUp?: boolean;
  /** Session lifetime in seconds. Default 7 days. */
  sessionMaxAge?: number;
  /** Turns rate limiting off. Local development only; never set in production. */
  disableRateLimit?: boolean;
  /**
   * Enables the forgot-password flow. Without it the endpoint stays inert and
   * recovery is manual, since a reset flow that can't deliver mail is worse than
   * none.
   */
  email?: {
    resendApiKey: string;
    /** Shown in the email body, e.g. "Acme Studio". */
    siteName: string;
    /** Override the default CB Creative sender. */
    from?: string;
  };
}

export type BlogAuth = ReturnType<typeof createBlogAuth>;

export function createBlogAuth(config: BlogAuthConfig) {
  if (!config.secret || config.secret.length < 32) {
    throw new Error('BETTER_AUTH_SECRET must be at least 32 characters.');
  }

  return betterAuth({
    // A pg-compatible Pool routes Better Auth through its built-in Kysely
    // adapter, which scripts/migrate-auth.ts depends on.
    database: new Pool({ connectionString: config.databaseUrl }),

    baseURL: config.baseUrl,
    secret: config.secret,

    emailAndPassword: {
      enabled: true,
      // Closed by default; see BlogAuthConfig.allowSignUp.
      disableSignUp: config.allowSignUp !== true,
      minPasswordLength: 12,
      // A reset often follows a leaked credential, so existing sessions must not
      // survive it.
      revokeSessionsOnPasswordReset: true,

      // Only wired when email is configured; otherwise the endpoint stays inert.
      ...(config.email
        ? {
            sendResetPassword: async ({ user, url }: { user: { email: string }; url: string }) => {
              const sender = createEmailSender({
                apiKey: config.email!.resendApiKey,
                from: config.email!.from,
                siteName: config.email!.siteName,
              });

              // Deliberately not awaited: awaiting makes response time depend on
              // whether the account exists, leaking that to anyone timing the
              // endpoint.
              void sender
                .sendPasswordReset({ to: user.email, url })
                .catch((err) => console.error('[auth] reset email failed:', err));
            },
          }
        : {}),
    },

    session: {
      expiresIn: config.sessionMaxAge ?? 60 * 60 * 24 * 7,
    },

    advanced: {
      // Better Auth sets HttpOnly and SameSite by default; this forces the
      // Secure flag even when a proxy makes the request look like plain HTTP.
      useSecureCookies: config.baseUrl.startsWith('https://'),

      ipAddress: {
        // Safe only because the Astro route handler overwrites this header with
        // ctx.clientAddress (a single platform-resolved value). A raw forwarded
        // chain would be spoofable: its leftmost entry is client-controlled.
        ipAddressHeaders: ['x-forwarded-for'],
      },
    },

    rateLimit: {
      // Explicit rather than Better Auth's production-only default, so dev
      // behaves the same and the limits can be tested.
      enabled: config.disableRateLimit !== true,

      window: 60,
      max: 100,

      // Database-backed: serverless invocations don't share memory, so
      // in-memory counters would reset constantly. Requires the rateLimit table
      // (npm run db:migrate-auth).
      storage: 'database',
      modelName: 'rateLimit',

      customRules: {
        // Matches Better Auth's default; stated explicitly because it's what
        // stands between the login form and a brute-forced admin password.
        '/sign-in/email': { window: 10, max: 3 },
        // Prevents using password reset to spray email.
        '/request-password-reset': { window: 60, max: 3 },
        // Takes the current password, so without a limit it's a brute-force
        // oracle for anyone holding a stolen session cookie.
        '/change-password': { window: 60, max: 5 },
      },
    },
  });
}
