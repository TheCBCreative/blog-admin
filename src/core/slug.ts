/**
 * Slug generation. Changing a published slug breaks inbound links, so generation
 * is deterministic.
 */

const MAX_SLUG_LENGTH = 80;

/** Turns a headline into a URL-safe slug: "Beyoncé's Glow" -> "beyonces-glow". */
export function slugify(input: string): string {
  return input
    .normalize('NFD')
    // Property escape, not a literal range: combining marks are invisible in
    // source and get mangled by editors.
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    // Apostrophes vanish rather than becoming separators: "erika's" -> "erikas".
    .replace(/['‘’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing hyphen can reappear after slicing mid-word.
    .replace(/-+$/g, '');
}

/** Appends a numeric suffix until `exists` reports the slug is free. */
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
  throw new Error(`Could not generate a unique slug for "${desired}" after ${maxAttempts} attempts`);
}

/** Slugs must be lowercase alphanumeric with single internal hyphens. */
export function isValidSlug(slug: string): boolean {
  if (slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}
