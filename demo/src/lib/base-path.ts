/**
 * The demo is reverse-proxied onto the portfolio site at a subpath
 * (caitburke.dev/work/blog-composer/demo). The app itself always runs at
 * its own root in production — Astro's `base` config doesn't cleanly agree
 * with the Vercel adapter's own routing for server output (open upstream
 * issue) — so every link, redirect, and fetch() call that needs to resolve
 * correctly in the *browser* has to add this prefix by hand instead.
 *
 * Set via the PUBLIC_BASE_PATH env var in Vercel. Empty when running
 * standalone (local dev, the bare *.vercel.app URL) — every use below is a
 * no-op in that case.
 */
export const BASE_PATH = import.meta.env.PUBLIC_BASE_PATH ?? '';

export function withBase(path: string): string {
  return `${BASE_PATH}${path}`;
}
