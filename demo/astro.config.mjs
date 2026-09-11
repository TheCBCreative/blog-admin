import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

// Load demo/.env into process.env before anything else runs. Astro/Vite's
// own env handling only guarantees import.meta.env for VITE_-prefixed vars —
// plain server-side process.env access (getAuth() in src/lib/auth.ts, read
// via the middleware on every request) needs it loaded explicitly, and this
// has to happen before that middleware is ever imported. Safe to skip
// silently if .env doesn't exist yet (e.g. before `npm run db:setup`).
try {
  process.loadEnvFile();
} catch {
  // No .env yet — fall through; downstream code reports the missing vars.
}

// Server output: the admin needs real sessions (better-auth) and live
// Postgres reads/writes, so pages can't be statically prerendered.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  server: { port: 4321 },
});