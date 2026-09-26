/**
 * The per-visitor sandbox (src/lib/sandbox.ts) — the thing that keeps one
 * visitor's edits out of everyone else's demo.
 *
 *   npm test   (from demo/)
 */
import { describe, expect, it } from 'vitest';
import type { Post, PostInput } from '@thecbcreative/blog-admin';
import type { PostService } from '@thecbcreative/blog-admin/service';
import {
  createSandboxedService,
  decodeSandbox,
  encodeSandbox,
  newSandbox,
  sandboxTag,
  visibleTo,
  type Sandbox,
} from '../src/lib/sandbox';
import { SEED_TAG, visibleTags } from '../src/lib/demo-cleanup';

const HOUR = 60 * 60 * 1000;
let nextId = 1;

function makePost(partial: Partial<Post> & { tags: string[] }): Post {
  const now = new Date('2026-09-26T12:00:00Z');
  return {
    id: `p${nextId++}`,
    slug: `post-${nextId}`,
    headline: 'Headline',
    body: '<p>Body</p>',
    layout: 'standard',
    status: 'draft',
    authorName: 'Demo Author',
    relatedServices: [],
    createdAt: now,
    updatedAt: now,
    ...partial,
  } as Post;
}

/** In-memory stand-in for the real PostService — only what the wrapper calls. */
function fakeService(posts: Post[]): PostService & { rows: Post[] } {
  const rows = posts;
  return {
    rows,
    async list() {
      return [...rows];
    },
    async listLive() {
      return rows.filter((p) => p.status === 'published');
    },
    async count() {
      return rows.length;
    },
    async get(id) {
      return rows.find((p) => p.id === id) ?? null;
    },
    async getBySlug(slug) {
      return rows.find((p) => p.slug === slug) ?? null;
    },
    async listTags() {
      return [];
    },
    async create(input: PostInput) {
      const post = makePost({ ...(input as Partial<Post>), tags: input.tags ?? [] });
      rows.push(post);
      return { ok: true, data: post };
    },
    async update(id, input) {
      const post = rows.find((p) => p.id === id);
      if (!post) return { ok: false, errors: [{ field: 'form', message: 'missing' }] };
      Object.assign(post, input);
      return { ok: true, data: post };
    },
    async delete(id) {
      const i = rows.findIndex((p) => p.id === id);
      if (i >= 0) rows.splice(i, 1);
    },
  };
}

function setup() {
  const seed = makePost({ headline: 'Seed', tags: ['news', SEED_TAG], status: 'published' });
  const seed2 = makePost({ headline: 'Seed 2', tags: [SEED_TAG] });
  const base = fakeService([seed, seed2]);
  const alice: Sandbox = { id: 'a'.repeat(16), startedAt: Date.now(), hidden: [] };
  const bob: Sandbox = { id: 'b'.repeat(16), startedAt: Date.now(), hidden: [] };
  const forAlice = createSandboxedService(base, alice, { onHide: (id) => alice.hidden.push(id) });
  const forBob = createSandboxedService(base, bob, { onHide: (id) => bob.hidden.push(id) });
  return { base, seed, seed2, alice, bob, forAlice, forBob };
}

describe('demo sandbox', () => {
  it("keeps a visitor's new posts out of everyone else's view", async () => {
    const { forAlice, forBob } = setup();
    const created = await forAlice.create({ headline: 'Mine', tags: ['news'] });
    expect(created.ok).toBe(true);

    expect((await forAlice.list()).map((p) => p.headline)).toContain('Mine');
    expect((await forBob.list()).map((p) => p.headline)).not.toContain('Mine');
    expect(await forBob.get(created.ok ? created.data.id : '')).toBeNull();
  });

  it('saves an edit to a placeholder as a private copy and leaves the original untouched', async () => {
    const { base, seed, forAlice, forBob } = setup();
    const result = await forAlice.update(seed.id, { headline: 'Alice was here' });

    expect(result.ok).toBe(true);
    const copy = result.ok ? result.data : null;
    expect(copy?.id).not.toBe(seed.id);
    expect((await base.get(seed.id))?.headline).toBe('Seed');

    const aliceSees = (await forAlice.list()).map((p) => p.headline);
    expect(aliceSees).toContain('Alice was here');
    expect(aliceSees).not.toContain('Seed'); // replaced by her copy
    expect((await forBob.list()).map((p) => p.headline)).toContain('Seed');
  });

  it('hides a deleted placeholder for that visitor only, without deleting it', async () => {
    const { base, seed, alice, forAlice, forBob } = setup();
    await forAlice.delete(seed.id);

    expect(alice.hidden).toEqual([seed.id]);
    expect(await base.get(seed.id)).not.toBeNull();
    expect(await forAlice.get(seed.id)).toBeNull();
    expect(await forBob.get(seed.id)).not.toBeNull();
  });

  it("can't touch another visitor's posts", async () => {
    const { base, forAlice, forBob } = setup();
    const created = await forAlice.create({ headline: 'Mine', tags: [] });
    const id = created.ok ? created.data.id : '';

    expect((await forBob.update(id, { headline: 'Hijacked' })).ok).toBe(false);
    await forBob.delete(id);
    expect((await base.get(id))?.headline).toBe('Mine');
  });

  it('strips internal tags a visitor tries to set, so nobody can forge a placeholder or another sandbox', async () => {
    const { bob, forAlice, forBob } = setup();
    const created = await forAlice.create({ headline: 'Sneaky', tags: ['news', SEED_TAG, sandboxTag(bob.id)] });
    const tags = created.ok ? created.data.tags : [];

    expect(tags).not.toContain(SEED_TAG);
    expect(tags).not.toContain(sandboxTag(bob.id));
    expect(visibleTags(tags)).toEqual(['news']);
    expect((await forBob.list()).map((p) => p.headline)).not.toContain('Sneaky');
  });

  it("doesn't bring the original back when a visitor deletes their copy of it", async () => {
    const { seed, alice, forAlice } = setup();
    const result = await forAlice.update(seed.id, { headline: 'Copy' });
    await forAlice.delete(result.ok ? result.data.id : '');

    expect(alice.hidden).toContain(seed.id);
    expect((await forAlice.list()).map((p) => p.headline)).not.toContain('Seed');
  });

  it('filters counts and status listings to the sandbox', async () => {
    const { forAlice, forBob } = setup();
    await forAlice.create({ headline: 'Draft', tags: [], status: 'draft' });
    expect(await forAlice.count('draft')).toBe(2);
    expect(await forBob.count('draft')).toBe(1);
    expect(await forBob.count('published')).toBe(1);
  });

  it('shows orphaned visitor posts (no sandbox tag) to nobody', () => {
    const orphan = makePost({ headline: 'Old visitor post', tags: [] });
    const sandbox: Sandbox = { id: 'c'.repeat(16), startedAt: Date.now(), hidden: [] };
    expect(visibleTo([orphan], sandbox)).toEqual([]);
  });
});

describe('sandbox cookie', () => {
  it('round-trips', () => {
    const sandbox = { ...newSandbox(1_790_000_000_000), hidden: ['p1', 'abc-123'] };
    expect(decodeSandbox(encodeSandbox(sandbox), 1_790_000_000_000 + HOUR, 2 * HOUR)).toEqual(sandbox);
  });

  it('expires after the retention window, so a returning visitor starts fresh', () => {
    const sandbox = newSandbox(1_790_000_000_000);
    expect(decodeSandbox(encodeSandbox(sandbox), 1_790_000_000_000 + 2 * HOUR, 2 * HOUR)).toBeNull();
  });

  it('rejects malformed values', () => {
    const now = 1_790_000_000_000;
    for (const raw of ['', 'nope', `${'a'.repeat(15)}.${now}.`, `${'a'.repeat(16)}.${now}.x/y`, `${'a'.repeat(16)}.${now + 10 * HOUR}.`]) {
      expect(decodeSandbox(raw, now, 2 * HOUR)).toBeNull();
    }
  });
});
