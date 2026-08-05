/**
 * Creates the single admin account.
 *
 *   npm run db:seed-admin -- admin@example.com
 *
 * Why this exists: runtime config sets disableSignUp, so there is no API path to
 * the first user — which is the point. This builds a throwaway auth instance
 * with sign-up enabled, creates exactly one account, and exits. Nothing
 * long-lived ever has sign-up on.
 *
 * The password is generated here rather than passed as an argument so it never
 * lands in shell history. It's printed once and not stored.
 */

import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlogAuth } from '../src/auth/create-auth.js';

const here = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // Handled by the checks below.
}

const email = process.argv[2];
if (!email || !email.includes('@')) {
  console.error('Usage: npm run db:seed-admin -- admin@example.com');
  process.exit(1);
}

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL } = process.env;

const missing = Object.entries({ DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL })
  .filter(([, v]) => !v)
  .map(([k]) => k);

if (missing.length > 0) {
  console.error(`Missing in .env: ${missing.join(', ')}`);
  console.error('\nGenerate a secret with: openssl rand -base64 32');
  process.exit(1);
}

// URL-safe, ~32 chars. Long because nobody memorizes it — it goes straight
// into a password manager.
const password = randomBytes(24).toString('base64url');

const auth = createBlogAuth({
  databaseUrl: DATABASE_URL!,
  baseUrl: BETTER_AUTH_URL!,
  secret: BETTER_AUTH_SECRET!,
  // Deliberately enabled for this process only.
  allowSignUp: true,
});

// Preflight: confirm Better Auth's tables exist before attempting a sign-up.
// Without this, a missing-schema error surfaces as something unrelated.
const { Client } = await import('@neondatabase/serverless');
const probe = new Client(DATABASE_URL!);

// Without an error listener, a dropped socket or auth rejection emits an
// unhandled 'error' event and crashes with an event-emitter trace rather than
// the actual Postgres message.
probe.on('error', (err: Error) => {
  console.error(`\ndatabase error: ${err.message}`);
});

try {
  await probe.connect();
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nCould not connect to the database: ${message}\n`);
  if (/password authentication failed/i.test(message)) {
    console.error('The credentials in .env are stale. Get a fresh pooled string:');
    console.error('  npx neonctl@latest connection-string --project-id <id> --pooled\n');
  }
  process.exit(1);
}

try {
  const { rows } = await probe.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('user', 'session', 'account', 'verification')
  `);
  const found = rows.map((r: { table_name: string }) => r.table_name);
  const required = ['user', 'session', 'account'];
  const absent = required.filter((t) => !found.includes(t));

  if (absent.length > 0) {
    console.error(`Better Auth tables missing: ${absent.join(', ')}\n`);
    console.error('Create them first:');
    console.error(`  DATABASE_URL='${'<your url>'}' npx auth@latest migrate\n`);
    process.exit(1);
  }
} finally {
  await probe.end();
}

try {
  await auth.api.signUpEmail({ body: { name: 'Admin', email, password } });

  console.log('\nAdmin account created.\n');
  console.log(`  email:    ${email}`);
  console.log(`  password: ${password}\n`);
  console.log('Save this in a password manager now — it is not stored anywhere and');
  console.log('cannot be recovered.\n');
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);

  // Print the real error first, always. An earlier version of this script
  // pattern-matched the message to guess at the cause and mislabelled a
  // missing-table error as "account already exists" — misleading beats verbose.
  console.error('Failed to create the admin account.\n');
  console.error(`  ${message}\n`);

  if (/already.*(exist|registered)|duplicate key|unique constraint/i.test(message)) {
    console.error(`It looks like an account already exists for ${email}.`);
    console.error('Use the password reset flow rather than seeding again.');
  }

  process.exit(1);
}

process.exit(0);
