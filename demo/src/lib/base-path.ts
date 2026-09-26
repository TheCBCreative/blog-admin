/**
 * The demo is reverse-proxied onto the portfolio at a subpath
 * (caitburke.dev/work/blog-composer/demo) but runs at its own root, because
 * Astro's `base` config doesn't agree with the Vercel adapter's routing for
 * server output. So every link, redirect, and fetch() that resolves in the
 * browser adds this prefix by hand.
 *
 * Set with PUBLIC_BASE_PATH; empty when running standalone.
 */
export const BASE_PATH = import.meta.env.PUBLIC_BASE_PATH ?? '';

/** Prefixes an app-root path with BASE_PATH for use in the browser. */
export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
