/**
 * Neon (Postgres) implementation of PostStore.
 *
 * Every query is parameterized via the driver's tagged template — no string
 * interpolation anywhere in this file, ever.
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { NewPost, Post, PostPatch, PostStatus } from '../../types.js';
import type { ListOptions, PostStore } from '../types.js';
import { SlugConflictError, PostNotFoundError } from '../types.js';

interface PostRow {
  id: string;
  slug: string;
  headline: string;
  subheadline: string | null;
  body: string;
  excerpt: string | null;
  image_url: string | null;
  image_alt: string | null;
  image_width: number | null;
  image_height: number | null;
  layout: string;
  status: string;
  publish_at: string | Date | null;
  published_at: string | Date | null;
  author_name: string;
  tags: string[];
  related_services: string[];
  seo_title: string | null;
  seo_description: string | null;
  canonical_url: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

const toDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));
const toOptDate = (v: string | Date | null): Date | undefined => (v == null ? undefined : toDate(v));
const opt = <T>(v: T | null): T | undefined => (v == null ? undefined : v);

/** Row → domain. Adapters own this mapping so the domain type stays clean. */
function rowToPost(row: PostRow): Post {
  return {
    id: row.id,
    slug: row.slug,
    headline: row.headline,
    subheadline: opt(row.subheadline),
    body: row.body,
    excerpt: opt(row.excerpt),
    featuredImage:
      row.image_url && row.image_alt
        ? {
            url: row.image_url,
            alt: row.image_alt,
            width: row.image_width ?? 0,
            height: row.image_height ?? 0,
          }
        : undefined,
    layout: row.layout,
    status: row.status as PostStatus,
    publishAt: toOptDate(row.publish_at),
    publishedAt: toOptDate(row.published_at),
    authorName: row.author_name,
    tags: row.tags ?? [],
    relatedServices: row.related_services ?? [],
    seoTitle: opt(row.seo_title),
    seoDescription: opt(row.seo_description),
    canonicalUrl: opt(row.canonical_url),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

/** Postgres unique-violation code. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;
}

export function createNeonPostStore(sql: NeonQueryFunction<false, false>): PostStore {
  return {
    async list(opts: ListOptions = {}): Promise<Post[]> {
      const statuses = opts.status
        ? Array.isArray(opts.status)
          ? opts.status
          : [opts.status]
        : null;
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;
      const asc = opts.order === 'oldest';

      const rows = (await sql`
        SELECT * FROM posts
        WHERE (${statuses}::text[] IS NULL OR status = ANY(${statuses}::text[]))
        ORDER BY
          COALESCE(publish_at, created_at) ${asc ? sql`ASC` : sql`DESC`}
        LIMIT ${limit} OFFSET ${offset}
      `) as PostRow[];

      return rows.map(rowToPost);
    },

    async listLive(now: Date, opts = {}): Promise<Post[]> {
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;

      // Liveness filter pushed into SQL — mirrors core/status.ts isLive().
      const rows = (await sql`
        SELECT * FROM posts
        WHERE status = 'published'
           OR (status = 'scheduled' AND publish_at <= ${now})
        ORDER BY COALESCE(published_at, publish_at, created_at) DESC
        LIMIT ${limit} OFFSET ${offset}
      `) as PostRow[];

      return rows.map(rowToPost);
    },

    async count(opts = {}): Promise<number> {
      const statuses = opts.status
        ? Array.isArray(opts.status)
          ? opts.status
          : [opts.status]
        : null;

      const rows = (await sql`
        SELECT COUNT(*)::int AS n FROM posts
        WHERE (${statuses}::text[] IS NULL OR status = ANY(${statuses}::text[]))
      `) as Array<{ n: number }>;

      return rows[0]?.n ?? 0;
    },

    async get(id: string): Promise<Post | null> {
      const rows = (await sql`SELECT * FROM posts WHERE id = ${id}`) as PostRow[];
      const row = rows[0];
      return row ? rowToPost(row) : null;
    },

    async getBySlug(slug: string): Promise<Post | null> {
      const rows = (await sql`SELECT * FROM posts WHERE slug = ${slug}`) as PostRow[];
      const row = rows[0];
      return row ? rowToPost(row) : null;
    },

    async slugExists(slug: string, excludeId?: string): Promise<boolean> {
      const rows = (await sql`
        SELECT 1 FROM posts
        WHERE slug = ${slug}
          AND (${excludeId ?? null}::uuid IS NULL OR id <> ${excludeId ?? null}::uuid)
        LIMIT 1
      `) as unknown[];
      return rows.length > 0;
    },

    async create(input: NewPost): Promise<Post> {
      try {
        const rows = (await sql`
          INSERT INTO posts (
            slug, headline, subheadline, body, excerpt,
            image_url, image_alt, image_width, image_height,
            layout, status, publish_at, published_at,
            author_name, tags, related_services,
            seo_title, seo_description, canonical_url
          ) VALUES (
            ${input.slug}, ${input.headline}, ${input.subheadline ?? null},
            ${input.body}, ${input.excerpt ?? null},
            ${input.featuredImage?.url ?? null}, ${input.featuredImage?.alt ?? null},
            ${input.featuredImage?.width ?? null}, ${input.featuredImage?.height ?? null},
            ${input.layout}, ${input.status},
            ${input.publishAt ?? null}, ${input.publishedAt ?? null},
            ${input.authorName}, ${input.tags}, ${input.relatedServices},
            ${input.seoTitle ?? null}, ${input.seoDescription ?? null}, ${input.canonicalUrl ?? null}
          )
          RETURNING *
        `) as PostRow[];

        const row = rows[0];
        if (!row) throw new Error('Insert returned no row');
        return rowToPost(row);
      } catch (err) {
        if (isUniqueViolation(err)) throw new SlugConflictError(input.slug);
        throw err;
      }
    },

    async update(id: string, patch: PostPatch): Promise<Post> {
      // COALESCE-with-sentinel keeps this a single statement without dynamic SQL.
      // Passing null for a key means "leave unchanged"; clearing a field is done
      // by passing an empty string, which the domain treats as absent.
      try {
        const rows = (await sql`
          UPDATE posts SET
            slug             = COALESCE(${patch.slug ?? null}, slug),
            headline         = COALESCE(${patch.headline ?? null}, headline),
            subheadline      = COALESCE(${patch.subheadline ?? null}, subheadline),
            body             = COALESCE(${patch.body ?? null}, body),
            excerpt          = COALESCE(${patch.excerpt ?? null}, excerpt),
            image_url        = COALESCE(${patch.featuredImage?.url ?? null}, image_url),
            image_alt        = COALESCE(${patch.featuredImage?.alt ?? null}, image_alt),
            image_width      = COALESCE(${patch.featuredImage?.width ?? null}, image_width),
            image_height     = COALESCE(${patch.featuredImage?.height ?? null}, image_height),
            layout           = COALESCE(${patch.layout ?? null}, layout),
            status           = COALESCE(${patch.status ?? null}, status),
            publish_at       = COALESCE(${patch.publishAt ?? null}, publish_at),
            published_at     = COALESCE(${patch.publishedAt ?? null}, published_at),
            author_name      = COALESCE(${patch.authorName ?? null}, author_name),
            tags             = COALESCE(${patch.tags ?? null}, tags),
            related_services = COALESCE(${patch.relatedServices ?? null}, related_services),
            seo_title        = COALESCE(${patch.seoTitle ?? null}, seo_title),
            seo_description  = COALESCE(${patch.seoDescription ?? null}, seo_description),
            canonical_url    = COALESCE(${patch.canonicalUrl ?? null}, canonical_url)
          WHERE id = ${id}
          RETURNING *
        `) as PostRow[];

        const row = rows[0];
        if (!row) throw new PostNotFoundError(id);
        return rowToPost(row);
      } catch (err) {
        if (isUniqueViolation(err) && patch.slug) throw new SlugConflictError(patch.slug);
        throw err;
      }
    },

    async delete(id: string): Promise<void> {
      await sql`DELETE FROM posts WHERE id = ${id}`;
    },

    async listTags(now: Date): Promise<Array<{ tag: string; count: number }>> {
      const rows = (await sql`
        SELECT unnest(tags) AS tag, COUNT(*)::int AS count
        FROM posts
        WHERE status = 'published'
           OR (status = 'scheduled' AND publish_at <= ${now})
        GROUP BY tag
        ORDER BY count DESC, tag ASC
      `) as Array<{ tag: string; count: number }>;

      return rows;
    },
  };
}

/**
 * Convenience wrapper: build a store straight from a connection string.
 *
 * Saves consumers from importing the driver themselves just to construct a
 * client, and keeps the driver version pinned in one place.
 */
export function createNeonPostStoreFromUrl(databaseUrl: string): PostStore {
  return createNeonPostStore(neon(databaseUrl) as NeonQueryFunction<false, false>);
}
