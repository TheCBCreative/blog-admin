/**
 * Slug generation.
 *
 * Slugs are permanent-ish: changing one after publish breaks inbound links and
 * loses accumulated search equity. So generation is deterministic and the admin
 * warns before changing a published post's slug.
 */

const MAX_SLUG_LENGTH = 80;

/**
 * Turns a headline into a URL-safe slug.
 *
 * Handles accented characters by decomposing them (NFD) and stripping the
 * combining marks, so "Beyoncé's Glow" becomes "beyonces-glow" rather than
 * dropping the character entirely and producing "beyonc-s-glow".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    // Strip the combining marks NFD leaves behind. Uses the Unicode property
    // escape rather than a literal character range — the marks themselves are
    // invisible in source and get silently mangled by editors and copy-paste.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    // Apostrophes vanish rather than becoming separators: "erika's" -> "erikas".
    .replace(/['‘’]/g, '')
    // Everything else non-alphanumeric becomes a separator.
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing hyphen can reappear after slicing mid-word.
    .replace(/-+$/g, '');
}

/**
 * Appends a numeric suffix until the slug is unique.
 *
 * `exists` is injected rather than importing a store, so this stays pure and
 * testable and works against any backend.
 */
export async function uniqueSlug(
  desired: string,
  exists: (slug: string) => Promise<boolean>,
  maxAttempts = 100,
): Promise<string> {
  const base = slugify(desired) || 'post';
  if (!(await exists(base))) return base;

  for (let n = 2; n <= maxAttempts; n++) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  // Practically unreachable; better than looping forever or silently colliding.
  throw new Error(`Could not generate a unique slug for "${desired}" after ${maxAttempts} attempts`);
}

/** Slugs must be lowercase alphanumeric with single internal hyphens. */
export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
