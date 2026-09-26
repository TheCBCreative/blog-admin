/**
 * Creates the single admin account.
 *
 *   npm run db:seed-admin -- admin@example.com
 *
 * Sign-up is disabled at runtime, so this uses a short-lived auth instance with
 * sign-up enabled; nothing long-lived ever has it on. The password is generated
 * here, not passed as an argument, so it never lands in shell history.
 */

import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlogAuth } from '../src/auth/create-auth.js';

const here = dirname(fileURLToPath(import.meta.url));

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // Missing variables are reported below.
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

// URL-safe, 32 chars; meant for a password manager, not memory.
const password = randomBytes(24).toString('base64url');

const auth = createBlogAuth({
  databaseUrl: DATABASE_URL!,
  baseUrl: BETTER_AUTH_URL!,
  secret: BETTER_AUTH_SECRET!,
  // Deliberately enabled for this process only.
  allowSignUp: true,
});

// Check Better Auth's tables exist first; otherwise a missing schema surfaces
// as an unrelated sign-up error.
const { Client } = await import('@neondatabase/serverless');
const probe = new Client(DATABASE_URL!);

// Without a listener, a dropped socket or auth rejection crashes with an
// unhandled 'error' event instead of the Postgres message.
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
    console.error('  npm run db:migrate-auth\n');
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

  // Always print the real error; the pattern match below is only a hint and
  // can misclassify.
  console.error('Failed to create the admin account.\n');
  console.error(`  ${message}\n`);

  if (/already.*(exist|registered)|duplicate key|unique constraint/i.test(message)) {
    console.error(`It looks like an account already exists for ${email}.`);
    console.error('Use the password reset flow rather than seeding again.');
  }

  process.exit(1);
}

process.exit(0);
