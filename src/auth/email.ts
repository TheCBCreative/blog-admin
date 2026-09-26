/**
 * Transactional email for auth flows, via Resend.
 *
 * Sends from one verified CB Creative domain for every client site, so
 * onboarding needs no client DNS changes. To send from a client's own domain,
 * verify it in Resend and pass `from`.
 */

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

  // Imported on first send rather than at module load, so `resend` stays off
  // the load path until a reset is actually requested.
  let clientPromise: Promise<ResendClient> | null = null;

  function getClient(): Promise<ResendClient> {
    clientPromise ??= import('resend').then(({ Resend }) => new Resend(config.apiKey));
    return clientPromise;
  }

  return {
    async sendPasswordReset({ to, url }: ResetEmailArgs): Promise<void> {
      const subject = `Reset your ${config.siteName} password`;

      // Plain-text part alongside HTML: some clients strip HTML, and it improves
      // spam scoring.
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

      // Throw rather than swallow, so the caller's catch logs it and "no email
      // arrived" stays debuggable.
      if (error) {
        throw new Error(`Resend failed to send the reset email: ${error.message}`);
      }
    },
  };
}

/** Minimal escaping for values interpolated into the email HTML. */
function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/"/g, '&quot;');
}
