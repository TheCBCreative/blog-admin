import { describe, expect, it, vi } from 'vitest';
import { parseRetryAfter, retryAfterSeconds } from '../src/client/retry.js';
import { safeNextPath } from '../src/client/redirect.js';
import { createAuthClient } from '../src/client/auth.js';

describe('retryAfterSeconds', () => {
  it('reads a plain duration in seconds', () => {
    expect(retryAfterSeconds('45')).toBe(45);
  });

  it('derives remaining time from an epoch-millisecond timestamp', () => {
    // The real-world bug: Better Auth returned a value like this and the UI
    // rendered it verbatim as a seconds count.
    const raw = String(Date.now() + 30_000);
    expect(retryAfterSeconds(raw)).toBeCloseTo(30, 0);
  });

  it('derives remaining time from an epoch-second timestamp', () => {
    const raw = String(Math.round(Date.now() / 1000) + 90);
    expect(retryAfterSeconds(raw)).toBeCloseTo(90, 0);
  });

  it('rejects values that would produce nonsense', () => {
    expect(retryAfterSeconds('178594298785556')).toBeNull(); // the original bug
    expect(retryAfterSeconds('0')).toBeNull();
    expect(retryAfterSeconds('-5')).toBeNull();
    expect(retryAfterSeconds('not a number')).toBeNull();
    expect(retryAfterSeconds(null)).toBeNull();
    expect(retryAfterSeconds('')).toBeNull();
  });

  it('rejects a cooldown longer than an hour as implausible', () => {
    expect(retryAfterSeconds('7200')).toBeNull();
  });

  it('rejects a past timestamp', () => {
    expect(retryAfterSeconds(String(Date.now() - 60_000))).toBeNull();
  });
});

describe('parseRetryAfter', () => {
  it('pluralises correctly', () => {
    expect(parseRetryAfter('1')).toBe('1 second');
    expect(parseRetryAfter('2')).toBe('2 seconds');
  });

  it('rounds up to whole minutes past a minute', () => {
    expect(parseRetryAfter('61')).toBe('2 minutes');
    expect(parseRetryAfter('60')).toBe('1 minute');
  });

  it('returns null rather than a misleading string', () => {
    expect(parseRetryAfter('178594298785556')).toBeNull();
  });
});

describe('safeNextPath', () => {
  it('allows root-relative paths', () => {
    expect(safeNextPath('/admin/posts/')).toBe('/admin/posts/');
  });

  it('falls back when absent', () => {
    expect(safeNextPath(null)).toBe('/admin/');
    expect(safeNextPath('')).toBe('/admin/');
  });

  it('blocks absolute off-site URLs', () => {
    expect(safeNextPath('https://evil.example')).toBe('/admin/');
  });

  it('blocks protocol-relative URLs', () => {
    // The case a naive startsWith('/') check lets through.
    expect(safeNextPath('//evil.example')).toBe('/admin/');
  });

  it('blocks backslash variants', () => {
    expect(safeNextPath('/\\evil.example')).toBe('/admin/');
    expect(safeNextPath('/foo\\bar')).toBe('/admin/');
  });

  it('honours a custom fallback', () => {
    expect(safeNextPath('https://evil.example', '/')).toBe('/');
  });
});

/** Minimal Response stand-in — avoids depending on a DOM environment. */
function res(status: number, headers: Record<string, string> = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name: string) => headers[name] ?? null },
  } as unknown as Response;
}

describe('createAuthClient', () => {
  it('posts JSON to the configured base path', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200));
    const client = createAuthClient({ basePath: '/custom/auth/', fetchImpl });

    await client.signIn(' user@example.com ', 'pw');

    const [url, init] = fetchImpl.mock.calls[0];
    // Trailing slash stripped so the path isn't doubled.
    expect(url).toBe('/custom/auth/sign-in/email');
    expect(JSON.parse(init.body)).toEqual({ email: 'user@example.com', password: 'pw' });
  });

  it('gives the same generic message for bad credentials regardless of cause', async () => {
    const client = createAuthClient({ fetchImpl: vi.fn().mockResolvedValue(res(401)) });
    const result = await client.signIn('a@b.com', 'pw');
    expect(result).toEqual({
      ok: false,
      rateLimited: false,
      message: 'Those credentials did not work.',
    });
  });

  it('flags rate limiting with a readable wait', async () => {
    const client = createAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(res(429, { 'X-Retry-After': '10' })),
    });
    const result = await client.signIn('a@b.com', 'pw');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.rateLimited).toBe(true);
      expect(result.message).toBe('Too many attempts. Try again in 10 seconds.');
    }
  });

  it('falls back to vague wording when the retry header is nonsense', async () => {
    const client = createAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(res(429, { 'X-Retry-After': '178594298785556' })),
    });
    const result = await client.signIn('a@b.com', 'pw');
    if (!result.ok) {
      expect(result.message).toBe('Too many attempts. Wait a moment and try again.');
    }
  });

  it('reports success on reset request even when the server rejects', async () => {
    // The account-enumeration guard: a 400 for "no such user" must look
    // identical to a 200 to the caller.
    const client = createAuthClient({ fetchImpl: vi.fn().mockResolvedValue(res(400)) });
    const result = await client.requestPasswordReset('nobody@example.com', '/admin/reset-password');
    expect(result).toEqual({ ok: true });
  });

  it('still surfaces rate limiting on reset request', async () => {
    const client = createAuthClient({
      fetchImpl: vi.fn().mockResolvedValue(res(429, { 'X-Retry-After': '60' })),
    });
    const result = await client.requestPasswordReset('a@b.com', '/admin/reset-password');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Too many requests. Try again in 1 minute.');
  });

  it('is specific about an expired reset token', async () => {
    const client = createAuthClient({ fetchImpl: vi.fn().mockResolvedValue(res(400)) });
    const result = await client.resetPassword('stale-token', 'a-long-enough-password');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/no longer valid/);
  });

  it('revokes other sessions by default on change-password', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200));
    const client = createAuthClient({ fetchImpl });
    await client.changePassword('old', 'new-password-long');
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).revokeOtherSessions).toBe(true);
  });

  it('turns a network failure into a message rather than throwing', async () => {
    const client = createAuthClient({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) });
    const result = await client.signIn('a@b.com', 'pw');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Could not reach the server/);
  });
});
