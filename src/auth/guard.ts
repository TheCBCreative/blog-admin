/**
 * Route protection, in two layers on purpose:
 *
 *   createAdminGuard  — Astro middleware; redirects unauthenticated page
 *                       requests to the login screen.
 *   requireSession    — called inside every API handler.
 *
 * The second is not redundant: guarding pages alone leaves a direct POST to the
 * form's endpoint open.
 */

import type { BlogAuth } from './create-auth.js';

export interface GuardOptions {
  auth: BlogAuth;
  /** Where to send unauthenticated users. Always treated as public. */
  loginPath?: string;
  /**
   * Prepended to the login redirect's Location only, never used to match
   * request paths. For deployments behind a proxy that strips a path prefix
   * before the request reaches this app.
   */
  publicPrefix?: string;
  /** Path prefixes requiring a session. */
  protectedPrefixes?: string[];
  /** Prefixes returning 401 JSON rather than redirecting. */
  apiPrefixes?: string[];
  /**
   * Extra paths under a protected prefix that must stay reachable without a
   * session. Added to the defaults, never replacing them, so setting this can't
   * lock out password recovery.
   */
  publicPaths?: string[];
}

const DEFAULTS = {
  loginPath: '/admin/login',
  protectedPrefixes: ['/admin'],
  apiPrefixes: ['/api/admin'],
};

/**
 * Auth pages under /admin that must work without a session. Someone resetting a
 * password has none, so guarding these would silently bounce them to login.
 */
const PUBLIC_AUTH_PATHS = ['/admin/forgot-password', '/admin/reset-password'];

/** Prefix match on a path segment boundary, so /adminsomething isn't matched. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Strips trailing slashes before comparing. Astro's trailingSlash setting
 * decides which form arrives, and an exact match on the other form would lock
 * users out of the public paths.
 */
function normalizePath(pathname: string): string {
  return pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
}

export interface SessionResult {
  user: unknown | null;
  session: unknown | null;
}

export async function getSession(auth: BlogAuth, request: Request): Promise<SessionResult> {
  try {
    const result = await auth.api.getSession({ headers: request.headers });
    return { user: result?.user ?? null, session: result?.session ?? null };
  } catch {
    // A malformed or tampered cookie reads as "not logged in", never as a 500
    // that leaks a stack trace.
    return { user: null, session: null };
  }
}

/**
 * Astro middleware factory. Populates locals.user / locals.session on every
 * request and blocks unauthenticated access to the protected prefixes.
 */
export function createAdminGuard(options: GuardOptions) {
  const loginPath = options.loginPath ?? DEFAULTS.loginPath;
  const protectedPrefixes = options.protectedPrefixes ?? DEFAULTS.protectedPrefixes;
  const apiPrefixes = options.apiPrefixes ?? DEFAULTS.apiPrefixes;

  const publicPaths = new Set(
    [loginPath, ...PUBLIC_AUTH_PATHS, ...(options.publicPaths ?? [])].map(normalizePath),
  );

  return async function onRequest(
    context: {
      request: Request;
      url: URL;
      locals: Record<string, unknown>;
      /**
       * Narrowed to redirect statuses, not `number`: parameters are
       * contravariant, so a wider type makes Astro's own `context.redirect`
       * unassignable here.
       */
      redirect: (path: string, status?: 301 | 302 | 303 | 307 | 308) => Response;
      /** Astro's APIContext.isPrerendered. Optional so non-Astro callers can omit it. */
      isPrerendered?: boolean;
    },
    next: () => Promise<Response>,
  ): Promise<Response> {
    const { pathname } = context.url;

    const isApi = apiPrefixes.some((p) => matchesPrefix(pathname, p));
    const isPage = protectedPrefixes.some((p) => matchesPrefix(pathname, p));

    // Pages only: an API path is never exempted.
    const isPublic = !isApi && publicPaths.has(normalizePath(pathname));

    // A prerendered route has no real request, so its session is always null
    // and Astro warns on reading its headers. Protected and API routes are
    // excluded explicitly so this can never wave one through.
    const skipSession = context.isPrerendered === true && !isApi && !isPage;

    const { user, session } = skipSession
      ? { user: null, session: null }
      : await getSession(options.auth, context.request);
    context.locals.user = user;
    context.locals.session = session;

    if (session || isPublic || (!isApi && !isPage)) {
      return next();
    }

    if (isApi) return unauthorizedResponse();

    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`${options.publicPrefix ?? ''}${loginPath}?next=${target}`, 302);
  };
}

export class UnauthorizedError extends Error {
  readonly status = 401;
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

/**
 * Independent session check for API handlers. Call it at the top of every
 * mutating endpoint; don't rely on middleware alone, whose matchers can drift
 * silently.
 */
export async function requireSession(auth: BlogAuth, request: Request): Promise<SessionResult> {
  const result = await getSession(auth, request);
  if (!result.session) throw new UnauthorizedError();
  return result;
}

/** Wraps a handler so an UnauthorizedError becomes a 401 instead of a 500. */
export function withAuth(
  auth: BlogAuth,
  handler: (ctx: { request: Request; session: SessionResult }) => Promise<Response>,
): (ctx: { request: Request }) => Promise<Response> {
  return async ({ request }) => {
    try {
      const session = await requireSession(auth, request);
      return await handler({ request, session });
    } catch (err) {
      if (err instanceof UnauthorizedError) return unauthorizedResponse();
      throw err;
    }
  };
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
