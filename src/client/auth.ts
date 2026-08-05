/**
 * Browser-side auth calls.
 *
 * Better Auth's endpoints take plain JSON, so this is `fetch` and nothing else —
 * no auth client library, no framework. That's what makes it reusable: an Astro
 * page, a React component, and a plain <script> can all call these.
 *
 * The important thing living here is not the fetch, it's the ERROR MESSAGE
 * POLICY. Which failures may be described precisely and which must stay vague is
 * a security decision, and it should be made once here rather than re-decided in
 * every consuming site's markup.
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

        if (response.status === 429) {
          return {
            ok: false,
            rateLimited: true,
            message: rateLimitMessage(response.headers.get('X-Retry-After')),
          };
        }
        return { ok: false, rateLimited: false, message: CREDENTIALS_MESSAGE };
      } catch {
        return { ok: false, rateLimited: false, message: NETWORK_MESSAGE };
      }
    },

    /**
     * Requests a reset link.
     *
     * Reports success even when the address has no account — and note it does so
     * by ignoring the response body entirely, not by inspecting it. Telling the
     * caller "no account found" would confirm which emails are registered to
     * anyone who asks, which for a single-admin site is a meaningful disclosure.
     *
     * Rate limiting is the one thing worth surfacing, since the user genuinely
     * needs to know to wait.
     */
    async requestPasswordReset(email: string, redirectTo: string): Promise<AuthResult> {
      try {
        const response = await post('/request-password-reset', {
          email: email.trim(),
          redirectTo,
        });

        if (response.status === 429) {
          return {
            ok: false,
            rateLimited: true,
            message: rateLimitMessage(response.headers.get('X-Retry-After'), 'requests'),
          };
        }
        return { ok: true };
      } catch {
        return { ok: false, rateLimited: false, message: NETWORK_MESSAGE };
      }
    },

    /**
     * Completes a reset using the emailed token.
     *
     * Here it IS safe to be specific about an invalid or expired token: the value
     * came from an email we sent, so saying it's expired reveals nothing about
     * which accounts exist, and a vague error would leave the user with no idea
     * they simply need a fresh link.
     */
    async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
      try {
        const response = await post('/reset-password', { token, newPassword });
        if (response.ok) return { ok: true };

        if (response.status === 429) {
          return {
            ok: false,
            rateLimited: true,
            message: rateLimitMessage(response.headers.get('X-Retry-After'), 'attempts'),
          };
        }
        return {
          ok: false,
          rateLimited: false,
          message:
            'That reset link is no longer valid. Links expire after an hour and can only be used once — request a new one.',
        };
      } catch {
        return { ok: false, rateLimited: false, message: NETWORK_MESSAGE };
      }
    },

    /**
     * Changes the password for the signed-in user.
     *
     * "That current password is not correct" is safe to say here precisely
     * because the caller already holds a valid session — they've proven who they
     * are, so the message discloses nothing they couldn't already determine.
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

        if (response.status === 429) {
          return {
            ok: false,
            rateLimited: true,
            message: rateLimitMessage(response.headers.get('X-Retry-After'), 'attempts'),
          };
        }
        return {
          ok: false,
          rateLimited: false,
          message: 'That current password is not correct.',
        };
      } catch {
        return { ok: false, rateLimited: false, message: NETWORK_MESSAGE };
      }
    },

    async signOut(): Promise<AuthResult> {
      try {
        const response = await post('/sign-out', {});
        return response.ok
          ? { ok: true }
          : { ok: false, rateLimited: false, message: 'Could not sign out.' };
      } catch {
        return { ok: false, rateLimited: false, message: NETWORK_MESSAGE };
      }
    },
  };
}

export type AuthClient = ReturnType<typeof createAuthClient>;
