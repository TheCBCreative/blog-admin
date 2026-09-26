import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

// Vite doesn't populate process.env from .env, and server code (getAuth(),
// imported by the middleware) reads process.env, so load it before anything
// else. A missing .env is reported later by the code that needs the vars.
try {
  process.loadEnvFile();
} catch {
  // No .env yet.
}

// Server output: the admin needs live sessions and database reads/writes.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
  server: { port: 4321 },
  // The package is a `file:..` symlink. Without this, Vite resolves its
  // imports from the real repo-root path, where demo/node_modules (and deps
  // like @neondatabase/serverless) isn't on the lookup path.
  vite: {
    resolve: {
      preserveSymlinks: true,
    },
  },
});