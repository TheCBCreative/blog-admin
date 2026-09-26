/**
 * Link href normalization. Authors type "example.com"; without a scheme the
 * browser resolves it relative to the current page. Applied in the sanitizer so
 * it holds regardless of how the post was written.
 */

/** Schemes we allow through untouched. Must stay in sync with the sanitizer. */
const KNOWN_SCHEME = /^(https?|mailto|tel):/i;

/** Anything starting with these is an intentional same-site reference. */
const RELATIVE_PREFIX = /^[/#?]/;

/** Rough email shape — enough to distinguish "a@b.com" from a domain. */
const LOOKS_LIKE_EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** Bare domain ("www.example.com/path"), but not "services/injectables" or "notes.txt about things". */
const LOOKS_LIKE_DOMAIN = /^[^\s/]+\.[a-z]{2,}(?:[/?#].*)?$/i;

export function normalizeLinkHref(href: string): string {
  const trimmed = href.trim();
  if (!trimmed) return '';

  if (KNOWN_SCHEME.test(trimmed) || RELATIVE_PREFIX.test(trimmed)) return trimmed;

  if (LOOKS_LIKE_EMAIL.test(trimmed)) return `mailto:${trimmed}`;
  if (LOOKS_LIKE_DOMAIN.test(trimmed)) return `https://${trimmed}`;

  // Ambiguous: leaving it alone is safer than guessing, and the sanitizer's
  // scheme allowlist still applies.
  return trimmed;
}
