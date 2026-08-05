import { describe, it, expect } from 'vitest';
import { normalizeLinkHref } from '../src/core/link.js';
import { sanitizePostHtml } from '../src/core/sanitize.js';

describe('normalizeLinkHref', () => {
  it('adds https:// to a bare domain', () => {
    // The bug this exists for: without a scheme the browser resolves this
    // against the current page URL.
    expect(normalizeLinkHref('thecbcreative.com')).toBe('https://thecbcreative.com');
    expect(normalizeLinkHref('www.example.com')).toBe('https://www.example.com');
    expect(normalizeLinkHref('sub.example.co.uk')).toBe('https://sub.example.co.uk');
  });

  it('keeps a path, query, or hash on a bare domain', () => {
    expect(normalizeLinkHref('example.com/services')).toBe('https://example.com/services');
    expect(normalizeLinkHref('example.com?a=1')).toBe('https://example.com?a=1');
    expect(normalizeLinkHref('example.com#top')).toBe('https://example.com#top');
  });

  it('leaves explicit schemes alone', () => {
    for (const href of [
      'https://example.com',
      'http://example.com',
      'mailto:a@b.com',
      'tel:+14253954341',
      'HTTPS://EXAMPLE.COM',
    ]) {
      expect(normalizeLinkHref(href)).toBe(href);
    }
  });

  it('leaves intentional same-site references alone', () => {
    // These would break if prefixed with a scheme.
    expect(normalizeLinkHref('/services/injectables/')).toBe('/services/injectables/');
    expect(normalizeLinkHref('#booking')).toBe('#booking');
    expect(normalizeLinkHref('?page=2')).toBe('?page=2');
  });

  it('turns a bare email into a mailto link', () => {
    expect(normalizeLinkHref('erika@alpenglowaesthetique.com')).toBe(
      'mailto:erika@alpenglowaesthetique.com',
    );
  });

  it('leaves ambiguous input alone rather than guessing', () => {
    // A relative path with no leading slash and no dot — could be anything.
    expect(normalizeLinkHref('services/injectables')).toBe('services/injectables');
    expect(normalizeLinkHref('some text')).toBe('some text');
  });

  it('trims whitespace', () => {
    expect(normalizeLinkHref('  example.com  ')).toBe('https://example.com');
  });

  it('returns empty for empty input', () => {
    expect(normalizeLinkHref('')).toBe('');
    expect(normalizeLinkHref('   ')).toBe('');
  });

  it('does not rescue a javascript: URL into something valid', () => {
    // Normalization must not create a scheme that the allowlist would then pass.
    expect(normalizeLinkHref('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});

describe('sanitizer applies normalization', () => {
  it('fixes a bare domain stored by any path, not just the editor', () => {
    const out = sanitizePostHtml('<a href="thecbcreative.com">site</a>');
    expect(out).toContain('href="https://thecbcreative.com"');
    // And it's now external, so it gets the hardening.
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('still strips javascript: after normalization', () => {
    const out = sanitizePostHtml('<a href="javascript:alert(1)">x</a>');
    expect(out.toLowerCase()).not.toContain('javascript:');
  });

  it('leaves internal links relative and same-tab', () => {
    const out = sanitizePostHtml('<a href="/about/">about</a>');
    expect(out).toContain('href="/about/"');
    expect(out).not.toContain('target="_blank"');
  });
});
