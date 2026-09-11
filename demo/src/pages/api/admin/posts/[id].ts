import type { APIRoute } from 'astro';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { getAuth } from '../../../../lib/auth';
import { getPostService } from '../../../../lib/store';

export const prerender = false;

export const GET: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const id = new URL(request.url).pathname.split('/').pop()!;
  const post = await getPostService().get(id);
  if (!post) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
  return new Response(JSON.stringify({ post }), { headers: { 'content-type': 'application/json' } });
});

export const PATCH: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const id = new URL(request.url).pathname.split('/').pop()!;
  const input = await request.json();
  const result = await getPostService().update(id, input);

  if (!result.ok) {
    return new Response(JSON.stringify({ errors: result.errors }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    });
  }
  return new Response(JSON.stringify({ post: result.data }), {
    headers: { 'content-type': 'application/json' },
  });
});

export const DELETE: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const id = new URL(request.url).pathname.split('/').pop()!;
  await getPostService().delete(id);
  return new Response(null, { status: 204 });
});
