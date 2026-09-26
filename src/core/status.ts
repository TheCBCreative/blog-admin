/**
 * The single rule for whether a post is publicly visible. Don't reimplement it
 * elsewhere, or a draft can leak on one route but not another.
 */

import type { Post, PostStatus } from '../types.js';

/**
 * A post is live if it's published, or scheduled and its moment has arrived.
 * Time-dependent: a statically built site only shows a scheduled post after the
 * next build.
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

/** Admin-facing status: a 'scheduled' post whose time has passed shows as 'live'. */
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
 * Resolves `publishedAt` after a status transition. An existing value is always
 * kept so edits don't reset the original publish date (schema datePublished).
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
