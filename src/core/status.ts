/**
 * Visibility derivation.
 *
 * The single rule for "is this post publicly visible" lives here. Nothing else
 * should reimplement it — that's how a draft ends up leaking on one route but
 * not another.
 */

import type { Post, PostStatus } from '../types.js';

/**
 * A post is live if it's explicitly published, or scheduled and its moment has
 * arrived. Drafts and archived posts are never live.
 *
 * Note the `scheduled` case is time-dependent, so on a statically built site the
 * post appears only after the next build. A daily rebuild covers that; with
 * on-demand rendering it's immediate.
 */
export function isLive(post: Pick<Post, 'status' | 'publishAt'>, now: Date = new Date()): boolean {
  switch (post.status) {
    case 'published':
      return true;
    case 'scheduled':
      return post.publishAt !== undefined && post.publishAt.getTime() <= now.getTime();
    case 'draft':
    case 'archived':
      return false;
  }
}

/**
 * What the admin list should display, which is not the same as `status` —
 * a 'scheduled' post whose time has passed reads as live to a visitor, so
 * showing "Scheduled" would be misleading.
 */
export type DisplayStatus = 'draft' | 'scheduled' | 'live' | 'archived';

export function displayStatus(
  post: Pick<Post, 'status' | 'publishAt'>,
  now: Date = new Date(),
): DisplayStatus {
  if (post.status === 'draft') return 'draft';
  if (post.status === 'archived') return 'archived';
  if (post.status === 'published') return 'live';
  return isLive(post, now) ? 'live' : 'scheduled';
}

/** Only scheduled posts that haven't fired yet can be cancelled. */
export function canCancelSchedule(
  post: Pick<Post, 'status' | 'publishAt'>,
  now: Date = new Date(),
): boolean {
  return post.status === 'scheduled' && !isLive(post, now);
}

/**
 * Resolves what `publishedAt` should be after a status transition.
 *
 * Returns the existing value when already set, so editing a published post
 * doesn't reset its original publish date — that would break BlogPosting
 * schema's datePublished and confuse search engines about content freshness.
 */
export function resolvePublishedAt(
  current: Date | undefined,
  nextStatus: PostStatus,
  now: Date = new Date(),
): Date | undefined {
  if (current) return current;
  if (nextStatus === 'published') return now;
  return undefined;
}

export const ALL_STATUSES: readonly PostStatus[] = ['draft', 'scheduled', 'published', 'archived'];

export function isPostStatus(value: unknown): value is PostStatus {
  return typeof value === 'string' && (ALL_STATUSES as readonly string[]).includes(value);
}
