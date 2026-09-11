import { createNeonPostStoreFromUrl } from '@thecbcreative/blog-admin/adapters/neon';
import type { PostStore } from '@thecbcreative/blog-admin/adapters';
import { createPostService, type PostService } from '@thecbcreative/blog-admin/service';
import { createSanitizer } from '@thecbcreative/blog-admin/core';
import { createLocalPgPostStore } from './local-pg-store';

let _store: PostStore | undefined;
let _service: PostService | undefined;

/**
 * The real adapter by default — Neon's HTTP query endpoint, exactly what a
 * deployed client site uses. Set LOCAL_PG=true to swap in a plain-Postgres
 * adapter for local development against a non-Neon database (see
 * LOCAL_DEV.md); the deployed demo never sets that flag.
 */
export function getPostStore(): PostStore {
  if (_store) return _store;
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set.');

  _store =
    process.env.LOCAL_PG === 'true'
      ? createLocalPgPostStore(databaseUrl)
      : createNeonPostStoreFromUrl(databaseUrl);

  return _store;
}

/** Layouts this demo offers — a stand-in for a client site's real layout set. */
export const DEMO_LAYOUTS = ['standard', 'photo-essay', 'guide'] as const;

export function getPostService(): PostService {
  if (_service) return _service;
  _service = createPostService(getPostStore(), {
    defaultAuthorName: 'Demo Author',
    layouts: DEMO_LAYOUTS,
    // Sanitizes on save; preview.astro and the (future) public post template
    // should sanitize again on render — belt and braces, since a row could
    // in principle be written by something other than this service.
    sanitizeHtml: createSanitizer(),
  });
  return _service;
}
