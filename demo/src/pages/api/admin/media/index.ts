import type { APIRoute } from 'astro';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { getAuth } from '../../../../lib/auth';
import { json } from '../../../../lib/http';
import { UPLOAD_DIR, createLocalDiskMediaStore } from '../../../../lib/media-store';
import { withBase } from '../../../../lib/base-path';

export const prerender = false;

// Server-side media API over lib/media-store.ts. The public demo's Media
// Library doesn't use it: visitor uploads stay in their browser
// (lib/browser-media.ts). URLs are stored unprefixed and only get the base
// path in the response sent to the browser.

export const GET: APIRoute = withAuth(getAuth(), async () => {
  const files = await readdir(UPLOAD_DIR).catch((): string[] => []);

  const items = await Promise.all(
    files
      .filter((f) => !f.startsWith('.'))
      .map(async (f) => {
        const s = await stat(join(UPLOAD_DIR, f));
        return { url: withBase(`/uploads/${f}`), name: f, bytes: s.size, uploadedAt: s.mtime };
      }),
  );

  items.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
  return json({ items });
});

export const POST: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) return json({ error: 'No file provided.' }, 400);

  try {
    const media = await createLocalDiskMediaStore().upload(file);
    return json({ media: { ...media, url: withBase(media.url) } }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return json({ error: message }, 422);
  }
});

// Uploads are addressed by bare filename only (no slashes, no leading dot), so
// a request can never reach outside public/uploads.
const SAFE_NAME = /^[A-Za-z0-9][\w.-]*$/;

export const DELETE: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const name = new URL(request.url).searchParams.get('name') ?? '';
  if (!SAFE_NAME.test(name)) return json({ error: 'Invalid file name.' }, 400);

  await createLocalDiskMediaStore().delete(`/uploads/${name}`);
  return new Response(null, { status: 204 });
});
