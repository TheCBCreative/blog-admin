import { describe, it, expect } from 'vitest';
import {
  parseLocalDateTime,
  toLocalDateTimeValue,
  zonedTimeToUtc,
  isFuture,
} from '../src/core/datetime.js';

const LA = 'America/Los_Angeles';

describe('parseLocalDateTime', () => {
  it('interprets a wall-clock string as local time in the zone, not UTC', () => {
    // 9:30am PDT (UTC-7) === 16:30 UTC
    const utc = parseLocalDateTime('2026-08-19T09:30', LA);
    expect(utc.toISOString()).toBe('2026-08-19T16:30:00.000Z');
  });

  it('applies standard time offset in winter', () => {
    // 9:30am PST (UTC-8) === 17:30 UTC
    const utc = parseLocalDateTime('2026-01-15T09:30', LA);
    expect(utc.toISOString()).toBe('2026-01-15T17:30:00.000Z');
  });

  it('accepts a space separator as well as T', () => {
    expect(parseLocalDateTime('2026-08-19 09:30', LA).toISOString()).toBe('2026-08-19T16:30:00.000Z');
  });

  it('throws on unparseable input rather than producing Invalid Date', () => {
    expect(() => parseLocalDateTime('not a date', LA)).toThrow();
    expect(() => parseLocalDateTime('', LA)).toThrow();
  });

  it('handles midnight without rolling to the previous day', () => {
    const utc = parseLocalDateTime('2026-08-19T00:00', LA);
    expect(utc.toISOString()).toBe('2026-08-19T07:00:00.000Z');
  });
});

// These are the cases that break naive implementations. Spring forward skips
// 2:00-3:00am local; fall back repeats 1:00-2:00am local.
describe('DST boundaries', () => {
  it('handles times before and after spring forward (2026-03-08)', () => {
    // 1:30am is PST (UTC-8)
    expect(parseLocalDateTime('2026-03-08T01:30', LA).toISOString()).toBe('2026-03-08T09:30:00.000Z');
    // 3:30am is PDT (UTC-7)
    expect(parseLocalDateTime('2026-03-08T03:30', LA).toISOString()).toBe('2026-03-08T10:30:00.000Z');
  });

  it('does not throw on the nonexistent hour during spring forward', () => {
    // 2:30am never occurs. Any consistent resolution is acceptable; silently
    // producing an Invalid Date is not.
    const result = parseLocalDateTime('2026-03-08T02:30', LA);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it('handles times around fall back (2026-11-01)', () => {
    // Before the transition, 00:30 is unambiguously PDT (UTC-7).
    expect(parseLocalDateTime('2026-11-01T00:30', LA).toISOString()).toBe('2026-11-01T07:30:00.000Z');
    // After, 3:30am is unambiguously PST (UTC-8).
    expect(parseLocalDateTime('2026-11-01T03:30', LA).toISOString()).toBe('2026-11-01T11:30:00.000Z');
  });

  it('resolves the ambiguous repeated hour to a real instant', () => {
    // 1:30am occurs twice. Either is defensible; NaN is not.
    const result = parseLocalDateTime('2026-11-01T01:30', LA);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });
});

describe('round-tripping', () => {
  it('parse then format returns the original wall-clock value', () => {
    for (const value of [
      '2026-08-19T09:30',
      '2026-01-15T17:45',
      '2026-03-08T03:30',
      '2026-11-01T03:30',
      '2026-12-31T23:59',
    ]) {
      expect(toLocalDateTimeValue(parseLocalDateTime(value, LA), LA)).toBe(value);
    }
  });

  it('survives a year boundary', () => {
    const utc = parseLocalDateTime('2026-12-31T23:30', LA);
    expect(utc.toISOString()).toBe('2027-01-01T07:30:00.000Z');
    expect(toLocalDateTimeValue(utc, LA)).toBe('2026-12-31T23:30');
  });
});

describe('zonedTimeToUtc', () => {
  it('matches parseLocalDateTime for the same components', () => {
    const a = zonedTimeToUtc({ year: 2026, month: 8, day: 19, hour: 9, minute: 30 }, LA);
    const b = parseLocalDateTime('2026-08-19T09:30', LA);
    expect(a.getTime()).toBe(b.getTime());
  });

  it('respects a different zone', () => {
    const ny = zonedTimeToUtc({ year: 2026, month: 8, day: 19, hour: 9, minute: 30 }, 'America/New_York');
    // 9:30 EDT (UTC-4) === 13:30 UTC
    expect(ny.toISOString()).toBe('2026-08-19T13:30:00.000Z');
  });
});

describe('isFuture', () => {
  const now = new Date('2026-08-19T12:00:00Z');

  it('is false for the exact current instant', () => {
    expect(isFuture(new Date('2026-08-19T12:00:00Z'), now)).toBe(false);
  });

  it('distinguishes past from future', () => {
    expect(isFuture(new Date('2026-08-19T12:00:01Z'), now)).toBe(true);
    expect(isFuture(new Date('2026-08-19T11:59:59Z'), now)).toBe(false);
  });
});
