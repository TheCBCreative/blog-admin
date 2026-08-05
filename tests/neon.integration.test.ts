/**
 * Integration tests for the Neon adapter.
 *
 * Requires a real database. Skips itself when DATABASE_URL is unset, so
 * `npm test` still passes on a machine without one.
 *
 *   DATABASE_URL='postgres://...' npm test
 *
 * Every row created here uses the TEST_PREFIX slug and is removed in cleanup,
 * so it's safe to point at a dev database. Do not point it at production.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { createNeonPostStore } from '../src/adapters/neon/index.js';
import { SlugConflictError, PostNotFoundError } from '../src/adapters/types.js';
import type { PostStore } from '../src/adapters/types.js';
import type { NewPost } from '../src/types.js';

const DATABASE_URL = process.env.DATABASE_URL;
const TEST_PREFIX = 'zz-itest-';

// describe.skipIf keeps the suite green without a database rather than failing.
const suite = describe.skipIf(!DATABASE_URL);

suite('Neon PostStore', () => {
  let store: PostStore;
  let sql: ReturnType<typeof neon>;

  const makePost = (overrides: Partial<NewPost> = {}): NewPost => ({
    slug: `${TEST_PREFIX}${Math.random().toString(36).slice(2, 10)}`,
    headline: 'Integration test post',
    body: '<p>Body</p>',
    layout: 'standard',
    status: 'draft',
    authorName: 'Test Author',
    tags: [],
    relatedServices: [],
    ...overrides,
  });

  beforeAll(() => {
    sql = neon(DATABASE_URL!);
    store = createNeonPostStore(sql as never);
  });

  afterAll(async () => {
    // Parameterized LIKE — never interpolate even in teardown.
    await sql`DELETE FROM posts WHERE slug LIKE ${TEST_PREFIX + '%'}`;
  });

  it('round-trips a post through create and get', async () => {
    const input = makePost({ subheadline: 'A subheadline', excerpt: 'An excerpt' });
    const created = await store.create(input);

    expect(created.id).toBeTruthy();
    expect(created.slug).toBe(input.slug);
    expect(created.headline).toBe(input.headline);
    expect(created.subheadline).toBe('A subheadline');
    expect(created.status).toBe('draft');
    // Adapters must return Dates, not ISO strings.
    expect(created.createdAt).toBeInstanceOf(Date);

    const fetched = await store.get(created.id);
    expect(fetched?.id).toBe(created.id);
  });

  it('finds a post by slug and returns null for a miss', async () => {
    const created = await store.create(makePost());
    expect((await store.getBySlug(created.slug))?.id).toBe(created.id);
    expect(await store.getBySlug(`${TEST_PREFIX}definitely-not-real`)).toBeNull();
  });

  it('maps an image with its alt text, and omits it entirely when absent', async () => {
    const withImage = await store.create(
      makePost({ featuredImage: { url: '/i.jpg', alt: 'A description', width: 1200, height: 800 } }),
    );
    expect(withImage.featuredImage).toEqual({
      url: '/i.jpg',
      alt: 'A description',
      width: 1200,
      height: 800,
    });

    const without = await store.create(makePost());
    expect(without.featuredImage).toBeUndefined();
  });

  it('rejects a duplicate slug with SlugConflictError', async () => {
    const first = await store.create(makePost());
    await expect(store.create(makePost({ slug: first.slug }))).rejects.toBeInstanceOf(SlugConflictError);
  });

  it('reports slug availability, excluding the post itself on edit', async () => {
    const post = await store.create(makePost());
    expect(await store.slugExists(post.slug)).toBe(true);
    // A post keeping its own slug during an edit must not read as taken.
    expect(await store.slugExists(post.slug, post.id)).toBe(false);
    expect(await store.slugExists(`${TEST_PREFIX}free-slug`)).toBe(false);
  });

  it('patches only the fields provided', async () => {
    const post = await store.create(makePost({ headline: 'Original', excerpt: 'Keep me' }));
    const updated = await store.update(post.id, { headline: 'Changed' });

    expect(updated.headline).toBe('Changed');
    expect(updated.excerpt).toBe('Keep me');
    expect(updated.id).toBe(post.id);
  });

  it('throws PostNotFoundError when updating a missing post', async () => {
    const missing = '00000000-0000-0000-0000-000000000000';
    await expect(store.update(missing, { headline: 'x' })).rejects.toBeInstanceOf(PostNotFoundError);
  });

  it('deletes a post', async () => {
    const post = await store.create(makePost());
    await store.delete(post.id);
    expect(await store.get(post.id)).toBeNull();
  });

  describe('listLive', () => {
    it('includes published, excludes drafts and archived', async () => {
      const published = await store.create(makePost({ status: 'published', publishedAt: new Date() }));
      const draft = await store.create(makePost({ status: 'draft' }));
      const archived = await store.create(makePost({ status: 'archived' }));

      const live = await store.listLive(new Date(), { limit: 500 });
      const ids = live.map((p) => p.id);

      expect(ids).toContain(published.id);
      expect(ids).not.toContain(draft.id);
      expect(ids).not.toContain(archived.id);
    });

    it('includes a scheduled post only once its time has passed', async () => {
      const past = new Date(Date.now() - 60_000);
      const future = new Date(Date.now() + 60 * 60_000);

      const fired = await store.create(makePost({ status: 'scheduled', publishAt: past }));
      const pending = await store.create(makePost({ status: 'scheduled', publishAt: future }));

      const live = await store.listLive(new Date(), { limit: 500 });
      const ids = live.map((p) => p.id);

      // This is the SQL mirror of core/status.ts isLive() — if these disagree,
      // the public site and the admin will disagree about what's visible.
      expect(ids).toContain(fired.id);
      expect(ids).not.toContain(pending.id);
    });
  });

  it('filters and counts by status', async () => {
    const before = await store.count({ status: 'draft' });
    await store.create(makePost({ status: 'draft' }));
    expect(await store.count({ status: 'draft' })).toBe(before + 1);

    const drafts = await store.list({ status: 'draft', limit: 500 });
    expect(drafts.every((p) => p.status === 'draft')).toBe(true);
  });

  it('aggregates tags across live posts only', async () => {
    const tag = `${TEST_PREFIX}tag`;
    await store.create(makePost({ status: 'published', tags: [tag], publishedAt: new Date() }));
    await store.create(makePost({ status: 'draft', tags: [tag] }));

    const tags = await store.listTags(new Date());
    const found = tags.find((t) => t.tag === tag);

    // Only the published one counts — a draft's tags shouldn't create a public
    // tag archive page.
    expect(found?.count).toBe(1);
  });

  describe('database-level constraints', () => {
    it('rejects an image without alt text', async () => {
      await expect(sql`
        INSERT INTO posts (slug, headline, author_name, image_url)
        VALUES (${TEST_PREFIX + 'noalt'}, 'No alt', 'A', '/i.jpg')
      `).rejects.toThrow();
    });

    it('rejects a scheduled post with no publish time', async () => {
      await expect(sql`
        INSERT INTO posts (slug, headline, author_name, status)
        VALUES (${TEST_PREFIX + 'nosched'}, 'No time', 'A', 'scheduled')
      `).rejects.toThrow();
    });

    it('rejects an unrecognized status', async () => {
      await expect(sql`
        INSERT INTO posts (slug, headline, author_name, status)
        VALUES (${TEST_PREFIX + 'badstatus'}, 'Bad', 'A', 'nonsense')
      `).rejects.toThrow();
    });
  });
});
