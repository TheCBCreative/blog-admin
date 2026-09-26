# Deploying the demo (Vercel + Neon)

The demo builds with Astro's Vercel adapter, which also serves `npm run dev` locally, so there's nothing to switch between local and production.

## 1. Create the Neon database

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (the one with `-pooler` in the hostname — Better Auth and the app both open short-lived connections, so pooling matters).
3. From your machine, run the migrations once:
   ```bash
   cd demo
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" \
   BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
     npm run db:setup
   ```
   Don't set `LOCAL_PG=true` here — that flag is only for the offline dev path in [`LOCAL_DEV.md`](./LOCAL_DEV.md).
4. Seed the demo data:
   ```bash
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" \
   BETTER_AUTH_SECRET="<same secret as above>" \
     npm run db:seed
   ```
   This creates the demo admin account (`demo@blogcomposer.dev` / `SeeTheDemo2026!`) and eight placeholder posts across every status. Re-running it resets every post to the placeholders.

## 2. Deploy

1. Connect the `blog-admin` repo to Vercel and set **Root Directory** to `demo`.
2. Set these Environment Variables:
   - `DATABASE_URL` — the pooled Neon connection string from step 1
   - `BETTER_AUTH_SECRET` — the same secret you used to seed
   - `BETTER_AUTH_URL` — the public URL visitors use (set it after the first deploy gives you one, then redeploy)
   - `PUBLIC_BASE_PATH` — only when the demo is served under a sub-path through a proxy, e.g. `/work/blog-composer/demo`
   - `DEMO_POST_MAX_AGE_HOURS` — optional, how long a visitor sandbox lasts (default 2)
   - `CRON_SECRET` — optional, see [Scheduled cleanup](#scheduled-cleanup)
3. Deploy.

The login credentials are shown on the login screen itself — it's a public demo account, so there's no harm in them being visible.

## Visitor sandboxes

Everyone who opens the demo signs in as the same account, so each browser gets its own sandbox (`src/lib/sandbox.ts`) to keep visitors from affecting each other:

- **Adding** a post or image: only that visitor sees it. Posts are tagged with the sandbox id; images live in their browser.
- **Editing** a placeholder post: saves the visitor's own copy. The original is never changed.
- **Deleting** a placeholder post or sample photo: hides it for that visitor only.

A sandbox lasts `DEMO_POST_MAX_AGE_HOURS` from the visitor's first visit. After that they get a fresh one, so coming back later shows the untouched placeholders.

Posts left behind by expired sandboxes are deleted automatically: `src/middleware.ts` checks at most every 5 minutes, on admin traffic, for visitor posts older than `DEMO_POST_MAX_AGE_HOURS`. Placeholders are never deleted.

### Scheduled cleanup

To also clean up during stretches with no traffic, point [Vercel Cron](https://vercel.com/docs/cron-jobs) at `GET /api/cron/cleanup`:

```json filename="vercel.json"
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 0 * * *" }]
}
```

Hobby-plan projects can run a cron job only once a day; hourly schedules need Pro. Set `CRON_SECRET` to a random 16+ character string to protect the route — Vercel sends it as `Authorization: Bearer <CRON_SECRET>` and the route rejects anything else. Without it the route is open.

## Media

Vercel doesn't let the app write files at runtime, so the Media Library keeps visitor uploads in the visitor's own browser (`src/lib/browser-media.ts`, IndexedDB), downscaled and stored as data URLs so they can be used as a featured image. They reset with the visitor's sandbox.

The server-side route (`/api/admin/media`, backed by `src/lib/media-store.ts`) writes to local disk and is what a real client deployment would replace with an S3/R2-backed `MediaStore`.

Five sample photos ship in `public/demo-media/`, with their alt text in `src/lib/demo-media.ts`. To change them, replace the files and update that list. They appear in the Media Library and in the composer's featured-image picker, which fills in the alt text.
