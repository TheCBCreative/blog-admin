/**
 * Rate-limit retry header parsing.
 *
 * Framework-agnostic on purpose — this is plain TS with no DOM or framework
 * dependency, so a Next/SvelteKit/plain-HTML consumer gets the same behaviour as
 * an Astro one.
 */

/** Bounds on a plausible cooldown. Outside this, assume we misread the header. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;

/**
 * Turns Better Auth's `X-Retry-After` into human-readable text, or null when the
 * value can't be trusted.
 *
 * The header's units are not reliable. It has come back as a large timestamp-like
 * value rather than the documented seconds count, which is how a user once saw
 * "try again in 178594298785556 seconds". So rather than assuming, work out which
 * form it's in and sanity-check the result — a nonsense number is worse than a
 * generic message, so an out-of-range value returns null and the caller falls
 * back to vaguer wording.
 */
export function parseRetryAfter(raw: string | null | undefined): string | null {
  const seconds = retryAfterSeconds(raw);
  if (seconds === null) return null;

  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

/**
 * The numeric half of {@link parseRetryAfter}, exposed separately so a caller can
 * drive a countdown or disable a button rather than only render a string.
 */
export function retryAfterSeconds(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;

  let seconds: number;
  if (value > 1e11) {
    // Epoch milliseconds (or finer) — derive the time remaining.
    seconds = Math.round((value - Date.now()) / 1000);
  } else if (value > 1e9) {
    // Epoch seconds.
    seconds = Math.round(value - Date.now() / 1000);
  } else {
    // A plain duration, as documented.
    seconds = Math.round(value);
  }

  if (seconds < MIN_SECONDS || seconds > MAX_SECONDS) return null;
  return seconds;
}

/** Standard message for a 429, using the header when it's trustworthy. */
export function rateLimitMessage(raw: string | null | undefined, action = 'attempts'): string {
  const wait = parseRetryAfter(raw);
  return wait
    ? `Too many ${action}. Try again in ${wait}.`
    : `Too many ${action}. Wait a moment and try again.`;
}
