/**
 * Post service — the orchestration layer.
 *
 * Owns the sequence that turns form input into a stored post: validate, resolve
 * the slug, work out the status timestamps, then write. Consumers call one
 * method rather than reimplementing that order, which is where the subtle bugs
 * live — a site that forgot resolvePublishedAt would silently reset publish
 * dates on every edit and quietly wreck its own BlogPosting schema.
 */

import type { NewPost, Post, PostInput, PostStatus } from '../types.js';
import type { ListOptions, PostStore } from '../adapters/types.js';
import { validatePost, coercePublishAt, type ValidationError } from '../core/validate.js';
import { slugify, uniqueSlug } from '../core/slug.js';
import { resolvePublishedAt } from '../core/status.js';
import { DEFAULT_TIME_ZONE } from '../core/datetime.js';

export interface PostServiceConfig {
  defaultAuthorName: string;
  /** Layouts this project offers. First entry is the default. */
  layouts: readonly string[];
  timeZone?: string;
  /**
   * Hook for sanitizing rich-text HTML before storage. Wired in M4b — until
   * then body content is stored as given, so don't expose the editor yet.
   */
  sanitizeHtml?: (html: string) => string;
}

/**
 * Result type rather than exceptions for validation failures. An API route needs
 * to turn field errors into a 422 body, and try/catch around a typed error is
 * clumsier than a discriminated union.
 */
export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; errors: ValidationError[] };

const invalid = (errors: ValidationError[]): { ok: false; errors: ValidationError[] } => ({
  ok: false,
  errors,
});

export interface PostService {
  list(opts?: ListOptions): Promise<Post[]>;
  listLive(now?: Date): Promise<Post[]>;
  count(status?: PostStatus | PostStatus[]): Promise<number>;
  get(id: string): Promise<Post | null>;
  getBySlug(slug: string): Promise<Post | null>;
  listTags(now?: Date): Promise<Array<{ tag: string; count: number }>>;

  create(input: PostInput, now?: Date): Promise<ServiceResult<Post>>;
  update(id: string, input: Partial<PostInput>, now?: Date): Promise<ServiceResult<Post>>;
  delete(id: string): Promise<void>;
}

export function createPostService(store: PostStore, config: PostServiceConfig): PostService {
  const timeZone = config.timeZone ?? DEFAULT_TIME_ZONE;
  const defaultLayout = config.layouts[0] ?? 'standard';
  const sanitize = config.sanitizeHtml ?? ((html: string) => html);

  /** Shared shaping for create and update, once validation has passed. */
  function buildFields(input: PostInput, now: Date, existing?: Post) {
    const status: PostStatus = input.status ?? existing?.status ?? 'draft';

    const publishAt =
      input.publishAt !== undefined
        ? (coercePublishAt(input.publishAt, timeZone) ?? undefined)
        : existing?.publishAt;

    return {
      headline: input.headline ?? existing?.headline ?? '',
      subheadline: input.subheadline ?? existing?.subheadline,
      body: sanitize(input.body ?? existing?.body ?? ''),
      excerpt: input.excerpt ?? existing?.excerpt,
      featuredImage:
        input.featuredImage?.url && input.featuredImage.alt
          ? {
              url: input.featuredImage.url,
              alt: input.featuredImage.alt,
              width: input.featuredImage.width ?? 0,
              height: input.featuredImage.height ?? 0,
            }
          : existing?.featuredImage,
      layout: input.layout ?? existing?.layout ?? defaultLayout,
      status,
      publishAt,
      // Never overwrite an existing publish date — that would reset
      // datePublished in the post's schema on every edit.
      publishedAt: resolvePublishedAt(existing?.publishedAt, status, now),
      authorName: input.authorName ?? existing?.authorName ?? config.defaultAuthorName,
      tags: input.tags ?? existing?.tags ?? [],
      relatedServices: input.relatedServices ?? existing?.relatedServices ?? [],
      seoTitle: input.seoTitle ?? existing?.seoTitle,
      seoDescription: input.seoDescription ?? existing?.seoDescription,
      canonicalUrl: input.canonicalUrl ?? existing?.canonicalUrl,
    };
  }

  return {
    list: (opts) => store.list(opts),
    listLive: (now = new Date()) => store.listLive(now),
    count: (status) => store.count(status ? { status } : undefined),
    get: (id) => store.get(id),
    getBySlug: (slug) => store.getBySlug(slug),
    listTags: (now = new Date()) => store.listTags(now),

    async create(input, now = new Date()): Promise<ServiceResult<Post>> {
      const errors = validatePost(input, {
        allowedLayouts: config.layouts,
        timeZone,
        now,
      });
      if (errors.length > 0) return invalid(errors);

      // Derive from the headline unless an explicit slug was given, then make
      // it unique. Uniqueness is also enforced by a DB constraint — this just
      // avoids surfacing a raw conflict error for the common case.
      const desired = input.slug ?? slugify(input.headline);
      const slug = await uniqueSlug(desired, (s) => store.slugExists(s));

      const fields = buildFields(input, now);
      const created = await store.create({ slug, ...fields } as NewPost);
      return { ok: true, data: created };
    },

    async update(id, input, now = new Date()): Promise<ServiceResult<Post>> {
      const existing = await store.get(id);
      if (!existing) {
        return invalid([{ field: 'id', message: 'That post no longer exists.' }]);
      }

      // Validate the MERGED result, not the patch alone. Validating only the
      // patch would let `{ status: 'scheduled' }` through with no publishAt,
      // producing a post that never becomes visible.
      const merged: PostInput = {
        headline: input.headline ?? existing.headline,
        subheadline: input.subheadline ?? existing.subheadline,
        body: input.body ?? existing.body,
        excerpt: input.excerpt ?? existing.excerpt,
        featuredImage: input.featuredImage ?? existing.featuredImage,
        layout: input.layout ?? existing.layout,
        status: input.status ?? existing.status,
        publishAt: input.publishAt ?? existing.publishAt,
        authorName: input.authorName ?? existing.authorName,
        tags: input.tags ?? existing.tags,
        relatedServices: input.relatedServices ?? existing.relatedServices,
        seoTitle: input.seoTitle ?? existing.seoTitle,
        seoDescription: input.seoDescription ?? existing.seoDescription,
        canonicalUrl: input.canonicalUrl ?? existing.canonicalUrl,
        slug: input.slug ?? existing.slug,
      };

      const errors = validatePost(merged, {
        allowedLayouts: config.layouts,
        timeZone,
        now,
      });
      if (errors.length > 0) return invalid(errors);

      // Only re-resolve the slug if it actually changed, so a post keeps its own
      // slug on edit rather than collecting a -2 suffix.
      let slug = existing.slug;
      if (input.slug !== undefined && input.slug !== existing.slug) {
        slug = await uniqueSlug(input.slug, (s) => store.slugExists(s, id));
      }

      const fields = buildFields(merged, now, existing);
      const updated = await store.update(id, { slug, ...fields });
      return { ok: true, data: updated };
    },

    delete: (id) => store.delete(id),
  };
}
