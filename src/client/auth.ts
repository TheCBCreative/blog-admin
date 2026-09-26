/**
 * Browser-side auth calls: plain `fetch` against Better Auth's JSON endpoints,
 * usable from any framework.
 *
 * The error-message policy here is a security decision — which failures may be
 * described precisely and which must stay vague — so it's made once here rather
 * than in each consuming site.
 */

import { rateLimitMessage } from './retry.js';

export interface AuthClientOptions {
  /** Mount point of the Better Auth handler. */
  basePath?: string;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
}

export type AuthResult =
  | { ok: true }
  | { ok: false; message: string; rateLimited: boolean };

const DEFAULT_BASE_PATH = '/api/auth';

/** Shown when the network fails rather than the server rejecting us. */
const NETWORK_MESSAGE = 'Could not reach the server. Check your connection.';

/**
 * Deliberately does not distinguish "no such account" from "wrong password".
 * Either would let someone enumerate which emails have accounts.
 */
const CREDENTIALS_MESSAGE = 'Those credentials did not work.';

function failure(message: string): AuthResult {
  return { ok: false, rateLimited: false, message };
}

function rateLimited(response: Response, action?: string): AuthResult {
  return {
    ok: false,
    rateLimited: true,
    message: rateLimitMessage(response.headers.get('X-Retry-After'), action),
  };
}

export function createAuthClient(options: AuthClientOptions = {}) {
  const basePath = (options.basePath ?? DEFAULT_BASE_PATH).replace(/\/$/, '');
  const doFetch = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function post(path: string, body: unknown): Promise<Response> {
    return doFetch(`${basePath}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return {
    async signIn(email: string, password: string): Promise<AuthResult> {
      try {
        const response = await post('/sign-in/email', { email: email.trim(), password });
        if (response.ok) return { ok: true };

        if (response.status === 429) return rateLimited(response);
        return failure(CREDENTIALS_MESSAGE);
      } catch {
        return failure(NETWORK_MESSAGE);
      }
    },

    /**
     * Requests a reset link. `redirectTo` is where the emailed link lands after
     * Better Auth validates the token (it must be sent with the request);
     * defaults to `/admin/reset-password` on the current origin.
     *
     * Reports success whether or not the account exists, without inspecting the
     * response body, so it never reveals which emails are registered. Only rate
     * limiting is surfaced.
     */
    async requestPasswordReset(email: string, redirectTo?: string): Promise<AuthResult> {
      try {
        const response = await post('/request-password-reset', {
          email: email.trim(),
          redirectTo: redirectTo ?? `${window.location.origin}/admin/reset-password`,
        });

        if (response.status === 429) return rateLimited(response, 'requests');
        return { ok: true };
      } catch {
        return failure(NETWORK_MESSAGE);
      }
    },

    /**
     * Completes a reset using the emailed token. Being specific about an invalid
     * or expired token is safe: the token came from our email, so it reveals
     * nothing about which accounts exist.
     */
    async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
      try {
        const response = await post('/reset-password', { token, newPassword });
        if (response.ok) return { ok: true };

        if (response.status === 429) return rateLimited(response, 'attempts');
        return failure(
          'That reset link is no longer valid. Links expire after an hour and can only be used once — request a new one.',
        );
      } catch {
        return failure(NETWORK_MESSAGE);
      }
    },

    /**
     * Changes the signed-in user's password. A specific wrong-password message is
     * safe here because the caller already holds a valid session.
     */
    async changePassword(
      currentPassword: string,
      newPassword: string,
      revokeOtherSessions = true,
    ): Promise<AuthResult> {
      try {
        const response = await post('/change-password', {
          currentPassword,
          newPassword,
          revokeOtherSessions,
        });
        if (response.ok) return { ok: true };

        if (response.status === 429) return rateLimited(response, 'attempts');
        return failure('That current password is not correct.');
      } catch {
        return failure(NETWORK_MESSAGE);
      }
    },

    async signOut(): Promise<AuthResult> {
      try {
        const response = await post('/sign-out', {});
        return response.ok ? { ok: true } : failure('Could not sign out.');
      } catch {
        return failure(NETWORK_MESSAGE);
      }
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
