import type { APIRoute } from 'astro';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { getAuth } from '../../../../lib/auth';
import { createLocalDiskMediaStore } from '../../../../lib/media-store';
import { withBase } from '../../../../lib/base-path';

export const prerender = false;

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

export const GET: APIRoute = withAuth(getAuth(), async () => {
  let files: string[] = [];
  try {
    files = await readdir(UPLOAD_DIR);
  } catch {
    files = [];
  }

  const items = await Promise.all(
    files
      .filter((f) => !f.startsWith('.'))
      .map(async (f) => {
        const s = await stat(join(UPLOAD_DIR, f));
        // Stored/matched internally as an unprefixed path (see media-store.ts's
        // delete()) — only prefixed here, at the point it's sent to the browser.
        return { url: withBase(`/uploads/${f}`), name: f, bytes: s.size, uploadedAt: s.mtime };
      }),
  );

  items.sort((a, b) => +new Date(b.uploadedAt) - +new Date(a.uploadedAt));
  return new Response(JSON.stringify({ items }), { headers: { 'content-type': 'application/json' } });
});

export const POST: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const form = await request.formData();
  const file = form.get('file');

  if (!(file instanceof File)) {
    return new Response(JSON.stringify({ error: 'No file provided.' }), { status: 400 });
  }

  try {
    const media = await createLocalDiskMediaStore().upload(file);
    // Same as GET above: prefix only in the outbound response, never in the
    // internally-stored/matched value.
    return new Response(JSON.stringify({ media: { ...media, url: withBase(media.url) } }), {
      status: 201,
      headers: { 'content-type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed.';
    return new Response(JSON.stringify({ error: message }), { status: 422 });
  }
});
