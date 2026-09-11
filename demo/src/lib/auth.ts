import { createBlogAuth, type BlogAuth } from '@thecbcreative/blog-admin/auth';

let _auth: BlogAuth | undefined;

/**
 * Singleton Better Auth instance for the demo.
 *
 * Sign-up stays closed (the package default) — the demo account is created
 * once by scripts/seed-demo.ts, exactly like a real client site's admin.
 */
export function getAuth(): BlogAuth {
  if (_auth) return _auth;

  const databaseUrl = process.env.DATABASE_URL;
  const baseUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set.');

  _auth = createBlogAuth({
    databaseUrl,
    baseUrl,
    secret,
    // A public demo gets hit by more retries than a real single-admin site
    // (people testing the rate limit itself), so this stays on rather than
    // being disabled for convenience.
    disableRateLimit: false,
  });

  return _auth;
}
