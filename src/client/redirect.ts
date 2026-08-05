/**
 * Post-login redirect safety.
 *
 * Shared rather than per-project because getting this wrong turns a login page
 * into an open redirect, and it's the kind of check that's easy to write subtly
 * differently each time.
 */

/**
 * Constrains a caller-supplied `?next=` value to a same-site path.
 *
 * Rejects anything that isn't a root-relative path. The `//` case matters and is
 * easy to miss: `//evil.example` is a protocol-relative URL, so a naive
 * `startsWith('/')` check treats it as local and the browser navigates
 * off-site — a working open redirect, which is a real phishing primitive on a
 * login page.
 *
 * Also rejects backslashes, since some browsers have historically normalised
 * `/\evil.example` into a protocol-relative URL.
 */
export function safeNextPath(requested: string | null | undefined, fallback = '/admin/'): string {
  if (!requested) return fallback;
  if (!requested.startsWith('/')) return fallback;
  if (requested.startsWith('//')) return fallback;
  if (requested.startsWith('/\\')) return fallback;
  if (requested.includes('\\')) return fallback;
  return requested;
}
