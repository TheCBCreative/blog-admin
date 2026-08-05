/**
 * Creates Better Auth's tables (user, session, account, verification).
 *
 *   npm run db:migrate-auth
 *
 * Uses Better Auth's programmatic migration API rather than `npx auth@latest
 * migrate`. The CLI has to locate and load an auth config file, and it can't
 * load ours — it fails with "couldn't read your auth config" because the config
 * imports TypeScript source. Running through tsx avoids that entirely.
 *
 * This keeps the auth schema owned by Better Auth rather than hand-copied into
 * a .sql file, so it stays correct across upgrades and plugin additions.
 *
 * Only works with the built-in Kysely adapter, which is what passing a Pool
 * gives us.
 */

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMigrations } from 'better-auth/db/migration';
import { createBlogAuth } from '../src/auth/create-auth';

const here = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // Handled below.
}

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

const auth = createBlogAuth({
  databaseUrl: DATABASE_URL,
  baseUrl: BETTER_AUTH_URL ?? 'http://localhost:4321',
  // Migrations only read the schema, so a placeholder satisfies the length check
  // when the real secret isn't set yet.
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
