/**
 * Visitor content cleanup for the public demo.
 *
 * Anyone can sign in and create posts, so visitor posts age out automatically
 * while the seeded placeholders (`npm run db:seed`) are never touched. Seeded
 * posts are marked with `SEED_TAG` in the existing `tags` field, so this needs
 * no schema change and works against any PostService.
 */
import type { PostService } from '@thecbcreative/blog-admin/service';

/**
 * Internal marker for seeded placeholders, hidden from every UI surface. It
 * must be a valid tag by the package's slug rules, or saving a placeholder
 * through the normal edit flow would fail validation.
 */
export const SEED_TAG = 'demo-seed-placeholder';

/** Prefix shared by every internal tag (the seed tag and the sandbox tags in sandbox.ts). */
const INTERNAL_PREFIX = 'demo-';

export const isInternalTag = (tag: string): boolean => tag.startsWith(INTERNAL_PREFIX);

export function isSeedPost(tags: readonly string[]): boolean {
  return tags.includes(SEED_TAG);
}

/** Tags minus every internal marker, for anything that displays or edits tags. */
export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => !isInternalTag(tag));
}

const DEFAULT_MAX_AGE_HOURS = 2;

/** How long a visitor-created post is kept; set with DEMO_POST_MAX_AGE_HOURS. */
export function demoPostMaxAgeMs(): number {
  const raw = Number(process.env.DEMO_POST_MAX_AGE_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_HOURS;
  return hours * 60 * 60 * 1000;
}

/**
 * Deletes visitor-created posts older than the retention window; seeded
 * placeholders are kept whatever their age. Uses only the public PostService
 * interface so it works with any PostStore. Callers should swallow errors so a
 * failed cleanup never breaks a real request.
 */
export async function cleanupExpiredDemoPosts(
  service: Pick<PostService, 'list' | 'delete'>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = now.getTime() - demoPostMaxAgeMs();

  // The demo stays small, so one bounded page covers every post.
  const posts = await service.list({ limit: 200 });
  const expired = posts.filter((post) => !isSeedPost(post.tags) && post.createdAt.getTime() < cutoff);

  for (const post of expired) {
    await service.delete(post.id);
  }

  return expired.length;
}
