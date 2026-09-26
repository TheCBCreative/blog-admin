import { defineMiddleware } from 'astro:middleware';
import { createAdminGuard } from '@thecbcreative/blog-admin/auth';
import { BASE_PATH } from './lib/base-path';
import { getAuth } from './lib/auth';
import { getPostService } from './lib/store';
import { cleanupExpiredDemoPosts } from './lib/demo-cleanup';
import { resolveSandbox } from './lib/sandbox-store';

const guard = createAdminGuard({
  auth: getAuth(),
  loginPath: '/admin/login',
  protectedPrefixes: ['/admin'],
  apiPrefixes: ['/api/admin'],
  publicPrefix: BASE_PATH,
});

// Cleanup piggybacks on admin traffic, at most once per interval: there's no
// worker process, and Hobby-tier Vercel Cron only runs daily, which is too
// coarse for a multi-hour retention window.
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let nextCheckAt = 0;

function maybeCleanup(): void {
  const now = Date.now();
  if (now < nextCheckAt) return;
  nextCheckAt = now + CHECK_INTERVAL_MS;

  // Fire-and-forget so a cleanup failure never breaks the request.
  cleanupExpiredDemoPosts(getPostService(), new Date(now)).catch((err) => {
    console.error('[demo-cleanup] failed:', err);
  });
}

export const onRequest = defineMiddleware((context, next) => {
  if (context.url.pathname.startsWith('/admin') || context.url.pathname.startsWith('/api/admin')) {
    maybeCleanup();
    // Every admin request is scoped to a per-visitor sandbox (lib/sandbox.ts).
    context.locals.sandbox = resolveSandbox(context.cookies);
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
