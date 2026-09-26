import { createBlogAuth, type BlogAuth } from '@thecbcreative/blog-admin/auth';

let _auth: BlogAuth | undefined;

/**
 * Singleton Better Auth instance for the demo. Sign-up stays closed; the demo
 * account is created by scripts/seed-demo.ts.
 */
export function getAuth(): BlogAuth {
  if (_auth) return _auth;

  const databaseUrl = process.env.DATABASE_URL;
  // BETTER_AUTH_URL includes the portfolio's subpath, but the proxy strips it
  // before requests arrive, and Better Auth would treat that path as its route
  // root. Passing only the origin keeps it on the default /api/auth.
  const publicUrl = process.env.BETTER_AUTH_URL ?? 'http://localhost:4321';
  const baseUrl = new URL(publicUrl).origin;
  const secret = process.env.BETTER_AUTH_SECRET;

  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set.');

  _auth = createBlogAuth({
    databaseUrl,
    baseUrl,
    secret,
    // Kept on: a public demo sees far more login attempts than a real admin.
    disableRateLimit: false,
  });

  return _auth;
}
