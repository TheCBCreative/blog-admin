/**
 * Constrains a caller-supplied `?next=` value to a same-site path, so the login
 * page can't be used as an open redirect.
 *
 * Rejects anything that isn't root-relative, including `//evil.example`
 * (protocol-relative, so it passes a naive `startsWith('/')` check) and any
 * backslash, since some browsers normalise `/\evil.example` the same way.
 */
export function safeNextPath(requested: string | null | undefined, fallback = '/admin/'): string {
  if (!requested) return fallback;
  if (!requested.startsWith('/')) return fallback;
  if (requested.startsWith('//')) return fallback;
  if (requested.includes('\\')) return fallback;
  return requested;
}
