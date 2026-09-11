import { describe, expect, it } from 'vitest';
import {
  parseTags,
  serializePostForm,
  statusForMode,
  suggestPostFields,
  suggestSlug,
  isPostFormMode,
  type PostFormValues,
} from '../src/client/post-form.js';
import { deriveExcerpt, deriveSeoDescription, deriveSeoTitle } from '../src/core/derive.js';
import { slugify } from '../src/core/slug.js';

describe('statusForMode', () => {
  it('maps each mode', () => {
    expect(statusForMode('draft')).toBe('draft');
    expect(statusForMode('publish')).toBe('published');
    expect(statusForMode('schedule')).toBe('scheduled');
  });
});

describe('isPostFormMode', () => {
  it('accepts known modes and rejects anything else', () => {
    expect(isPostFormMode('draft')).toBe(true);
    expect(isPostFormMode('schedule')).toBe(true);
    expect(isPostFormMode('published')).toBe(false);
    expect(isPostFormMode('')).toBe(false);
  });
});

describe('parseTags', () => {
  it('trims, lowercases and drops blanks', () => {
    expect(parseTags('Botox, Lip Filler , ,skincare')).toEqual([
      'botox',
      'lip-filler',
      'skincare',
    ]);
  });

  it('hyphenates spaces rather than removing them', () => {
    // "lipfiller" would be wrong.
    expect(parseTags('lip filler')).toEqual(['lip-filler']);
  });

  it('de-duplicates case-insensitively', () => {
    expect(parseTags('botox, Botox, BOTOX')).toEqual(['botox']);
  });

  it('handles empty input', () => {
    expect(parseTags('')).toEqual([]);
    expect(parseTags(null)).toEqual([]);
    expect(parseTags(undefined)).toEqual([]);
  });
});

describe('suggestSlug', () => {
  it('delegates to the core slugify', () => {
    // The point of the extraction: one implementation, not two.
    const headline = 'Botox vs Dysport: What’s the Difference?';
    expect(suggestSlug(headline)).toBe(slugify(headline));
  });
});

describe('suggestPostFields', () => {
  const body = '<p>First sentence here. Second sentence follows! Third one?</p>';

  it('derives all three from the core helpers', () => {
    const result = suggestPostFields({ body, headline: 'A Headline', excerpt: '' });
    expect(result.excerpt).toBe(deriveExcerpt(body));
    expect(result.seoTitle).toBe(deriveSeoTitle('A Headline'));
    expect(result.seoDescription).toBe(deriveSeoDescription({ excerpt: '', body }));
  });

  it('prefers an existing excerpt for the meta description', () => {
    const result = suggestPostFields({ body, headline: 'A Headline', excerpt: 'Hand written.' });
    expect(result.seoDescription).toBe(
      deriveSeoDescription({ excerpt: 'Hand written.', body }),
    );
  });

  it('returns empty strings for empty sources rather than throwing', () => {
    expect(suggestPostFields({ body: '', headline: '', excerpt: '' })).toEqual({
      excerpt: '',
      seoTitle: '',
      seoDescription: '',
    });
  });
});

describe('serializePostForm', () => {
  const base: PostFormValues = {
    headline: '  Hello World  ',
    subheadline: '   ',
    slug: '',
    excerpt: '  ',
    body: '<p>Body</p>',
    layout: 'standard',
    seoTitle: '',
    seoDescription: '',
    tags: 'a, b',
    mode: 'draft',
    publishAt: '2026-08-19T09:30',
  };

  it('trims text fields', () => {
    expect(serializePostForm(base).headline).toBe('Hello World');
  });

  it('turns blank optional fields into undefined', () => {
    const result = serializePostForm(base);
    expect(result.subheadline).toBeUndefined();
    expect(result.slug).toBeUndefined();
    expect(result.excerpt).toBeUndefined();
  });

  it('leaves the body untrimmed — the sanitizer owns it', () => {
    expect(serializePostForm(base).body).toBe('<p>Body</p>');
  });

  it('parses tags', () => {
    expect(serializePostForm(base).tags).toEqual(['a', 'b']);
  });

  /**
   * The reason publishAt is conditional: the datetime input keeps its value when
   * the schedule row is hidden, so sending it unconditionally would let a stale
   * date ride along on a draft or an immediate publish.
   */
  it('omits publishAt unless scheduling', () => {
    expect(serializePostForm(base).publishAt).toBeUndefined();
    expect(serializePostForm({ ...base, mode: 'publish' }).publishAt).toBeUndefined();
  });

  it('keeps publishAt when scheduling', () => {
    const result = serializePostForm({ ...base, mode: 'schedule' });
    expect(result.status).toBe('scheduled');
    expect(result.publishAt).toBe('2026-08-19T09:30');
  });

  it('drops an empty publishAt so the server reports it missing', () => {
    expect(serializePostForm({ ...base, mode: 'schedule', publishAt: '' }).publishAt).toBeUndefined();
  });

  it('lets a project merge its own fields on top', () => {
    // Alpenglow's relatedServices — the seam that keeps per-site fields out of
    // the shared serializer.
    const payload = { ...serializePostForm(base), relatedServices: ['injectables'] };
    expect(payload.relatedServices).toEqual(['injectables']);
    expect(payload.headline).toBe('Hello World');
  });
});
