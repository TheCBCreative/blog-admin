/**
 * Applies every .sql file in db/ in filename order.
 *
 *   npm run db:migrate
 *
 * Uses the WebSocket Client, not the HTTP `neon()` helper: HTTP runs one
 * statement per call, and the plpgsql function in 001_init.sql has semicolons
 * inside $$ … $$, so the file can't be split on them.
 *
 * Every statement is idempotent, so re-running is safe. Deliberately not a
 * migration tracker; revisit if db/ grows.
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
  // A missing DATABASE_URL is reported below.
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

/**
 * Retries because Neon's free tier autosuspends, so the first connection after
 * idle can drop mid-handshake.
 */
async function connect(attempt = 1) {
  const client = new Client(url);
  // Without a listener, a dropped socket crashes with an unhandled 'error' event.
  client.on('error', (err) => {
    console.error(`\ndatabase connection error: ${err.message}`);
  });

  try {
    await client.connect();
    return client;
  } catch (err) {
    await client.end().catch(() => {});
    if (attempt >= 3) throw err;
    const waitMs = attempt * 1500;
    console.log(`connection failed, retrying in ${waitMs}ms (attempt ${attempt + 1}/3)…`);
    await new Promise((r) => setTimeout(r, waitMs));
    return connect(attempt + 1);
  }
}

const client = await connect();

try {
  for (const file of files) {
    const sql = await readFile(join(dbDir, file), 'utf8');
    process.stdout.write(`applying ${file} … `);
    await client.query(sql);
    console.log('ok');
  }

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
