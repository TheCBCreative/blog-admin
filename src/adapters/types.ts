/**
 * Storage contracts.
 *
 * This is the swap point. Core and UI depend only on these interfaces, so moving
 * from Neon to anything else means writing one adapter — no changes above.
 *
 * Adapters are responsible for:
 *   - mapping rows to/from the Post domain type
 *   - returning real Date objects, never ISO strings
 *   - parameterized queries (never string interpolation)
 */

import type { NewPost, Post, PostPatch, PostStatus } from '../types.js';

export interface ListOptions {
  status?: PostStatus | PostStatus[];
  limit?: number;
  offset?: number;
  /** Default: newest first by publishAt, falling back to createdAt. */
  order?: 'newest' | 'oldest';
}

export interface PostStore {
  /** Admin listing — includes drafts and archived. */
  list(opts?: ListOptions): Promise<Post[]>;

  /**
   * Public listing — only posts live as of `now`.
   * Adapters should push this filter into the query rather than filtering in JS,
   * so a large archive doesn't get fully loaded on every request.
   */
  listLive(now: Date, opts?: Pick<ListOptions, 'limit' | 'offset'>): Promise<Post[]>;

  count(opts?: Pick<ListOptions, 'status'>): Promise<number>;

  get(id: string): Promise<Post | null>;
  getBySlug(slug: string): Promise<Post | null>;

  /** For uniqueSlug(). `excludeId` lets a post keep its own slug on edit. */
  slugExists(slug: string, excludeId?: string): Promise<boolean>;

  create(input: NewPost): Promise<Post>;
  update(id: string, patch: PostPatch): Promise<Post>;
  delete(id: string): Promise<void>;

  /** Distinct tags across live posts, with counts. Drives tag archive pages. */
  listTags(now: Date): Promise<Array<{ tag: string; count: number }>>;
}

export interface UploadedMedia {
  url: string;
  width: number;
  height: number;
  bytes: number;
  contentType: string;
}

export interface MediaStore {
  /**
   * Implementations must validate by magic bytes rather than filename, cap size,
   * and re-encode rather than storing the original — re-encoding strips any
   * embedded payload.
   */
  upload(file: File, opts?: { maxBytes?: number }): Promise<UploadedMedia>;
  delete(url: string): Promise<void>;
}

/** Thrown by adapters when a uniqueness constraint is violated. */
export class SlugConflictError extends Error {
  constructor(public readonly slug: string) {
    super(`A post with slug "${slug}" already exists.`);
    this.name = 'SlugConflictError';
  }
}

export class PostNotFoundError extends Error {
  constructor(public readonly id: string) {
    super(`No post with id "${id}".`);
    this.name = 'PostNotFoundError';
  }
}
