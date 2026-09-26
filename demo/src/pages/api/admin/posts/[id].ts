import type { APIRoute } from 'astro';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { getAuth } from '../../../../lib/auth';
import { json } from '../../../../lib/http';
import { getSandboxedPostService } from '../../../../lib/sandbox-store';

export const prerender = false;

// Every handler is scoped to the visitor's sandbox (lib/sandbox.ts): editing a
// placeholder saves a private copy and deleting one only hides it.

const postId = (request: Request) => new URL(request.url).pathname.split('/').pop()!;

export const GET: APIRoute = (ctx) =>
  withAuth(getAuth(), async ({ request }) => {
    const post = await getSandboxedPostService(ctx.locals, ctx.cookies).get(postId(request));
    if (!post) return json({ error: 'Not found' }, 404);
    return json({ post });
  })(ctx);

export const PATCH: APIRoute = (ctx) =>
  withAuth(getAuth(), async ({ request }) => {
    const input = await request.json();
    const result = await getSandboxedPostService(ctx.locals, ctx.cookies).update(postId(request), input);

    if (!result.ok) return json({ errors: result.errors }, 422);
    return json({ post: result.data });
  })(ctx);

export const DELETE: APIRoute = (ctx) =>
  withAuth(getAuth(), async ({ request }) => {
    await getSandboxedPostService(ctx.locals, ctx.cookies).delete(postId(request));
    return new Response(null, { status: 204 });
  })(ctx);
