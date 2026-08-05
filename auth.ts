/**
 * Auth instance for tooling only.
 *
 * The Better Auth CLI (`npx auth@latest migrate|generate`) looks for a file
 * exporting an instance named `auth` — it can't work with a factory. This gives
 * it one, built from .env.
 *
 * Consuming projects should NOT import this. They call createBlogAuth() with
 * their own config. This file exists so the CLI can read the schema and so the
 * package can be exercised locally.
 */

// Extensionless on purpose: the Better Auth CLI's loader can't resolve a `.js`
// specifier that points at a `.ts` source file, and reports the failure as
// "couldn't read your auth config". Valid here because tsconfig uses
// moduleResolution: "bundler".
import { createBlogAuth } from './src/auth/create-auth';

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;

export const auth = createBlogAuth({
  databaseUrl: DATABASE_URL ?? '',
  baseUrl: BETTER_AUTH_URL ?? 'http://localhost:4321',
  // The CLI only needs the schema, not a working secret, so a placeholder keeps
  // it from throwing on the length check when env isn't loaded.
  secret: BETTER_AUTH_SECRET ?? 'x'.repeat(32),
});

export default auth;
