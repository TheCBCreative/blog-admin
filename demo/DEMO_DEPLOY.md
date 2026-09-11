# Deploying the demo (Vercel + Neon)

This demo runs on Astro's Node standalone adapter locally, which is what you want for local dev. For a public Vercel deployment, swap in the Vercel adapter — everything else (routes, API endpoints, React islands) stays the same.

## 1. Create the Neon database

1. Create a free project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (the one with `-pooler` in the hostname — better-auth and the app both open short-lived connections, so pooling matters).
3. From your machine, with that connection string as `DATABASE_URL`, run once:
   ```bash
   cd demo
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" \
   BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
     npm run db:setup
   ```
   This runs the core package's migrations plus better-auth's own schema migration against your new Neon database. (Do **not** set `LOCAL_PG=true` for this — that flag is only for the local-Postgres dev path described in the README.)
4. Seed the demo data the same way:
   ```bash
   DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require" \
   BETTER_AUTH_SECRET="<same secret as above>" \
     npm run db:seed
   ```
   This creates the demo admin account (`demo@blogcomposer.dev` / `SeeTheDemo2026!`) and eight sample posts across every status (published, scheduled, draft, archived).

## 2. Switch the adapter for Vercel

Edit `astro.config.mjs`:

```js
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [react()],
});
```

Then:

```bash
npm install @astrojs/vercel
npm uninstall @astrojs/node
```

(The Node standalone adapter is what makes `npm run dev`/`preview` work locally with no extra infra — keep using it for local work. Only the deployed build needs the Vercel adapter.)

## 3. Deploy

1. Push this `demo/` folder to a repo Vercel can see (or connect the existing `blog-admin` repo and set **Root Directory** to `demo` in the Vercel project settings).
2. In the Vercel project's Environment Variables, set:
   - `DATABASE_URL` — the same pooled Neon connection string from step 1
   - `BETTER_AUTH_SECRET` — the same secret you used to seed
   - `BETTER_AUTH_URL` — your Vercel deployment URL, e.g. `https://blog-composer-demo.vercel.app` (set this *after* the first deploy gives you the URL, then redeploy)
3. Deploy. Vercel will run `npm run build` with the Vercel adapter and serve it as serverless functions.

## Cleaning up visitor posts

Anyone who finds the demo can sign in (credentials are shown right on the login screen) and create posts. Two things keep that from turning into permanent clutter:

- **Placeholder posts never get deleted.** Everything `npm run db:seed` creates is tagged internally as a placeholder, and cleanup skips those posts no matter how old they get. The tag is never shown anywhere in the UI.
- **Visitor posts expire automatically.** Any other post is deleted once it's older than `DEMO_POST_MAX_AGE_HOURS` (default 2 hours — set it in your Vercel project's Environment Variables to change it). This runs opportunistically: `src/middleware.ts` checks (at most once every 5 minutes) on real admin traffic whether anything is overdue, and deletes it. No separate worker or cron job is required for this to work.

If you want a stricter, schedule-driven backstop independent of traffic — so posts get cleaned up even during a stretch with zero admin visits — there's an optional `GET /api/cron/cleanup` route you can wire up to [Vercel Cron](https://vercel.com/docs/cron-jobs):

```json filename="vercel.json"
{
  "crons": [{ "path": "/api/cron/cleanup", "schedule": "0 * * * *" }]
}
```

A couple of things worth knowing before you do:

- **Hobby-plan projects can only run a cron job once a day**, with up to ~59 minutes of scheduling slop (e.g. `0 8 * * *` can fire any time in the 8am hour) — a per-hour schedule like the one above requires the Pro plan. On Hobby, use something like `"schedule": "0 0 * * *"` instead; the traffic-driven cleanup in middleware.ts is what actually keeps the retention window tight in between.
- Set `CRON_SECRET` in your Environment Variables (a random 16+ character string) to protect the route — Vercel automatically sends it back as `Authorization: Bearer <CRON_SECRET>` on every cron invocation, and the route checks for that exact header. Leave `CRON_SECRET` unset and the route stays open (fine for a single low-value demo endpoint, but set it if that's a concern).

## Known limitation: media uploads

The media library writes uploaded files to local disk (`public/uploads/`) — that's fine for local dev, but Vercel's filesystem is ephemeral and read-only at runtime, so uploads won't persist between deploys or even between function invocations. For a real deployment you'd swap `src/lib/media-store.ts` for an S3/R2-backed implementation (same interface, different backend) before uploads would actually work in production. The demo is otherwise fully functional on Vercel — this only affects the media library screen.

## Logging back in later

If you come back to a deployed demo and forget the credentials, they're also shown directly on the login screen (`demo@blogcomposer.dev` / `SeeTheDemo2026!`) — it's a public demo account, not a real one, so there's no harm in it being visible.
