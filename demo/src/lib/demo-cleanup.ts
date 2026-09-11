/**
 * Visitor content cleanup for the public demo.
 *
 * Anyone who opens the demo can sign in and create posts, so the demo needs a
 * way to age those out automatically without ever touching the seeded
 * placeholder posts (`npm run db:seed`) that the portfolio site is meant to
 * always show.
 *
 * No schema change: seeded posts are marked by adding `SEED_TAG` to the
 * existing `tags` field, so this works unmodified against both the Neon
 * adapter and the local-Postgres dev adapter, and against whatever
 * `PostService` a given deployment happens to be wired to.
 */
import type { PostService } from '@thecbcreative/blog-admin/service';

/**
 * Internal marker tag. Stripped from every UI surface — never shown to a
 * user. Has to be a valid tag by the package's own rules (lowercase
 * alphanumeric with single internal hyphens — see core/slug.ts's
 * isValidSlug, which validatePost enforces on every save) or saving a
 * placeholder post back through the normal edit flow would fail validation.
 */
export const SEED_TAG = 'demo-seed-placeholder';

export function isSeedPost(tags: readonly string[]): boolean {
  return tags.includes(SEED_TAG);
}

/** Tags minus the internal marker, for anything that displays or edits tags. */
export function visibleTags(tags: readonly string[]): string[] {
  return tags.filter((tag) => tag !== SEED_TAG);
}

const DEFAULT_MAX_AGE_HOURS = 2;

/**
 * How long a visitor-created post is kept before cleanup deletes it.
 * Configurable via DEMO_POST_MAX_AGE_HOURS so this can be tuned per
 * deployment without a code change; falls back to a sane default if unset
 * or invalid.
 */
export function demoPostMaxAgeMs(): number {
  const raw = Number(process.env.DEMO_POST_MAX_AGE_HOURS);
  const hours = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_AGE_HOURS;
  return hours * 60 * 60 * 1000;
}

/**
 * Deletes visitor-created posts older than the retention window. Seeded
 * placeholders are never touched, whatever their age.
 *
 * Deliberately built on nothing but the public PostService interface
 * (list + delete) — no direct adapter/SQL access — so it works the same way
 * regardless of which PostStore is behind it.
 *
 * Best-effort by design: callers (middleware, the cron route) should swallow
 * any error this throws rather than let a cleanup hiccup break a real
 * request.
 */
export async function cleanupExpiredDemoPosts(
  service: Pick<PostService, 'list' | 'delete'>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = now.getTime() - demoPostMaxAgeMs();

  // The demo is meant to stay small; a single bounded page is enough to
  // catch everything without a full unbounded scan on every request.
  const posts = await service.list({ limit: 200 });
  const expired = posts.filter((post) => !isSeedPost(post.tags) && post.createdAt.getTime() < cutoff);

  for (const post of expired) {
    await service.delete(post.id);
  }

  return expired.length;
}
