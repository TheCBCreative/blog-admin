import type { APIRoute } from 'astro';
import { withAuth } from '@thecbcreative/blog-admin/auth';
import { isPostStatus } from '@thecbcreative/blog-admin/core';
import { getAuth } from '../../../../lib/auth';
import { json } from '../../../../lib/http';
import { getSandboxedPostService } from '../../../../lib/sandbox-store';

export const prerender = false;

// Handlers are wrapped so they can reach this request's cookies and locals:
// every read and write goes through the visitor's sandbox (lib/sandbox.ts).
export const GET: APIRoute = (ctx) =>
  withAuth(getAuth(), async ({ request }) => {
    const statusParam = new URL(request.url).searchParams.get('status');
    const status = statusParam && isPostStatus(statusParam) ? statusParam : undefined;

    const posts = await getSandboxedPostService(ctx.locals, ctx.cookies).list(status ? { status } : undefined);
    return json({ posts });
  })(ctx);

export const POST: APIRoute = (ctx) =>
  withAuth(getAuth(), async ({ request }) => {
    const input = await request.json();
    const result = await getSandboxedPostService(ctx.locals, ctx.cookies).create(input);

    if (!result.ok) return json({ errors: result.errors }, 422);
    return json({ post: result.data }, 201);
  })(ctx);
