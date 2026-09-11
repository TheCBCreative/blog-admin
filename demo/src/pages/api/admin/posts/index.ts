import type { APIRoute } from 'astro';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { isPostStatus } from '@thecbcreative/blog-admin/core';
import { getAuth } from '../../../../lib/auth';
import { getPostService } from '../../../../lib/store';

export const prerender = false;

export const GET: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const url = new URL(request.url);
  const statusParam = url.searchParams.get('status');
  const status = statusParam && isPostStatus(statusParam) ? statusParam : undefined;

  const posts = await getPostService().list(status ? { status } : undefined);
  return new Response(JSON.stringify({ posts }), {
    headers: { 'content-type': 'application/json' },
  });
});

export const POST: APIRoute = withAuth(getAuth(), async ({ request }) => {
  const input = await request.json();
  const result = await getPostService().create(input);

  if (!result.ok) {
    return new Response(JSON.stringify({ errors: result.errors }), {
      status: 422,
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ post: result.data }), {
    status: 201,
    headers: { 'content-type': 'application/json' },
  });
});
