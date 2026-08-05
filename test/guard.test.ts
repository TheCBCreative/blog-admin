import { describe, expect, it } from 'vitest';
import { createAdminGuard } from '../src/auth/guard.js';
import type { BlogAuth } from '../src/auth/create-auth.js';

/** Stand-in for a Better Auth instance; only getSession is exercised here. */
function fakeAuth(hasSession: boolean): BlogAuth {
  return {
    api: {
      getSession: async () => (hasSession ? { user: { id: 'u' }, session: { id: 's' } } : null),
    },
  } as unknown as BlogAuth;
}

type Outcome = 'next' | '401' | `redirect:${string}`;

async function visit(
  guard: ReturnType<typeof createAdminGuard>,
  pathname: string,
  search = '',
): Promise<Outcome> {
  const url = new URL(`http://example.test${pathname}${search}`);
  const response = await guard(
    {
      request: new Request(url),
      url,
      locals: {},
      redirect: (path: string) => new Response(null, { status: 302, headers: { location: path } }),
    },
    async () => new Response('next'),
  );

  if (response.status === 302) return `redirect:${response.headers.get('location')}`;
  if (response.status === 401) return '401';
  return 'next';
}

const anon = () => createAdminGuard({ auth: fakeAuth(false) });
const signedIn = () => createAdminGuard({ auth: fakeAuth(true) });

describe('createAdminGuard — password recovery must stay reachable', () => {
  /**
   * Regression test. These pages sit under /admin, and protecting them meant an
   * anonymous visitor was redirected to the login page — so clicking "forgot
   * password" appeared to do nothing at all.
   */
  it('lets an anonymous visitor reach forgot-password', async () => {
    expect(await visit(anon(), '/admin/forgot-password')).toBe('next');
  });

  it('lets an anonymous visitor reach reset-password with a token', async () => {
    expect(await visit(anon(), '/admin/reset-password', '?token=abc')).toBe('next');
  });

  it('tolerates a trailing slash', async () => {
    // Which form arrives depends on Astro's trailingSlash setting.
    expect(await visit(anon(), '/admin/forgot-password/')).toBe('next');
  });

  it('lets an anonymous visitor reach the login page', async () => {
    expect(await visit(anon(), '/admin/login')).toBe('next');
  });
});

describe('createAdminGuard — everything else stays protected', () => {
  it('redirects anonymous page requests, preserving the destination', async () => {
    expect(await visit(anon(), '/admin/posts/')).toBe(
      'redirect:/admin/login?next=%2Fadmin%2Fposts%2F',
    );
  });

  it('preserves the query string in next', async () => {
    expect(await visit(anon(), '/admin/posts', '?page=2')).toBe(
      'redirect:/admin/login?next=%2Fadmin%2Fposts%3Fpage%3D2',
    );
  });

  it('protects the account page', async () => {
    expect(await visit(anon(), '/admin/account')).toBe(
      'redirect:/admin/login?next=%2Fadmin%2Faccount',
    );
  });

  it('returns 401 JSON for admin API paths rather than redirecting', async () => {
    expect(await visit(anon(), '/api/admin/posts')).toBe('401');
  });

  it('lets a signed-in user through', async () => {
    expect(await visit(signedIn(), '/admin/posts/')).toBe('next');
  });

  it('leaves the public site alone', async () => {
    expect(await visit(anon(), '/')).toBe('next');
    expect(await visit(anon(), '/blog/')).toBe('next');
  });

  it('does not match a lookalike prefix', async () => {
    // /administrator is not under /admin.
    expect(await visit(anon(), '/administrator')).toBe('next');
  });
});

describe('createAdminGuard — publicPaths option', () => {
  it('accepts additional public paths', async () => {
    const guard = createAdminGuard({ auth: fakeAuth(false), publicPaths: ['/admin/invite'] });
    expect(await visit(guard, '/admin/invite')).toBe('next');
  });

  it('adds to the defaults rather than replacing them', async () => {
    // A consumer setting publicPaths must not silently lock out recovery.
    const guard = createAdminGuard({ auth: fakeAuth(false), publicPaths: ['/admin/invite'] });
    expect(await visit(guard, '/admin/forgot-password')).toBe('next');
    expect(await visit(guard, '/admin/login')).toBe('next');
  });

  it('cannot be used to expose an API path', async () => {
    const guard = createAdminGuard({ auth: fakeAuth(false), publicPaths: ['/api/admin/posts'] });
    expect(await visit(guard, '/api/admin/posts')).toBe('401');
  });
});

describe('createAdminGuard — locals', () => {
  it('populates locals even on public paths', async () => {
    const url = new URL('http://example.test/admin/forgot-password');
    const locals: Record<string, unknown> = {};
    await createAdminGuard({ auth: fakeAuth(false) })(
      {
        request: new Request(url),
        url,
        locals,
        redirect: (p: string) => new Response(null, { status: 302, headers: { location: p } }),
      },
      async () => new Response('next'),
    );
    expect(locals).toEqual({ user: null, session: null });
  });
});
