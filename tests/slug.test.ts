import { describe, it, expect } from 'vitest';
import { slugify, uniqueSlug, isValidSlug } from '../src/core/slug.js';

describe('slugify', () => {
  it('lowercases and hyphenates', () => {
    expect(slugify('What To Expect')).toBe('what-to-expect');
  });

  it('strips punctuation', () => {
    expect(slugify('Botox: Is It Safe?')).toBe('botox-is-it-safe');
  });

  it('removes apostrophes without leaving a separator', () => {
    // "erika-s-story" would read badly and is a common bug.
    expect(slugify("Erika's Story")).toBe('erikas-story');
    expect(slugify('Erika’s Story')).toBe('erikas-story');
  });

  it('transliterates accented characters instead of dropping them', () => {
    expect(slugify('Café Facial')).toBe('cafe-facial');
    expect(slugify('Beyoncé Glow')).toBe('beyonce-glow');
    expect(slugify('naïve piñata')).toBe('naive-pinata');
  });

  it('collapses runs of separators', () => {
    expect(slugify('too    many   spaces')).toBe('too-many-spaces');
    expect(slugify('dash--already—here')).toBe('dash-already-here');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  leading and trailing  ')).toBe('leading-and-trailing');
    expect(slugify('!!!bang!!!')).toBe('bang');
  });

  it('returns empty string for input with no usable characters', () => {
    expect(slugify('!!!')).toBe('');
    expect(slugify('')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('truncates long headlines without leaving a trailing hyphen', () => {
    const slug = slugify('a'.repeat(50) + ' ' + 'b'.repeat(50));
    expect(slug.length).toBeLessThanOrEqual(80);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('preserves numbers', () => {
    expect(slugify('5 Things To Know in 2026')).toBe('5-things-to-know-in-2026');
  });
});

describe('isValidSlug', () => {
  it('accepts well-formed slugs', () => {
    for (const s of ['post', 'my-post', 'a1-b2-c3', '2026-recap']) {
      expect(isValidSlug(s)).toBe(true);
    }
  });

  it('rejects malformed slugs', () => {
    for (const s of ['', 'Upper-Case', 'has space', 'double--hyphen', '-leading', 'trailing-', 'sym!bol']) {
      expect(isValidSlug(s)).toBe(false);
    }
  });

  it('rejects overly long slugs', () => {
    expect(isValidSlug('a'.repeat(81))).toBe(false);
  });
});

describe('uniqueSlug', () => {
  const existsIn = (taken: string[]) => async (slug: string) => taken.includes(slug);

  it('returns the base slug when free', async () => {
    expect(await uniqueSlug('My Post', existsIn([]))).toBe('my-post');
  });

  it('appends -2 on first collision', async () => {
    expect(await uniqueSlug('My Post', existsIn(['my-post']))).toBe('my-post-2');
  });

  it('keeps incrementing past consecutive collisions', async () => {
    expect(await uniqueSlug('My Post', existsIn(['my-post', 'my-post-2', 'my-post-3']))).toBe('my-post-4');
  });

  it('falls back to "post" when the headline yields nothing usable', async () => {
    expect(await uniqueSlug('!!!', existsIn([]))).toBe('post');
  });

  it('throws rather than looping forever when exhausted', async () => {
    const alwaysTaken = async () => true;
    await expect(uniqueSlug('My Post', alwaysTaken, 3)).rejects.toThrow(/unique slug/i);
  });
});
