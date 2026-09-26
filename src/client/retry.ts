/** Bounds on a plausible cooldown. Outside this, assume we misread the header. */
const MIN_SECONDS = 1;
const MAX_SECONDS = 3600;

/**
 * Turns Better Auth's `X-Retry-After` into human-readable text, or null when the
 * value can't be trusted.
 *
 * The header isn't reliably the documented seconds count (it can arrive as a
 * timestamp), so its form is detected and the result range-checked. A nonsense
 * number is worse than a generic message, so out-of-range returns null.
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
