# Running against a local Postgres instead of Neon

The recommended local setup (see `README.md`) is to point `DATABASE_URL` at a real, free Neon project — that's the least moving parts, and it's how the main package itself is developed. Use this path only if you want to develop fully offline with no Neon account at all.

## Why this needs a WebSocket relay

`@neondatabase/serverless` (the driver better-auth and the package's real adapter both use) talks to Neon over two different protocols depending on which part of it you use:

- better-auth's own database connection uses the driver's `Pool`/`Client` classes, which speak Postgres wire protocol over a **WebSocket**.
- The package's Neon adapter (`createNeonPostStoreFromUrl`) uses the driver's `neon()` tagged-template function, which speaks Neon's proprietary **HTTP** query protocol.

A plain local Postgres only understands the raw TCP wire protocol — it doesn't speak WebSocket or Neon's HTTP protocol at all. So:

- **better-auth's `Pool` connection** can reach local Postgres if something bridges WebSocket ↔ TCP in between. Neon publishes exactly this as [`wsproxy`](https://github.com/neondatabase/wsproxy), a small Go binary, distributed as a Docker image at `ghcr.io/neondatabase/wsproxy`.
- **The HTTP-mode `neon()` driver** has no local equivalent — there's no way to make plain Postgres answer Neon's HTTP protocol. That's why this demo ships a separate `createLocalPgPostStore` (`src/lib/local-pg-store.ts`) implementing the identical `PostStore` interface with plain parameterized queries instead. It's selected automatically when `LOCAL_PG=true`.

## Setup

1. Install and run Postgres locally (Postgres.app, Docker, `brew install postgresql`, whatever you already use). Create a database, e.g. `blogadmin_demo`.

2. Run Neon's official `wsproxy` against it:
   ```bash
   docker run -d --name neon-wsproxy --network host \
     ghcr.io/neondatabase/wsproxy:latest \
     -listen 0.0.0.0:5433 -allow-addr-regexp '.*'
   ```
   (`--network host` lets it reach `localhost:5432`; adjust if your Postgres isn't on the default port.)

3. Set these in `demo/.env`:
   ```
   DATABASE_URL=postgresql://<user>:<password>@localhost:5432/blogadmin_demo
   BETTER_AUTH_SECRET=any-32-plus-character-string-for-local-dev
   BETTER_AUTH_URL=http://localhost:4321
   LOCAL_PG=true
   LOCAL_WS_RELAY=localhost:5433
   ```

4. Because `astro dev` is a long-running process and better-auth's `Pool` connection is created once at startup, the relay redirect (`scripts/local-neon-shim.mjs`) has to be loaded **before** anything imports `@neondatabase/serverless` — including before Astro itself boots. Run dev with it preloaded:
   ```bash
   NODE_OPTIONS="--import ./scripts/local-neon-shim.mjs" npm run dev
   ```
   The `db:setup` and `db:seed` scripts already do this correctly (they run via `tsx --import ./scripts/local-neon-shim.mjs`) — it's only the interactive `astro dev`/`astro preview` commands that need the environment variable set explicitly, since `astro`'s own CLI is what spawns the actual server process.

5. Run setup and seed exactly as in the README, then `NODE_OPTIONS=... npm run dev` as above.

## A note on this being genuinely optional

None of this — the relay, the local Postgres adapter, `LOCAL_PG` — exists in the deployed app. Production always uses the real Neon adapter and a real pooled Neon connection string, identical to how the main `blog-admin` package itself runs. This whole file only matters if you specifically want to avoid touching Neon during local development.
