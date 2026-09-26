/**
 * Per-visitor sandboxes for the public demo.
 *
 * Every visitor signs in as the same demo account and shares one database, so
 * each browser gets its own short-lived sandbox (an id in a cookie) and sees
 * only the seeded placeholders it hasn't removed plus the posts it created.
 * Placeholders are never modified through the app: editing one saves a
 * private copy, and deleting one only hides it for this sandbox (a list kept
 * in the cookie). When the sandbox expires the visitor starts fresh and
 * cleanup (demo-cleanup.ts) deletes the abandoned posts.
 *
 * Ownership is recorded in the existing `tags` field with internal `demo-`
 * tags, which visitors can't set or remove.
 */
import type { Post, PostInput } from '@thecbcreative/blog-admin';
import type { ListOptions } from '@thecbcreative/blog-admin/adapters';
import type { PostService, ServiceResult } from '@thecbcreative/blog-admin/service';
import { demoPostMaxAgeMs, isInternalTag, isSeedPost, visibleTags } from './demo-cleanup';

export interface Sandbox {
  /** 16 lowercase hex characters — unguessable, and a valid tag segment. */
  id: string;
  /** Epoch ms when this sandbox started; it expires a fixed time after. */
  startedAt: number;
  /** Placeholder post ids this visitor has deleted (hidden only for them). */
  hidden: string[];
}

export const SANDBOX_COOKIE = 'bc_demo_sandbox';

const SANDBOX_PREFIX = 'demo-sandbox-';
const REPLACES_PREFIX = 'demo-replaces-';
/** Cap on hidden placeholder ids, which keeps the cookie small. */
export const MAX_HIDDEN = 50;
/** The demo stays small; one bounded read covers every row. */
const FETCH_LIMIT = 500;

const ID_RE = /^[a-f0-9]{16}$/;
const POST_ID_RE = /^[A-Za-z0-9-]{1,64}$/;

export const sandboxTag = (id: string) => `${SANDBOX_PREFIX}${id}`;

export function newSandbox(now: number = Date.now()): Sandbox {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  return { id, startedAt: now, hidden: [] };
}

/** Cookie format: `<id>.<startedAt>.<hiddenId>_<hiddenId>…` */
export function encodeSandbox(sandbox: Sandbox): string {
  return `${sandbox.id}.${sandbox.startedAt}.${sandbox.hidden.join('_')}`;
}

/** Returns null for anything malformed or expired, so the caller starts fresh. */
export function decodeSandbox(
  raw: string | undefined,
  now: number = Date.now(),
  maxAgeMs: number = demoPostMaxAgeMs(),
): Sandbox | null {
  if (!raw) return null;
  const [id, started, hiddenRaw = '', ...rest] = raw.split('.');
  if (rest.length > 0 || !id || !ID_RE.test(id) || !started || !/^\d{1,16}$/.test(started)) return null;

  const startedAt = Number(started);
  if (startedAt > now + 60_000 || now - startedAt >= maxAgeMs) return null;

  const hidden = hiddenRaw ? hiddenRaw.split('_') : [];
  if (hidden.length > MAX_HIDDEN || !hidden.every((h) => POST_ID_RE.test(h))) return null;

  return { id, startedAt, hidden };
}

/** Seconds until this sandbox expires — used as the cookie's max-age. */
export function sandboxSecondsLeft(sandbox: Sandbox, now: number = Date.now(), maxAgeMs = demoPostMaxAgeMs()): number {
  return Math.max(0, Math.floor((sandbox.startedAt + maxAgeMs - now) / 1000));
}

const isOwnedBy = (post: Post, sandboxId: string) => post.tags.includes(sandboxTag(sandboxId));

function replacedSeedId(post: Post): string | undefined {
  return post.tags.find((t) => t.startsWith(REPLACES_PREFIX))?.slice(REPLACES_PREFIX.length);
}

/** What one sandbox sees, in the order given: its own posts plus the placeholders it hasn't removed. */
export function visibleTo(posts: readonly Post[], sandbox: Sandbox): Post[] {
  const mine = posts.filter((p) => isOwnedBy(p, sandbox.id));
  const replaced = new Set(mine.map(replacedSeedId).filter((id): id is string => Boolean(id)));
  const hidden = new Set(sandbox.hidden);
  return posts.filter(
    (p) => isOwnedBy(p, sandbox.id) || (isSeedPost(p.tags) && !hidden.has(p.id) && !replaced.has(p.id)),
  );
}

function matchesStatus(post: Post, status: ListOptions['status']): boolean {
  if (!status) return true;
  return Array.isArray(status) ? status.includes(post.status) : post.status === status;
}

const notFound = (): ServiceResult<Post> => ({
  ok: false,
  errors: [{ field: 'form', message: 'That post no longer exists.' }],
});

export interface SandboxedServiceOptions {
  /** Called when the visitor deletes a placeholder, so the caller can persist the hidden list. */
  onHide: (seedId: string) => void;
}

/**
 * Wraps the real PostService so every read is filtered to this sandbox and
 * every write lands in it. The admin screens use this; cleanup and the seed
 * script use the unwrapped service.
 */
export function createSandboxedService(
  base: PostService,
  sandbox: Sandbox,
  { onHide }: SandboxedServiceOptions,
): PostService {
  const ownTag = sandboxTag(sandbox.id);

  async function allVisible(order?: ListOptions['order']): Promise<Post[]> {
    return visibleTo(await base.list({ limit: FETCH_LIMIT, ...(order ? { order } : {}) }), sandbox);
  }

  async function findVisible(id: string): Promise<Post | null> {
    const post = await base.get(id);
    if (!post) return null;
    return (await allVisible()).some((p) => p.id === post.id) ? post : null;
  }

  const service: PostService = {
    async list(opts) {
      const posts = (await allVisible(opts?.order)).filter((p) => matchesStatus(p, opts?.status));
      const offset = opts?.offset ?? 0;
      return posts.slice(offset, opts?.limit !== undefined ? offset + opts.limit : undefined);
    },

    async listLive(now) {
      const visibleIds = new Set((await allVisible()).map((p) => p.id));
      return (await base.listLive(now)).filter((p) => visibleIds.has(p.id));
    },

    async count(status) {
      return (await service.list(status ? { status } : undefined)).length;
    },

    get: findVisible,

    async getBySlug(slug) {
      const post = await base.getBySlug(slug);
      return post ? findVisible(post.id) : null;
    },

    async listTags(now) {
      const counts = new Map<string, number>();
      for (const post of await service.listLive(now)) {
        for (const tag of visibleTags(post.tags)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
      return [...counts].map(([tag, count]) => ({ tag, count }));
    },

    create(input, now) {
      return base.create({ ...input, tags: [...visibleTags(input.tags ?? []), ownTag] }, now);
    },

    async update(id, input, now) {
      const post = await findVisible(id);
      if (!post) return notFound();

      if (isSeedPost(post.tags)) {
        // Copy-on-write: the placeholder stays untouched for everyone else.
        const copy: PostInput = {
          headline: post.headline,
          subheadline: post.subheadline,
          slug: post.slug,
          body: post.body,
          excerpt: post.excerpt,
          featuredImage: post.featuredImage,
          layout: post.layout,
          status: post.status,
          publishAt: post.publishAt,
          authorName: post.authorName,
          seoTitle: post.seoTitle,
          seoDescription: post.seoDescription,
          canonicalUrl: post.canonicalUrl,
          relatedServices: post.relatedServices,
          ...input,
          tags: [...visibleTags(input.tags ?? post.tags), ownTag, `${REPLACES_PREFIX}${post.id}`],
        } as PostInput;
        return base.create(copy, now);
      }

      const tags = input.tags
        ? [...visibleTags(input.tags), ...post.tags.filter(isInternalTag)]
        : undefined;
      return base.update(id, { ...input, ...(tags ? { tags } : {}) }, now);
    },

    async delete(id) {
      const post = await findVisible(id);
      if (!post) return;

      if (isSeedPost(post.tags)) {
        onHide(post.id);
        return;
      }

      await base.delete(id);
      // Deleting your copy of a placeholder deletes what you were looking at,
      // so the original shouldn't reappear in its place.
      const original = replacedSeedId(post);
      if (original) onHide(original);
    },
  };

  return service;
}
