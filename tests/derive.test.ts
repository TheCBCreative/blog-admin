import { describe, it, expect } from 'vitest';
import {
  toPlainText,
  deriveExcerpt,
  deriveSeoTitle,
  deriveSeoDescription,
  EXCERPT_MAX,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
} from '../src/core/derive.js';

describe('toPlainText', () => {
  it('strips tags', () => {
    expect(toPlainText('<p>Hello <strong>there</strong></p>')).toBe('Hello there');
  });

  it('keeps words apart across block boundaries', () => {
    // Naive tag-stripping produces "OneTwo" here.
    expect(toPlainText('<p>One</p><p>Two</p>')).toBe('One Two');
    expect(toPlainText('First<br>Second')).toBe('First Second');
  });

  it('decodes common entities', () => {
    expect(toPlainText('Botox &amp; filler')).toBe('Botox & filler');
    expect(toPlainText('Erika&#39;s')).toBe("Erika's");
    expect(toPlainText('a&nbsp;b')).toBe('a b');
  });

  it('collapses whitespace and trims', () => {
    expect(toPlainText('  lots   of \n\n space  ')).toBe('lots of space');
  });

  it('handles plain text unchanged', () => {
    expect(toPlainText('Just words.')).toBe('Just words.');
  });

  it('returns empty for empty input', () => {
    expect(toPlainText('')).toBe('');
    expect(toPlainText('   ')).toBe('');
  });
});

describe('deriveExcerpt', () => {
  it('returns short bodies whole, with no ellipsis', () => {
    expect(deriveExcerpt('A short post.')).toBe('A short post.');
  });

  it('ends on a complete sentence when one falls late in the budget', () => {
    // Sentence ends at char 47 of a 60 budget — past the 60% threshold.
    const body = 'This sentence is quite a bit longer than before. ' + 'x'.repeat(200);
    expect(deriveExcerpt(body, 60)).toBe('This sentence is quite a bit longer than before.');
  });

  it('ignores a sentence boundary that would yield a uselessly short excerpt', () => {
    // A body opening with "Hi." shouldn't produce a three-character excerpt just
    // because there's a period there.
    const body = 'Hi. ' + 'word '.repeat(50);
    const excerpt = deriveExcerpt(body, 60);
    expect(excerpt).not.toBe('Hi.');
    expect(excerpt.length).toBeGreaterThan(40);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('cuts at a word boundary, never mid-word', () => {
    const body = 'alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo';
    const excerpt = deriveExcerpt(body, 30);
    // Strip the ellipsis; every remaining token must be a whole word from the source.
    const words = excerpt.replace(/…$/, '').trim().split(' ');
    const source = body.split(' ');
    for (const word of words) {
      expect(source).toContain(word);
    }
  });

  it('respects the length budget', () => {
    const excerpt = deriveExcerpt('word '.repeat(200));
    expect(excerpt.length).toBeLessThanOrEqual(EXCERPT_MAX + 1); // +1 for the ellipsis
  });

  it('strips HTML before measuring', () => {
    expect(deriveExcerpt('<p>Hello <em>world</em></p>')).toBe('Hello world');
  });

  it('returns empty for an empty body', () => {
    expect(deriveExcerpt('')).toBe('');
    expect(deriveExcerpt('<p></p>')).toBe('');
  });

  it('does not leave dangling punctuation before the ellipsis', () => {
    const excerpt = deriveExcerpt('one, two, three, ' + 'x'.repeat(100), 20);
    expect(excerpt).not.toMatch(/[,;:]…$/);
  });
});

describe('deriveSeoTitle', () => {
  it('passes a short headline through', () => {
    expect(deriveSeoTitle('What To Expect')).toBe('What To Expect');
  });

  it('trims a long headline to the budget', () => {
    const title = deriveSeoTitle('word '.repeat(40));
    expect(title.length).toBeLessThanOrEqual(SEO_TITLE_MAX + 1);
  });

  it('returns empty for no headline', () => {
    expect(deriveSeoTitle('')).toBe('');
  });
});

describe('deriveSeoDescription', () => {
  it('prefers the excerpt over the body', () => {
    const result = deriveSeoDescription({
      excerpt: 'Hand written excerpt.',
      body: 'Some other body text entirely.',
    });
    expect(result).toBe('Hand written excerpt.');
  });

  it('falls back to the body when there is no excerpt', () => {
    expect(deriveSeoDescription({ body: 'From the body.' })).toBe('From the body.');
  });

  it('treats a whitespace-only excerpt as absent', () => {
    expect(deriveSeoDescription({ excerpt: '   ', body: 'From the body.' })).toBe('From the body.');
  });

  it('uses the shorter search budget, not the excerpt budget', () => {
    const result = deriveSeoDescription({ body: 'word '.repeat(100) });
    expect(result.length).toBeLessThanOrEqual(SEO_DESCRIPTION_MAX + 1);
  });

  it('returns empty when there is nothing to work from', () => {
    expect(deriveSeoDescription({})).toBe('');
  });
});
