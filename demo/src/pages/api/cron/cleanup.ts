import type { APIRoute } from 'astro';
import { getPostService } from '../../../lib/store';
import { cleanupExpiredDemoPosts } from '../../../lib/demo-cleanup';

export const prerender = false;

/**
 * Optional, schedule-driven backstop for visitor-post cleanup — the demo
 * doesn't need this wired up, since middleware.ts already runs the same
 * cleanup opportunistically on real admin traffic. This exists for anyone
 * who wants a stricter, traffic-independent guarantee via Vercel Cron.
 *
 * Deliberately outside /api/admin, since Vercel Cron can't complete a login
 * flow — protected instead by an optional CRON_SECRET bearer token, matching
 * Vercel's own convention (see DEMO_DEPLOY.md).
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${secret}`) {
      return new Response('Unauthorized', { status: 401 });
    }
  }

  try {
    const deleted = await cleanupExpiredDemoPosts(getPostService());
    return new Response(JSON.stringify({ ok: true, deleted }), {
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    console.error('[api/cron/cleanup] failed:', err);
    return new Response(JSON.stringify({ ok: false }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    });
  }
};
