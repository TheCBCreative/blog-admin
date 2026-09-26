/**
 * Request-level glue for sandbox.ts: reads and writes the sandbox cookie and
 * hands pages and API routes a PostService scoped to the current visitor.
 */
import type { AstroCookies } from 'astro';
import type { PostService } from '@thecbcreative/blog-admin/service';
import { getPostService } from './store';
import {
  MAX_HIDDEN,
  SANDBOX_COOKIE,
  createSandboxedService,
  decodeSandbox,
  encodeSandbox,
  newSandbox,
  sandboxSecondsLeft,
  type Sandbox,
} from './sandbox';

function writeCookie(cookies: AstroCookies, sandbox: Sandbox) {
  cookies.set(SANDBOX_COOKIE, encodeSandbox(sandbox), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: import.meta.env.PROD,
    // Counts from when the sandbox started and is never extended by activity,
    // so coming back later always means starting fresh.
    maxAge: sandboxSecondsLeft(sandbox),
  });
}

/** The current visitor's sandbox, starting a new one if they have none or it expired. */
export function resolveSandbox(cookies: AstroCookies): Sandbox {
  const existing = decodeSandbox(cookies.get(SANDBOX_COOKIE)?.value);
  if (existing) return existing;
  const sandbox = newSandbox();
  writeCookie(cookies, sandbox);
  return sandbox;
}

/** A PostService that only sees, and only writes to, this visitor's sandbox. */
export function getSandboxedPostService(locals: App.Locals, cookies: AstroCookies): PostService {
  const sandbox = locals.sandbox ?? (locals.sandbox = resolveSandbox(cookies));
  return createSandboxedService(getPostService(), sandbox, {
    onHide(seedId) {
      if (sandbox.hidden.includes(seedId) || sandbox.hidden.length >= MAX_HIDDEN) return;
      sandbox.hidden.push(seedId);
      writeCookie(cookies, sandbox);
    },
  });
}
