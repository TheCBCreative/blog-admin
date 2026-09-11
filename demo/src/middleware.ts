import { defineMiddleware } from 'astro:middleware';
import { createAdminGuard } from '@thecbcreative/blog-admin/auth';
import { getAuth } from './lib/auth';
import { getPostService } from './lib/store';
import { cleanupExpiredDemoPosts } from './lib/demo-cleanup';

const guard = createAdminGuard({
  auth: getAuth(),
  loginPath: '/admin/login',
  protectedPrefixes: ['/admin'],
  apiPrefixes: ['/api/admin'],
});

// Traffic-driven cleanup: the demo has no worker process, and a Hobby-tier
// Vercel Cron job can only fire once a day (see DEMO_DEPLOY.md), which is
// too coarse for a multi-hour retention window. Instead, piggyback a cheap
// check onto real admin traffic — it only does DB work once the in-memory
// timer below says a check is due, and only ever deletes posts older than
// DEMO_POST_MAX_AGE_HOURS that aren't tagged as seed placeholders.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let nextCheckAt = 0;

function maybeCleanup(): void {
  const now = Date.now();
  if (now < nextCheckAt) return;
  nextCheckAt = now + CHECK_INTERVAL_MS;

  // Fire-and-forget: never let a cleanup failure turn into a broken request.
  cleanupExpiredDemoPosts(getPostService(), new Date(now)).catch((err) => {
    console.error('[demo-cleanup] failed:', err);
  });
}

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname.startsWith('/admin') || context.url.pathname.startsWith('/api/admin')) {
    maybeCleanup();
  }

  return guard(
    {
      request: context.request,
      url: context.url,
      locals: context.locals as Record<string, unknown>,
      redirect: context.redirect,
      isPrerendered: context.isPrerendered,
    },
    next,
  );
});
