/**
 * Auth instance for tooling only. The Better Auth CLI needs a file exporting an
 * instance named `auth`, not a factory. Consuming projects should NOT import
 * this; they call createBlogAuth() with their own config.
 */

// Extensionless on purpose: the Better Auth CLI's loader can't resolve a `.js`
// specifier pointing at a `.ts` source ("couldn't read your auth config").
import { createBlogAuth } from './src/auth/create-auth';

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;

export const auth = createBlogAuth({
  databaseUrl: DATABASE_URL ?? '',
  baseUrl: BETTER_AUTH_URL ?? 'http://localhost:4321',
  // The CLI only reads the schema; the placeholder just passes the length check.
  secret: BETTER_AUTH_SECRET ?? 'x'.repeat(32),
});

export default auth;
