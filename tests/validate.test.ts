import { describe, it, expect } from 'vitest';
import { validatePost, coercePublishAt, LIMITS } from '../src/core/validate.js';
import type { PostInput } from '../src/types.js';

const now = new Date('2026-08-19T12:00:00Z');
const base: PostInput = { headline: 'A perfectly fine headline' };

const fieldsWithErrors = (input: PostInput, opts = {}): string[] =>
  validatePost(input, { now, ...opts }).map((e) => e.field);

describe('headline', () => {
  it('accepts a valid post', () => {
    expect(validatePost(base, { now })).toEqual([]);
  });

  it('requires a headline', () => {
    expect(fieldsWithErrors({ headline: '' })).toContain('headline');
    expect(fieldsWithErrors({ headline: '   ' })).toContain('headline');
  });

  it('caps headline length', () => {
    expect(fieldsWithErrors({ headline: 'a'.repeat(LIMITS.headline + 1) })).toContain('headline');
  });
});

describe('alt text enforcement', () => {
  it('requires alt text when an image is present', () => {
    const errors = fieldsWithErrors({ ...base, featuredImage: { url: '/img.jpg' } });
    expect(errors).toContain('featuredImage.alt');
  });

  it('rejects whitespace-only alt text', () => {
    const errors = fieldsWithErrors({ ...base, featuredImage: { url: '/img.jpg', alt: '   ' } });
    expect(errors).toContain('featuredImage.alt');
  });

  it('passes with real alt text', () => {
    const errors = fieldsWithErrors({
      ...base,
      featuredImage: { url: '/img.jpg', alt: 'Treatment room interior' },
    });
    expect(errors).not.toContain('featuredImage.alt');
  });

  it('does not require alt text when there is no image', () => {
    expect(fieldsWithErrors(base)).not.toContain('featuredImage.alt');
  });
});

describe('scheduling', () => {
  it('requires a time when status is scheduled', () => {
    expect(fieldsWithErrors({ ...base, status: 'scheduled' })).toContain('publishAt');
  });

  it('rejects a past scheduled time', () => {
    expect(
      fieldsWithErrors({ ...base, status: 'scheduled', publishAt: new Date('2026-08-19T11:00:00Z') }),
    ).toContain('publishAt');
  });

  it('rejects a scheduled time equal to now', () => {
    expect(fieldsWithErrors({ ...base, status: 'scheduled', publishAt: new Date(now) })).toContain(
      'publishAt',
    );
  });

  it('accepts a future scheduled time', () => {
    expect(
      fieldsWithErrors({ ...base, status: 'scheduled', publishAt: new Date('2026-08-19T13:00:00Z') }),
    ).not.toContain('publishAt');
  });

  it('reports unparseable datetimes rather than accepting them', () => {
    expect(fieldsWithErrors({ ...base, status: 'scheduled', publishAt: 'nonsense' })).toContain(
      'publishAt',
    );
  });

  it('does not require a time for non-scheduled statuses', () => {
    expect(fieldsWithErrors({ ...base, status: 'draft' })).not.toContain('publishAt');
    expect(fieldsWithErrors({ ...base, status: 'published' })).not.toContain('publishAt');
  });
});

describe('slug and tags', () => {
  it('rejects a malformed slug', () => {
    expect(fieldsWithErrors({ ...base, slug: 'Not A Slug' })).toContain('slug');
  });

  it('accepts a well-formed slug', () => {
    expect(fieldsWithErrors({ ...base, slug: 'a-good-slug' })).not.toContain('slug');
  });

  it('rejects tags with spaces or capitals', () => {
    expect(fieldsWithErrors({ ...base, tags: ['Skin Care'] })).toContain('tags');
  });

  it('accepts hyphenated lowercase tags', () => {
    expect(fieldsWithErrors({ ...base, tags: ['skin-care', 'injectables'] })).not.toContain('tags');
  });
});

describe('layout', () => {
  it('rejects a layout the project did not declare', () => {
    const errors = fieldsWithErrors({ ...base, layout: 'nope' }, { allowedLayouts: ['standard'] });
    expect(errors).toContain('layout');
  });

  it('accepts a declared layout', () => {
    const errors = fieldsWithErrors({ ...base, layout: 'standard' }, { allowedLayouts: ['standard'] });
    expect(errors).not.toContain('layout');
  });

  it('skips the check when no layouts are configured', () => {
    expect(fieldsWithErrors({ ...base, layout: 'anything' })).not.toContain('layout');
  });
});

describe('SEO field limits', () => {
  it('flags an over-long SEO title', () => {
    expect(fieldsWithErrors({ ...base, seoTitle: 'a'.repeat(LIMITS.seoTitle + 1) })).toContain('seoTitle');
  });

  it('flags an over-long meta description', () => {
    expect(
      fieldsWithErrors({ ...base, seoDescription: 'a'.repeat(LIMITS.seoDescription + 1) }),
    ).toContain('seoDescription');
  });
});

describe('multiple errors', () => {
  it('reports every problem at once rather than stopping at the first', () => {
    const errors = validatePost(
      { headline: '', slug: 'Bad Slug', status: 'scheduled', featuredImage: { url: '/i.jpg' } },
      { now },
    );
    const fields = errors.map((e) => e.field);
    expect(fields).toContain('headline');
    expect(fields).toContain('slug');
    expect(fields).toContain('publishAt');
    expect(fields).toContain('featuredImage.alt');
  });
});

describe('coercePublishAt', () => {
  it('interprets a bare local string in the configured zone', () => {
    expect(coercePublishAt('2026-08-19T09:30', 'America/Los_Angeles')?.toISOString()).toBe(
      '2026-08-19T16:30:00.000Z',
    );
  });

  it('does not reinterpret a string carrying an explicit offset', () => {
    expect(coercePublishAt('2026-08-19T09:30:00Z')?.toISOString()).toBe('2026-08-19T09:30:00.000Z');
    expect(coercePublishAt('2026-08-19T09:30:00+02:00')?.toISOString()).toBe(
      '2026-08-19T07:30:00.000Z',
    );
  });

  it('passes a Date through unchanged', () => {
    const d = new Date('2026-08-19T09:30:00Z');
    expect(coercePublishAt(d)?.getTime()).toBe(d.getTime());
  });

  it('returns null for garbage rather than an Invalid Date', () => {
    expect(coercePublishAt('nonsense')).toBeNull();
    expect(coercePublishAt(new Date('nonsense'))).toBeNull();
  });
});
