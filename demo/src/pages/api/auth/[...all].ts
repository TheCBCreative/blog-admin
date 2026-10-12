import type { APIRoute } from 'astro';
import { getAuth } from '../../../lib/auth';

export const prerender = false;

/**
 * The only Better Auth endpoints the demo uses. Everything else (change-password,
 * update-user, delete-user, reset flows...) would let a visitor with dev tools
 * lock out or alter the shared demo account, so it 404s before reaching Better Auth.
 */
const ALLOWED_PATHS = new Set(['/sign-in/email', '/sign-out', '/get-session']);
const AUTH_PREFIX = '/api/auth';

export function isAllowedAuthPath(pathname: string): boolean {
  if (!pathname.startsWith(`${AUTH_PREFIX}/`)) return false;
  const route = pathname.slice(AUTH_PREFIX.length).replace(/\/+$/, '');
  return ALLOWED_PATHS.has(route);
}

export const ALL: APIRoute = ({ request, clientAddress }) => {
  if (!isAllowedAuthPath(new URL(request.url).pathname)) {
    return new Response('Not found', { status: 404 });
  }
  return getAuth().handler(withClientIp(request, clientAddress));
};

/**
 * Better Auth keys its rate limits on x-forwarded-for (see createBlogAuth). The
 * incoming chain's leftmost entry is client-controlled, so replace the whole
 * header with the platform-resolved address.
 */
function withClientIp(request: Request, clientAddress: string): Request {
  const headers = new Headers(request.headers);
  headers.set('x-forwarded-for', clientAddress);
  return new Request(request, { headers });
}
