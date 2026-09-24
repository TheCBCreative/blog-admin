import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

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
  adapter: vercel(),
  integrations: [react()],
  server: { port: 4321 },
  // The demo depends on the package via `file:..`, which npm installs as a
  // symlink. Vite resolves symlinks to their real path by default, so an
  // import inside the linked package's source (e.g. src/adapters/neon)
  // gets resolved from the *real* repo-root location rather than from
  // inside demo/node_modules — which means demo's own node_modules (where
  // its dependencies, like @neondatabase/serverless, actually live) is
  // never in the ancestor chain Node's resolver walks. Turning off symlink
  // resolution keeps resolution anchored inside demo/node_modules instead.
  vite: {
    resolve: {
      preserveSymlinks: true,
    },
  },
});