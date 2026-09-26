/**
 * HTML sanitization for post bodies.
 *
 * Only admins write HTML; this contains stored XSS from a leaked credential or
 * pasted markup. Sanitize on save AND on render — client-side alone is bypassed
 * by a direct POST.
 *
 * sanitize-html is parser-based and can't fully stop mutation-XSS the way
 * DOMPurify can. That's acceptable only because the allowlist excludes the tags
 * mXSS relies on (svg, math, noscript, template); revisit if untrusted authors
 * are ever added.
 */

import sanitizeHtml from 'sanitize-html';
import { normalizeLinkHref } from './link.js';

/**
 * Exactly the tags the editor can produce. h1 is excluded because the headline
 * owns it; img because images go through the media store to get alt text and
 * dimensions.
 */
export const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'em',
  'u',
  's',
  'a',
  'ul',
  'ol',
  'li',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'code',
  'pre',
  'hr',
] as const;

const options: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],

  allowedAttributes: {
    a: ['href', 'target', 'rel', 'title'],
  },

  // Kills javascript:, data:, and vbscript: hrefs.
  allowedSchemes: ['http', 'https', 'mailto', 'tel'],
  allowedSchemesAppliedToAttributes: ['href'],

  // Drop disallowed tags entirely rather than escaping them, so stray markup
  // doesn't render as visible angle brackets on the page.
  disallowedTagsMode: 'discard',

  transformTags: {
    // External links open in a new tab with noopener (blocks window.opener
    // access) and noreferrer; internal links stay in the same tab.
    a: (tagName, { target: _target, rel: _rel, ...attribs }) => {
      const href = normalizeLinkHref(attribs.href ?? '');
      const isExternal = /^https?:\/\//i.test(href);

      return {
        tagName,
        attribs: isExternal ? { ...attribs, href, target: '_blank', rel: 'noopener noreferrer' } : { ...attribs, href },
      };
    },
  },
};

/** Sanitizes a post body. Safe to render with set:html afterwards. */
export function sanitizePostHtml(dirty: string): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, options);
}

/** Returns a sanitizer function, for passing to PostService's sanitizeHtml hook. */
export function createSanitizer(): (html: string) => string {
  return sanitizePostHtml;
}
