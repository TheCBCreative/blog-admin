import type { APIRoute } from 'astro';
import { getPostService } from '../../../lib/store';
import { cleanupExpiredDemoPosts } from '../../../lib/demo-cleanup';
import { json } from '../../../lib/http';

export const prerender = false;

/**
 * Optional scheduled backstop for visitor-post cleanup; the middleware already
 * runs it on admin traffic. Lives outside /api/admin because Vercel Cron can't
 * log in, so it's protected by an optional CRON_SECRET bearer token instead
 * (see DEMO_DEPLOY.md).
 */
export const GET: APIRoute = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const deleted = await cleanupExpiredDemoPosts(getPostService());
    return json({ ok: true, deleted });
  } catch (err) {
    console.error('[api/cron/cleanup] failed:', err);
    return json({ ok: false }, 500);
  }
};
