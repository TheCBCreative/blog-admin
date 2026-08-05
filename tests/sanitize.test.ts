import { describe, it, expect } from 'vitest';
import { sanitizePostHtml } from '../src/core/sanitize.js';

/**
 * These are the tests that matter most in the whole package. A regression here
 * is stored XSS on a client's public site, so they're deliberately paranoid.
 */

describe('script execution vectors', () => {
  it('strips script tags and their contents', () => {
    expect(sanitizePostHtml('<p>ok</p><script>alert(1)</script>')).toBe('<p>ok</p>');
  });

  it('strips inline event handlers', () => {
    const out = sanitizePostHtml('<p onclick="alert(1)">text</p>');
    expect(out).not.toContain('onclick');
    expect(out).toContain('text');
  });

  it('strips onerror on any surviving tag', () => {
    const out = sanitizePostHtml('<p onerror="alert(1)">x</p>');
    expect(out).not.toContain('onerror');
  });

  it('removes javascript: hrefs but keeps the link text', () => {
    const out = sanitizePostHtml('<a href="javascript:alert(1)">click</a>');
    expect(out).not.toContain('javascript');
    expect(out).toContain('click');
  });

  it('removes data: and vbscript: hrefs', () => {
    expect(sanitizePostHtml('<a href="data:text/html,<script>x</script>">a</a>')).not.toContain(
      'data:',
    );
    expect(sanitizePostHtml('<a href="vbscript:msgbox(1)">a</a>')).not.toContain('vbscript');
  });

  it('is not fooled by casing or whitespace in the scheme', () => {
    for (const href of ['JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)']) {
      const out = sanitizePostHtml(`<a href="${href}">x</a>`);
      expect(out.toLowerCase()).not.toContain('javascript:');
    }
  });
});

describe('embedding and layout vectors', () => {
  it('strips iframes', () => {
    expect(sanitizePostHtml('<iframe src="https://evil.example"></iframe>')).toBe('');
  });

  it('strips style tags and style attributes', () => {
    const out = sanitizePostHtml('<style>body{display:none}</style><p style="color:red">x</p>');
    expect(out).not.toContain('style');
    expect(out).toContain('x');
  });

  it('strips form elements', () => {
    const out = sanitizePostHtml('<form action="https://evil.example"><input name="pw"></form>');
    expect(out).not.toContain('form');
    expect(out).not.toContain('input');
  });

  it('strips the exotic tags mXSS payloads rely on', () => {
    for (const tag of ['svg', 'math', 'noscript', 'template', 'object', 'embed']) {
      const out = sanitizePostHtml(`<${tag}><p>x</p></${tag}>`);
      expect(out).not.toContain(`<${tag}`);
    }
  });

  it('strips img, since images must go through the media store for alt text', () => {
    expect(sanitizePostHtml('<img src="https://x.example/a.jpg">')).toBe('');
  });

  it('strips h1, which belongs to the post headline', () => {
    const out = sanitizePostHtml('<h1>Second h1</h1>');
    // A second h1 damages the document outline.
    expect(out).not.toContain('<h1');
  });
});

describe('legitimate formatting survives', () => {
  it('keeps basic text formatting', () => {
    const html = '<p>Some <strong>bold</strong> and <em>italic</em> text.</p>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps lists', () => {
    const html = '<ul><li>one</li><li>two</li></ul>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps allowed headings and blockquotes', () => {
    const html = '<h2>Heading</h2><h3>Sub</h3><blockquote><p>Quoted</p></blockquote>';
    expect(sanitizePostHtml(html)).toBe(html);
  });

  it('keeps safe links with their href', () => {
    const out = sanitizePostHtml('<a href="https://example.com">link</a>');
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('link');
  });

  it('keeps mailto and tel links', () => {
    expect(sanitizePostHtml('<a href="mailto:a@b.com">mail</a>')).toContain('mailto:a@b.com');
    expect(sanitizePostHtml('<a href="tel:+14253954341">call</a>')).toContain('tel:+14253954341');
  });

  it('keeps relative internal links', () => {
    const out = sanitizePostHtml('<a href="/services/injectables/">Injectables</a>');
    expect(out).toContain('href="/services/injectables/"');
  });
});

describe('link hardening', () => {
  it('adds noopener noreferrer to external links', () => {
    const out = sanitizePostHtml('<a href="https://example.com">x</a>');
    // Without noopener the opened page can reach back via window.opener.
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).toContain('target="_blank"');
  });

  it('does not force new tabs on internal links', () => {
    const out = sanitizePostHtml('<a href="/about/">x</a>');
    expect(out).not.toContain('target="_blank"');
  });

  it('overrides an attacker-supplied rel on an external link', () => {
    const out = sanitizePostHtml('<a href="https://example.com" rel="">x</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });
});

describe('edge cases', () => {
  it('handles empty and whitespace input', () => {
    expect(sanitizePostHtml('')).toBe('');
    expect(sanitizePostHtml('   ')).toBe('   ');
  });

  it('passes plain text through unchanged', () => {
    expect(sanitizePostHtml('Just words, no markup.')).toBe('Just words, no markup.');
  });

  it('does not crash on malformed markup', () => {
    expect(() => sanitizePostHtml('<p><strong>unclosed')).not.toThrow();
    expect(() => sanitizePostHtml('<<>><p>')).not.toThrow();
  });

  it('is idempotent — sanitizing twice matches sanitizing once', () => {
    const dirty = '<p>ok</p><script>bad()</script><a href="https://x.example">l</a>';
    const once = sanitizePostHtml(dirty);
    expect(sanitizePostHtml(once)).toBe(once);
  });
});
