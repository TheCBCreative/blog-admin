/**
 * Route protection.
 *
 * Two layers on purpose:
 *
 *   createAdminGuard  — Astro middleware. Redirects unauthenticated page
 *                       requests to the login screen.
 *   requireSession    — called inside every API handler.
 *
 * The second is not redundant. Guarding pages while leaving handlers open is
 * the most common version of this bug: the form is behind a login, but a direct
 * POST to the endpoint that form submits to isn't.
 */

import type { BlogAuth } from './create-auth.js';

export interface GuardOptions {
  auth: BlogAuth;
  /** Where to send unauthenticated users. Always treated as public. */
  loginPath?: string;
  /** Path prefixes requiring a session. */
  protectedPrefixes?: string[];
  /** Prefixes returning 401 JSON rather than redirecting. */
  apiPrefixes?: string[];
  /**
   * Extra paths under a protected prefix that must stay reachable without a
   * session. Added to the defaults rather than replacing them, so a consumer
   * can't accidentally lock out password recovery by setting this.
   */
  publicPaths?: string[];
}

const DEFAULTS = {
  loginPath: '/admin/login',
  protectedPrefixes: ['/admin'],
  apiPrefixes: ['/api/admin'],
};

/**
 * Auth pages that live under /admin but cannot require a session.
 *
 * Password recovery is the obvious case and easy to miss: someone resetting a
 * password has no session by definition, so protecting these paths silently
 * redirects them to the login page and the flow appears to do nothing.
 */
const PUBLIC_AUTH_PATHS = ['/admin/forgot-password', '/admin/reset-password'];

/** Prefix match on a path segment boundary, so /adminsomething isn't matched. */
function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Trailing slashes are normalised away before comparing.
 *
 * Astro's trailingSlash setting decides whether a request arrives as
 * /admin/login or /admin/login/, and an exact string match against one form
 * silently fails on the other — which would re-introduce the same lockout this
 * list exists to prevent.
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
    // A malformed or tampered cookie should read as "not logged in", never as an
    // unhandled 500 that leaks a stack trace.
    return { user: null, session: null };
  }
}

/**
 * Astro middleware factory.
 *
 * Populates locals.user / locals.session on every request so pages can read
 * them, and blocks unauthenticated access to the protected prefixes.
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
      redirect: (path: string, status?: number) => Response;
    },
    next: () => Promise<Response>,
  ): Promise<Response> {
    const { pathname } = context.url;

    const isApi = apiPrefixes.some((p) => matchesPrefix(pathname, p));
    const isPage = protectedPrefixes.some((p) => matchesPrefix(pathname, p));

    // Login and the password-recovery pages live under /admin but can't require
    // a session. Pages only — an API path is never exempted here.
    const isPublic = !isApi && publicPaths.has(normalizePath(pathname));

    const { user, session } = await getSession(options.auth, context.request);
    context.locals.user = user;
    context.locals.session = session;

    if (session || isPublic || (!isApi && !isPage)) {
      return next();
    }

    if (isApi) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }

    // Preserve where they were headed so login can bounce them back.
    const target = encodeURIComponent(pathname + context.url.search);
    return context.redirect(`${loginPath}?next=${target}`, 302);
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
 * Independent session check for API handlers.
 *
 * Call this at the top of every mutating endpoint. Do not rely on middleware
 * alone — middleware config drifts, route matchers get edited, and the failure
 * mode is silent.
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
      if (err instanceof UnauthorizedError) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw err;
    }
  };
}
