/**
 * Transactional email for auth flows, via Resend.
 *
 * Sends from a CB Creative address rather than each client's own domain. That's
 * deliberate: one verified sending domain covers every client site, so onboarding
 * never requires DNS changes from the client, and deliverability rides on a
 * domain with existing sending history instead of a cold one.
 *
 * If a client ever needs mail from their own domain, verify it in Resend and pass
 * a different `from` — nothing else changes.
 */

// Type-only, so it's erased at runtime and doesn't pull the module in. The
// implementation is imported dynamically at send time — see sendPasswordReset.
import type { Resend as ResendClient } from 'resend';

export interface EmailConfig {
  apiKey: string;
  /** Verified sender. Defaults to the CB Creative no-reply address. */
  from?: string;
  /** Business name shown in the email body. */
  siteName: string;
}

export const DEFAULT_FROM = 'The CB Creative <no-reply@thecbcreative.com>';

export interface ResetEmailArgs {
  to: string;
  /** The tokenized reset URL from Better Auth. */
  url: string;
}

export function createEmailSender(config: EmailConfig) {
  const from = config.from ?? DEFAULT_FROM;

  /**
   * Resolved on first send rather than at module load.
   *
   * Two reasons. It keeps the package importable by a consumer that never
   * configures email — otherwise a top-level import makes `resend` mandatory for
   * everyone and the "inert without a key" default becomes a lie. And it keeps
   * the module off the hot path: nothing loads until a reset is actually
   * requested, which on a serverless deploy is almost never.
   */
  let clientPromise: Promise<ResendClient> | null = null;

  function getClient(): Promise<ResendClient> {
    clientPromise ??= import('resend').then(({ Resend }) => new Resend(config.apiKey));
    return clientPromise;
  }

  return {
    async sendPasswordReset({ to, url }: ResetEmailArgs): Promise<void> {
      const subject = `Reset your ${config.siteName} password`;

      // Plain text alongside HTML — some clients strip HTML, and a text part
      // meaningfully improves spam scoring on transactional mail.
      const text = [
        `Someone asked to reset the password for your ${config.siteName} website login.`,
        '',
        'Open this link to choose a new password:',
        url,
        '',
        'The link expires in one hour and can only be used once.',
        '',
        "If you didn't request this, you can ignore this email — your password stays as it is.",
      ].join('\n');

      const html = `
        <div style="font-family: system-ui, -apple-system, sans-serif; font-size: 15px; line-height: 1.6; color: #251418; max-width: 480px;">
          <p>Someone asked to reset the password for your <strong>${escapeHtml(config.siteName)}</strong> website login.</p>
          <p><a href="${escapeAttr(url)}" style="display: inline-block; padding: 12px 20px; background: #94635d; color: #ffffff; text-decoration: none; border-radius: 4px;">Choose a new password</a></p>
          <p style="font-size: 13px; color: #5a4b45;">The link expires in one hour and can only be used once.</p>
          <p style="font-size: 13px; color: #5a4b45;">If you didn't request this, you can ignore this email — your password stays as it is.</p>
        </div>
      `.trim();

      const resend = await getClient();
      const { error } = await resend.emails.send({ from, to, subject, text, html });

      // Surface failures to the caller. Better Auth calls this without awaiting
      // (to avoid a timing oracle), so this mostly ends up in server logs — but
      // swallowing it silently would make "no email arrived" undebuggable.
      if (error) {
        throw new Error(`Resend failed to send the reset email: ${error.message}`);
      }
    },
  };
}

/** Minimal escaping — these values are ours, but interpolation deserves care. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
