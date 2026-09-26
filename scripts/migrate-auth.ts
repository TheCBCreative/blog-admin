/**
 * Creates Better Auth's tables (user, session, account, verification, and
 * rateLimit, since create-auth.ts uses database rate-limit storage).
 *
 *   npm run db:migrate-auth
 *
 * Uses Better Auth's programmatic migration API under tsx because the
 * `auth@latest migrate` CLI can't load a config that imports TypeScript source.
 * Keeps the auth schema owned by Better Auth rather than hand-copied into db/.
 * Requires the built-in Kysely adapter, which passing a Pool provides.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { createBlogAuth } from '../src/auth/create-auth';

const here = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // A missing DATABASE_URL is reported below.
}

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const auth = createBlogAuth({
  databaseUrl: DATABASE_URL,
  baseUrl: BETTER_AUTH_URL ?? 'http://localhost:4321',
  // Migrations only read the schema; the placeholder just passes the length check.
  secret: BETTER_AUTH_SECRET ?? 'x'.repeat(32),
});

const { toBeCreated, toBeAdded, runMigrations } = await getMigrations(auth.options);

const created = toBeCreated.map((t: { table: string }) => t.table);
const altered = toBeAdded.map((t: { table: string }) => t.table);

if (created.length === 0 && altered.length === 0) {
  console.log('Auth schema is already up to date.');
  process.exit(0);
}

if (created.length > 0) console.log(`creating: ${created.join(', ')}`);
if (altered.length > 0) console.log(`altering: ${altered.join(', ')}`);

await runMigrations();
console.log('\nAuth schema applied.');
process.exit(0);
