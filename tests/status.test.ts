import { describe, it, expect } from 'vitest';
import { isLive, displayStatus, canCancelSchedule, resolvePublishedAt } from '../src/core/status.js';

const now = new Date('2026-08-19T12:00:00Z');
const past = new Date('2026-08-19T11:00:00Z');
const future = new Date('2026-08-19T13:00:00Z');

describe('isLive', () => {
  it('published is always live', () => {
    expect(isLive({ status: 'published' }, now)).toBe(true);
    expect(isLive({ status: 'published', publishAt: future }, now)).toBe(true);
  });

  it('draft is never live', () => {
    expect(isLive({ status: 'draft' }, now)).toBe(false);
    expect(isLive({ status: 'draft', publishAt: past }, now)).toBe(false);
  });

  it('archived is never live, even if it was published before', () => {
    expect(isLive({ status: 'archived', publishAt: past }, now)).toBe(false);
  });

  it('scheduled becomes live once its time has passed', () => {
    expect(isLive({ status: 'scheduled', publishAt: future }, now)).toBe(false);
    expect(isLive({ status: 'scheduled', publishAt: past }, now)).toBe(true);
  });

  it('scheduled is live at exactly its publish instant', () => {
    expect(isLive({ status: 'scheduled', publishAt: new Date(now) }, now)).toBe(true);
  });

  it('scheduled without a time is not live — fails closed', () => {
    expect(isLive({ status: 'scheduled' }, now)).toBe(false);
  });
});

describe('displayStatus', () => {
  it('reports a fired schedule as live, not scheduled', () => {
    // Showing "Scheduled" for a post visitors can already read would mislead.
    expect(displayStatus({ status: 'scheduled', publishAt: past }, now)).toBe('live');
  });

  it('reports a pending schedule as scheduled', () => {
    expect(displayStatus({ status: 'scheduled', publishAt: future }, now)).toBe('scheduled');
  });

  it('passes through the unambiguous states', () => {
    expect(displayStatus({ status: 'draft' }, now)).toBe('draft');
    expect(displayStatus({ status: 'published' }, now)).toBe('live');
    expect(displayStatus({ status: 'archived' }, now)).toBe('archived');
  });
});

describe('canCancelSchedule', () => {
  it('allows cancelling before the time arrives', () => {
    expect(canCancelSchedule({ status: 'scheduled', publishAt: future }, now)).toBe(true);
  });

  it('refuses once the post is already live', () => {
    expect(canCancelSchedule({ status: 'scheduled', publishAt: past }, now)).toBe(false);
  });

  it('is irrelevant for other statuses', () => {
    expect(canCancelSchedule({ status: 'draft' }, now)).toBe(false);
    expect(canCancelSchedule({ status: 'published' }, now)).toBe(false);
  });
});

describe('resolvePublishedAt', () => {
  it('sets the timestamp on first publish', () => {
    expect(resolvePublishedAt(undefined, 'published', now)).toEqual(now);
  });

  it('never overwrites an existing publish date', () => {
    // Editing a live post must not reset datePublished in the schema output.
    expect(resolvePublishedAt(past, 'published', now)).toEqual(past);
    expect(resolvePublishedAt(past, 'draft', now)).toEqual(past);
    expect(resolvePublishedAt(past, 'archived', now)).toEqual(past);
  });

  it('stays undefined for a post that has never gone live', () => {
    expect(resolvePublishedAt(undefined, 'draft', now)).toBeUndefined();
    expect(resolvePublishedAt(undefined, 'scheduled', now)).toBeUndefined();
  });
});
