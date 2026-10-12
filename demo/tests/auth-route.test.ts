/**
 * The demo's auth route only passes through sign-in, sign-out and get-session,
 * so nobody can change the shared demo account's password or profile.
 *
 *   npm test   (from demo/)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const handler = vi.fn(async (_request: Request) => new Response('ok', { status: 200 }));
vi.mock('../src/lib/auth', () => ({ getAuth: () => ({ handler }) }));

const { ALL } = await import('../src/pages/api/auth/[...all]');

function call(path: string, method = 'POST') {
  const request = new Request(`http://localhost:4321/api/auth${path}`, { method });
  return ALL({ request, clientAddress: '127.0.0.1' } as Parameters<typeof ALL>[0]);
}

describe('demo auth route', () => {
  beforeEach(() => handler.mockClear());

  it.each(['/change-password', '/update-user'])('returns 404 for %s', async (path) => {
    const response = await call(path);
    expect(response.status).toBe(404);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['/delete-user', '/sign-up/email', '/request-password-reset', '/reset-password'])(
    'returns 404 for %s',
    async (path) => {
      expect((await call(path)).status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['/sign-in/email', 'POST'],
    ['/sign-out', 'POST'],
    ['/get-session', 'GET'],
  ])('passes %s through to Better Auth', async (path, method) => {
    const response = await call(path, method);
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('does not match allowed paths as prefixes', async () => {
    expect((await call('/sign-in/email/extra')).status).toBe(404);
    expect((await call('/get-session-other', 'GET')).status).toBe(404);
  });
});

describe('client IP forwarding', () => {
  beforeEach(() => handler.mockClear());

  it('replaces a spoofed x-forwarded-for with the platform-resolved address', async () => {
    const request = new Request('http://localhost:4321/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'x-forwarded-for': '1.2.3.4, 203.0.113.9', 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@b.c', password: 'x' }),
    });
    await ALL({ request, clientAddress: '203.0.113.9' } as Parameters<typeof ALL>[0]);

    const forwarded = handler.mock.calls[0][0];
    expect(forwarded.headers.get('x-forwarded-for')).toBe('203.0.113.9');
    expect(await forwarded.json()).toEqual({ email: 'a@b.c', password: 'x' });
  });
});
