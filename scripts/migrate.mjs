/**
 * Applies every .sql file in db/ in filename order.
 *
 *   npm run db:migrate
 *
 * Uses the WebSocket Client rather than the HTTP `neon()` helper on purpose:
 * the HTTP driver runs one statement per call, and 001_init.sql contains a
 * plpgsql function whose body has its own semicolons inside $$ … $$. Splitting
 * the file on semicolons would tear that function in half, so the whole file
 * goes over a connection that accepts multi-statement SQL.
 *
 * Every statement is idempotent (IF NOT EXISTS / OR REPLACE), so re-running is
 * safe. This is deliberately not a migration *tracker* — at one schema file
 * that would be more machinery than the problem deserves. Revisit if db/ grows.
 */

import { readFile, readdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));
const dbDir = join(here, '..', 'db');

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // Fall through to the check below with a clearer message.
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set. Add it to .env:\n');
  console.error("  echo \"DATABASE_URL='postgresql://…'\" > .env\n");
  process.exit(1);
}

const files = (await readdir(dbDir)).filter((f) => f.endsWith('.sql')).sort();

if (files.length === 0) {
  console.error(`No .sql files found in ${dbDir}`);
  process.exit(1);
}

const client = new Client(url);
await client.connect();

try {
  for (const file of files) {
    const sql = await readFile(join(dbDir, file), 'utf8');
    process.stdout.write(`applying ${file} … `);
    await client.query(sql);
    console.log('ok');
  }

  // Confirm the result rather than trusting a silent success.
  const { rows } = await client.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'posts'
    ORDER BY ordinal_position
  `);

  if (rows.length === 0) {
    console.error('\nposts table not found after migrating — something went wrong.');
    process.exit(1);
  }

  console.log(`\nposts table has ${rows.length} columns:`);
  console.log('  ' + rows.map((r) => r.column_name).join(', '));
} finally {
  await client.end();
}
