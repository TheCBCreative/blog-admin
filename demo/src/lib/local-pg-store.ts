/**
 * Local-Postgres PostStore — a development convenience, not what ships to
 * production.
 *
 * The package's real adapter (`@thecbcreative/blog-admin/adapters/neon`)
 * talks to Neon over its HTTP query endpoint, which only exists for a real
 * Neon project. This adapter implements the identical `PostStore` interface
 * against a plain Postgres connection instead, so the app can be run against
 * any local or self-hosted Postgres during development without needing a
 * Neon account at all.
 *
 * Same schema, same status/visibility rules as the real adapter (mirrors
 * `adapters/neon/index.ts`) — just parameterized queries instead of a
 * tagged-template HTTP call. Selected by `getPostStore()` in `store.ts` only
 * when `LOCAL_PG=true`; the deployed demo always uses the real adapter.
 */
import { Pool } from '@neondatabase/serverless';
import type { NewPost, Post, PostPatch, PostStatus } from '@thecbcreative/blog-admin';
import type { ListOptions, PostStore } from '@thecbcreative/blog-admin/adapters';
import { SlugConflictError, PostNotFoundError } from '@thecbcreative/blog-admin/adapters';

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

const UNIQUE_VIOLATION = '23505';
const isUniqueViolation = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { code?: string }).code === UNIQUE_VIOLATION;

export function createLocalPgPostStore(databaseUrl: string): PostStore {
  const pool = new Pool({ connectionString: databaseUrl });

  return {
    async list(opts: ListOptions = {}): Promise<Post[]> {
      const statuses = opts.status ? (Array.isArray(opts.status) ? opts.status : [opts.status]) : null;
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;
      const order = opts.order === 'oldest' ? 'ASC' : 'DESC';

      const { rows } = await pool.query(
        `SELECT * FROM posts
         WHERE ($1::text[] IS NULL OR status = ANY($1::text[]))
         ORDER BY COALESCE(publish_at, created_at) ${order}
         LIMIT $2 OFFSET $3`,
        [statuses, limit, offset],
      );
      return (rows as PostRow[]).map(rowToPost);
    },

    async listLive(now: Date, opts = {}): Promise<Post[]> {
      const limit = opts.limit ?? 100;
      const offset = opts.offset ?? 0;
      const { rows } = await pool.query(
        `SELECT * FROM posts
         WHERE status = 'published' OR (status = 'scheduled' AND publish_at <= $1)
         ORDER BY COALESCE(published_at, publish_at, created_at) DESC
         LIMIT $2 OFFSET $3`,
        [now, limit, offset],
      );
      return (rows as PostRow[]).map(rowToPost);
    },

    async count(opts = {}): Promise<number> {
      const statuses = opts.status ? (Array.isArray(opts.status) ? opts.status : [opts.status]) : null;
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS n FROM posts WHERE ($1::text[] IS NULL OR status = ANY($1::text[]))`,
        [statuses],
      );
      return rows[0]?.n ?? 0;
    },

    async get(id: string): Promise<Post | null> {
      const { rows } = await pool.query(`SELECT * FROM posts WHERE id = $1`, [id]);
      return rows[0] ? rowToPost(rows[0] as PostRow) : null;
    },

    async getBySlug(slug: string): Promise<Post | null> {
      const { rows } = await pool.query(`SELECT * FROM posts WHERE slug = $1`, [slug]);
      return rows[0] ? rowToPost(rows[0] as PostRow) : null;
    },

    async slugExists(slug: string, excludeId?: string): Promise<boolean> {
      const { rows } = await pool.query(
        `SELECT 1 FROM posts WHERE slug = $1 AND ($2::uuid IS NULL OR id <> $2::uuid) LIMIT 1`,
        [slug, excludeId ?? null],
      );
      return rows.length > 0;
    },

    async create(input: NewPost): Promise<Post> {
      try {
        const { rows } = await pool.query(
          `INSERT INTO posts (
             slug, headline, subheadline, body, excerpt,
             image_url, image_alt, image_width, image_height,
             layout, status, publish_at, published_at,
             author_name, tags, related_services,
             seo_title, seo_description, canonical_url
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
           RETURNING *`,
          [
            input.slug,
            input.headline,
            input.subheadline ?? null,
            input.body,
            input.excerpt ?? null,
            input.featuredImage?.url ?? null,
            input.featuredImage?.alt ?? null,
            input.featuredImage?.width ?? null,
            input.featuredImage?.height ?? null,
            input.layout,
            input.status,
            input.publishAt ?? null,
            input.publishedAt ?? null,
            input.authorName,
            input.tags,
            input.relatedServices,
            input.seoTitle ?? null,
            input.seoDescription ?? null,
            input.canonicalUrl ?? null,
          ],
        );
        const row = rows[0];
        if (!row) throw new Error('Insert returned no row');
        return rowToPost(row as PostRow);
      } catch (err) {
        if (isUniqueViolation(err)) throw new SlugConflictError(input.slug);
        throw err;
      }
    },

    async update(id: string, patch: PostPatch): Promise<Post> {
      try {
        const { rows } = await pool.query(
          `UPDATE posts SET
             slug             = COALESCE($2, slug),
             headline         = COALESCE($3, headline),
             subheadline      = COALESCE($4, subheadline),
             body             = COALESCE($5, body),
             excerpt          = COALESCE($6, excerpt),
             image_url        = COALESCE($7, image_url),
             image_alt        = COALESCE($8, image_alt),
             image_width      = COALESCE($9, image_width),
             image_height     = COALESCE($10, image_height),
             layout           = COALESCE($11, layout),
             status           = COALESCE($12, status),
             publish_at       = COALESCE($13, publish_at),
             published_at     = COALESCE($14, published_at),
             author_name      = COALESCE($15, author_name),
             tags             = COALESCE($16, tags),
             related_services = COALESCE($17, related_services),
             seo_title        = COALESCE($18, seo_title),
             seo_description  = COALESCE($19, seo_description),
             canonical_url    = COALESCE($20, canonical_url)
           WHERE id = $1
           RETURNING *`,
          [
            id,
            patch.slug ?? null,
            patch.headline ?? null,
            patch.subheadline ?? null,
            patch.body ?? null,
            patch.excerpt ?? null,
            patch.featuredImage?.url ?? null,
            patch.featuredImage?.alt ?? null,
            patch.featuredImage?.width ?? null,
            patch.featuredImage?.height ?? null,
            patch.layout ?? null,
            patch.status ?? null,
            patch.publishAt ?? null,
            patch.publishedAt ?? null,
            patch.authorName ?? null,
            patch.tags ?? null,
            patch.relatedServices ?? null,
            patch.seoTitle ?? null,
            patch.seoDescription ?? null,
            patch.canonicalUrl ?? null,
          ],
        );
        const row = rows[0];
        if (!row) throw new PostNotFoundError(id);
        return rowToPost(row as PostRow);
      } catch (err) {
        if (isUniqueViolation(err) && patch.slug) throw new SlugConflictError(patch.slug);
        throw err;
      }
    },

    async delete(id: string): Promise<void> {
      await pool.query(`DELETE FROM posts WHERE id = $1`, [id]);
    },

    async listTags(now: Date): Promise<Array<{ tag: string; count: number }>> {
      const { rows } = await pool.query(
        `SELECT unnest(tags) AS tag, COUNT(*)::int AS count
         FROM posts
         WHERE status = 'published' OR (status = 'scheduled' AND publish_at <= $1)
         GROUP BY tag
         ORDER BY count DESC, tag ASC`,
        [now],
      );
      return rows as Array<{ tag: string; count: number }>;
    },
  };
}
