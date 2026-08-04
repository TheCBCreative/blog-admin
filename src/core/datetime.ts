/**
 * Timezone handling for scheduling.
 *
 * ── The bug this file exists to prevent ─────────────────────────────────────
 * The client types "8/19 at 9:30am" meaning 9:30 in *their* timezone. Storing
 * that string, or `new Date('2026-08-19T09:30')` on a server running UTC, gives
 * you a moment that's hours off — and the error changes across DST boundaries,
 * so it looks intermittent.
 *
 * Rule: parse in the configured zone, store UTC, format back to the zone.
 * Everything crossing the storage boundary is UTC.
 */

/** Default zone. Overridable per project via admin config. */
export const DEFAULT_TIME_ZONE = 'America/Los_Angeles';

/**
 * Offset between a zone and UTC at a given instant, in minutes.
 *
 * Derived via Intl rather than a hardcoded table so DST transitions are correct
 * without shipping timezone data — and so it stays correct if the rules change.
 */
function zoneOffsetMinutes(instant: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const parts = dtf.formatToParts(instant);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? '0');

  // Intl renders hour 24 for midnight under hour12:false in some engines.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  return (asUtc - instant.getTime()) / 60_000;
}

/**
 * Interprets wall-clock components as local time in `timeZone` and returns the
 * corresponding UTC instant.
 *
 * Two passes: guess using the offset at the naive instant, then re-check the
 * offset at the guessed instant. That second pass is what makes DST boundaries
 * correct — near a transition the two offsets differ, and the first guess alone
 * would land an hour off.
 */
export function zonedTimeToUtc(
  parts: { year: number; month: number; day: number; hour: number; minute: number },
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const naive = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0);

  const firstOffset = zoneOffsetMinutes(new Date(naive), timeZone);
  const firstGuess = new Date(naive - firstOffset * 60_000);

  const secondOffset = zoneOffsetMinutes(firstGuess, timeZone);
  if (secondOffset === firstOffset) return firstGuess;

  return new Date(naive - secondOffset * 60_000);
}

/**
 * Parses a `datetime-local` input value ("2026-08-19T09:30") as local time in
 * the given zone. Deliberately does not accept a plain `Date` — a Date is
 * already an absolute instant and needs no interpretation.
 */
export function parseLocalDateTime(value: string, timeZone: string = DEFAULT_TIME_ZONE): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) throw new Error(`Unrecognized datetime-local value: "${value}"`);

  const [, y, mo, d, h, mi] = match;
  return zonedTimeToUtc(
    { year: Number(y), month: Number(mo), day: Number(d), hour: Number(h), minute: Number(mi) },
    timeZone,
  );
}

/** Formats a UTC instant back into a `datetime-local` value for form prefill. */
export function toLocalDateTimeValue(instant: Date, timeZone: string = DEFAULT_TIME_ZONE): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '00';
  const hour = String(Number(get('hour')) % 24).padStart(2, '0');

  return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
}

/** Human-readable, zone-aware. For the admin list and post pages. */
export function formatInZone(
  instant: Date,
  timeZone: string = DEFAULT_TIME_ZONE,
  options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  },
): string {
  return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(instant);
}

export function isFuture(instant: Date, now: Date = new Date()): boolean {
  return instant.getTime() > now.getTime();
}
