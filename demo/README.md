# Blog Composer — live demo

A real, working instance of `@thecbcreative/blog-admin`, wired up end to end: Astro pages with React islands for the interactive screens (login, dashboard, post list, composer, media library), a real Postgres database via Neon, and real better-auth sessions. Nothing here is mocked — the data really lives in a database and every action really persists.

This folder is a separate app that depends on the parent package as a local dependency (`"@thecbcreative/blog-admin": "file:.."`), so it exercises the exact same public API a real client-site integration would use.

## Quick start (recommended: a free Neon dev database)

The simplest way to run this locally is the same way the main package itself is developed: point it at a real Neon Postgres database. Neon's free tier is enough.

1. Create a Neon project (or a branch of an existing one) at [neon.tech](https://neon.tech) and copy its pooled connection string.
2. Copy `.env.example` to `.env` and fill in:
   ```
   DATABASE_URL=<your pooled Neon connection string>
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=http://localhost:4321
   ```
   Leave `LOCAL_PG` unset/false.
3. Install and set up:
   ```bash
   npm install
   npm run db:setup   # runs the package's migrations + better-auth's schema migration
   npm run db:seed    # creates the demo admin + 8 sample posts across every status
   npm run dev
   ```
4. Visit `http://localhost:4321/admin/login`. Credentials are shown on the login screen itself (`demo@blogcomposer.dev` / `SeeTheDemo2026!`).

## Alternative: fully offline local Postgres

If you'd rather not create a Neon project just to develop locally, see [`LOCAL_DEV.md`](./LOCAL_DEV.md) for running against a plain local Postgres instead — set `LOCAL_PG=true` and follow the steps there. This path exists purely for offline convenience; it is not how the app runs in production.

## What's real vs. what's a demo shortcut

- **Real**: the database schema, the auth flow (password hashing, sessions, cookies), all the validation and status logic from the core package, the React components and the API routes.
- **Demo shortcuts**:
  - Sign-up is disabled everywhere except the one-time seed script — this is a single-admin demo.
  - Every visitor signs in as the same account, so each browser gets a private sandbox that resets after a couple of hours (see [`DEMO_DEPLOY.md`](./DEMO_DEPLOY.md#visitor-sandboxes)).
  - Uploaded images stay in the visitor's browser rather than object storage.

## Tests

```bash
npm test   # the visitor sandbox logic
```

## Deploying

See [`DEMO_DEPLOY.md`](./DEMO_DEPLOY.md) for Vercel + Neon deployment steps and the required environment variables.
