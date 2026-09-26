import { createNeonPostStoreFromUrl } from '@thecbcreative/blog-admin/adapters/neon';
import type { PostStore } from '@thecbcreative/blog-admin/adapters';
import { createPostService, type PostService } from '@thecbcreative/blog-admin/service';
import { createSanitizer } from '@thecbcreative/blog-admin/core';
import { createLocalPgPostStore } from './local-pg-store';

let _store: PostStore | undefined;
let _service: PostService | undefined;

/**
 * The Neon adapter a deployed client site uses, or, with LOCAL_PG=true, a
 * plain-Postgres adapter for local development (see LOCAL_DEV.md).
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
    // Sanitizes on save. Render-side code should sanitize again, since a row
    // could be written by something other than this service.
    sanitizeHtml: createSanitizer(),
  });
  return _service;
}
