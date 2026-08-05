import { describe, it, expect, beforeEach } from 'vitest';
import { createPostService, type PostService } from '../src/service/post-service.js';
import type { PostStore } from '../src/adapters/types.js';
import type { NewPost, Post, PostPatch, PostStatus } from '../src/types.js';
import { isLive } from '../src/core/status.js';

/**
 * In-memory PostStore. Lets the service be tested without a database, and
 * doubles as a reference for what an adapter has to do.
 */
function createMemoryStore(): PostStore & { _all(): Post[] } {
  let seq = 0;
  const rows = new Map<string, Post>();

  const matchesStatus = (p: Post, status?: PostStatus | PostStatus[]) =>
    !status || (Array.isArray(status) ? status.includes(p.status) : p.status === status);

  return {
    _all: () => [...rows.values()],

    async list(opts = {}) {
      const all = [...rows.values()].filter((p) => matchesStatus(p, opts.status));
      all.sort((a, b) => {
        const av = (a.publishAt ?? a.createdAt).valueOf();
        const bv = (b.publishAt ?? b.createdAt).valueOf();
        return opts.order === 'oldest' ? av - bv : bv - av;
      });
      return all.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 100));
    },

    async listLive(now) {
      return [...rows.values()].filter((p) => isLive(p, now));
    },

    async count(opts = {}) {
      return [...rows.values()].filter((p) => matchesStatus(p, opts.status)).length;
    },

    async get(id) {
      return rows.get(id) ?? null;
    },

    async getBySlug(slug) {
      return [...rows.values()].find((p) => p.slug === slug) ?? null;
    },

    async slugExists(slug, excludeId) {
      return [...rows.values()].some((p) => p.slug === slug && p.id !== excludeId);
    },

    async create(input: NewPost) {
      const id = `id-${++seq}`;
      const now = new Date('2026-08-19T12:00:00Z');
      const post: Post = { ...input, id, createdAt: now, updatedAt: now };
      rows.set(id, post);
      return post;
    },

    async update(id, patch: PostPatch) {
      const existing = rows.get(id);
      if (!existing) throw new Error('not found');
      const updated: Post = { ...existing, ...patch, id, updatedAt: new Date() };
      rows.set(id, updated);
      return updated;
    },

    async delete(id) {
      rows.delete(id);
    },

    async listTags(now) {
      const counts = new Map<string, number>();
      for (const p of rows.values()) {
        if (!isLive(p, now)) continue;
        for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
      return [...counts.entries()].map(([tag, count]) => ({ tag, count }));
    },
  };
}

const now = new Date('2026-08-19T12:00:00Z');
const future = new Date('2026-08-20T12:00:00Z');
const past = new Date('2026-08-18T12:00:00Z');

let store: ReturnType<typeof createMemoryStore>;
let service: PostService;

beforeEach(() => {
  store = createMemoryStore();
  service = createPostService(store, {
    defaultAuthorName: 'Erika Peschel',
    layouts: ['standard', 'wide-hero'],
  });
});

const ok = <T>(r: { ok: boolean } & Record<string, unknown>): T => {
  if (!r.ok) throw new Error(`expected ok, got errors: ${JSON.stringify(r.errors)}`);
  return r.data as T;
};

describe('create', () => {
  it('derives a slug from the headline', async () => {
    const post = ok<Post>(await service.create({ headline: 'What To Expect' }, now));
    expect(post.slug).toBe('what-to-expect');
  });

  it('honours an explicit slug', async () => {
    const post = ok<Post>(await service.create({ headline: 'Anything', slug: 'custom-slug' }, now));
    expect(post.slug).toBe('custom-slug');
  });

  it('suffixes a colliding slug instead of failing', async () => {
    await service.create({ headline: 'Same Title' }, now);
    const second = ok<Post>(await service.create({ headline: 'Same Title' }, now));
    expect(second.slug).toBe('same-title-2');
  });

  it('applies defaults for author and layout', async () => {
    const post = ok<Post>(await service.create({ headline: 'Defaults' }, now));
    expect(post.authorName).toBe('Erika Peschel');
    expect(post.layout).toBe('standard');
    expect(post.status).toBe('draft');
  });

  it('returns field errors rather than throwing', async () => {
    const result = await service.create({ headline: '' }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('headline');
  });

  it('rejects an image without alt text', async () => {
    const result = await service.create(
      { headline: 'Has image', featuredImage: { url: '/i.jpg' } },
      now,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects a layout the project does not offer', async () => {
    const result = await service.create({ headline: 'Bad layout', layout: 'nope' }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('layout');
  });

  it('stamps publishedAt when created as published', async () => {
    const post = ok<Post>(await service.create({ headline: 'Live now', status: 'published' }, now));
    expect(post.publishedAt).toEqual(now);
  });

  it('leaves publishedAt unset for a draft', async () => {
    const post = ok<Post>(await service.create({ headline: 'Draft' }, now));
    expect(post.publishedAt).toBeUndefined();
  });

  it('accepts a future schedule and stores the instant', async () => {
    const post = ok<Post>(
      await service.create({ headline: 'Later', status: 'scheduled', publishAt: future }, now),
    );
    expect(post.status).toBe('scheduled');
    expect(post.publishAt).toEqual(future);
    expect(isLive(post, now)).toBe(false);
  });

  it('rejects a schedule in the past', async () => {
    const result = await service.create(
      { headline: 'Too late', status: 'scheduled', publishAt: past },
      now,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('publishAt');
  });
});

describe('update', () => {
  it('patches only what was passed', async () => {
    const post = ok<Post>(
      await service.create({ headline: 'Original', excerpt: 'Keep me' }, now),
    );
    const updated = ok<Post>(await service.update(post.id, { headline: 'Changed' }, now));

    expect(updated.headline).toBe('Changed');
    expect(updated.excerpt).toBe('Keep me');
  });

  it('keeps the existing slug when it was not changed', async () => {
    const post = ok<Post>(await service.create({ headline: 'Stable Slug' }, now));
    const updated = ok<Post>(await service.update(post.id, { headline: 'New Headline' }, now));
    // Renaming the headline must not silently move the URL.
    expect(updated.slug).toBe('stable-slug');
  });

  it('does not suffix a post with its own slug', async () => {
    const post = ok<Post>(await service.create({ headline: 'Mine' }, now));
    const updated = ok<Post>(await service.update(post.id, { slug: 'mine' }, now));
    expect(updated.slug).toBe('mine');
  });

  it('suffixes when moving to a slug another post holds', async () => {
    await service.create({ headline: 'Taken' }, now);
    const other = ok<Post>(await service.create({ headline: 'Other' }, now));
    const updated = ok<Post>(await service.update(other.id, { slug: 'taken' }, now));
    expect(updated.slug).toBe('taken-2');
  });

  it('validates the merged post, not just the patch', async () => {
    const post = ok<Post>(await service.create({ headline: 'Draft' }, now));
    // The patch alone looks fine; merged, it's a schedule with no time — which
    // would produce a post that never becomes visible.
    const result = await service.update(post.id, { status: 'scheduled' }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('publishAt');
  });

  it('never resets publishedAt on edit', async () => {
    const post = ok<Post>(
      await service.create({ headline: 'Published', status: 'published' }, past),
    );
    expect(post.publishedAt).toEqual(past);

    const later = new Date('2026-09-01T12:00:00Z');
    const updated = ok<Post>(await service.update(post.id, { headline: 'Edited' }, later));
    // Resetting this would move datePublished in the schema and misrepresent
    // the post's age to search engines.
    expect(updated.publishedAt).toEqual(past);
  });

  it('reports a missing post as a field error', async () => {
    const result = await service.update('nope', { headline: 'x' }, now);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((e) => e.field)).toContain('id');
  });
});

describe('reads', () => {
  it('separates live posts from drafts and pending schedules', async () => {
    await service.create({ headline: 'Live', status: 'published' }, now);
    await service.create({ headline: 'Draft' }, now);
    await service.create({ headline: 'Pending', status: 'scheduled', publishAt: future }, now);

    const live = await service.listLive(now);
    expect(live.map((p) => p.headline)).toEqual(['Live']);
  });

  it('treats a fired schedule as live', async () => {
    await service.create({ headline: 'Fires soon', status: 'scheduled', publishAt: future }, now);

    const afterItFires = new Date('2026-08-21T12:00:00Z');
    const live = await service.listLive(afterItFires);
    expect(live.map((p) => p.headline)).toEqual(['Fires soon']);
  });

  it('counts by status', async () => {
    await service.create({ headline: 'A' }, now);
    await service.create({ headline: 'B' }, now);
    await service.create({ headline: 'C', status: 'published' }, now);

    expect(await service.count('draft')).toBe(2);
    expect(await service.count('published')).toBe(1);
    expect(await service.count()).toBe(3);
  });

  it('aggregates tags across live posts only', async () => {
    await service.create({ headline: 'Live', status: 'published', tags: ['botox'] }, now);
    await service.create({ headline: 'Draft', tags: ['botox'] }, now);

    const tags = await service.listTags(now);
    expect(tags).toEqual([{ tag: 'botox', count: 1 }]);
  });
});

describe('sanitizeHtml hook', () => {
  it('passes body content through the configured sanitizer', async () => {
    const svc = createPostService(store, {
      defaultAuthorName: 'A',
      layouts: ['standard'],
      sanitizeHtml: (html) => html.replace(/<script[\s\S]*?<\/script>/gi, ''),
    });

    const post = ok<Post>(
      await svc.create({ headline: 'Sanitized', body: '<p>ok</p><script>bad()</script>' }, now),
    );
    expect(post.body).toBe('<p>ok</p>');
  });
});
