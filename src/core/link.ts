/**
 * Link href normalization.
 *
 * Authors type "thecbcreative.com", not "https://thecbcreative.com". Without a
 * scheme the browser resolves that against the current page, so a link in
 * /blog/my-post/ silently points at /blog/my-post/thecbcreative.com.
 *
 * Applied in the sanitizer rather than only in the editor, so a bare domain gets
 * fixed no matter how the row was written.
 */

/** Schemes we allow through untouched. Must stay in sync with the sanitizer. */
const KNOWN_SCHEME = /^(https?|mailto|tel):/i;

/** Anything starting with these is an intentional same-site reference. */
const RELATIVE_PREFIX = /^[/#?]/;

/** Rough email shape — enough to distinguish "a@b.com" from a domain. */
const LOOKS_LIKE_EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/**
 * Bare domain: has a dot before any slash, and no whitespace. Matches
 * "example.com", "www.example.com/path", "sub.example.co.uk" — but not
 * "services/injectables" or "notes.txt about things".
 */
const LOOKS_LIKE_DOMAIN = /^[^\s/]+\.[a-z]{2,}(?:[/?#].*)?$/i;

export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return '';

  // Already explicit, or deliberately relative.
  if (KNOWN_SCHEME.test(trimmed) || RELATIVE_PREFIX.test(trimmed)) return trimmed;

  if (LOOKS_LIKE_EMAIL.test(trimmed)) return `mailto:${trimmed}`;
  if (LOOKS_LIKE_DOMAIN.test(trimmed)) return `https://${trimmed}`;

  // Ambiguous — a relative path with no leading slash, or something unparseable.
  // Leaving it alone is safer than guessing; the sanitizer's scheme allowlist
  // still applies.
  return trimmed;
}
