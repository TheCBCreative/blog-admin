/**
 * HTML sanitization for post bodies.
 *
 * ── Threat model ────────────────────────────────────────────────────────────
 * Only an authenticated admin can write HTML, so there's no untrusted
 * contributor path. This exists as containment: if an admin credential ever
 * leaks, or someone pastes markup from Word or a random website, stored XSS on
 * the public site would let an attacker run script against every visitor. That's
 * meaningfully worse than defacement.
 *
 * Sanitize on save AND on render. Client-side sanitization alone is worthless —
 * anyone can POST directly to the API.
 *
 * Known limitation: sanitize-html is parser-based, not DOM-based, so it can't
 * fully neutralize mutation-XSS the way DOMPurify does. Acceptable here because
 * the allowlist below excludes the exotic tags (svg, math, noscript, template)
 * that mXSS payloads rely on. Revisit if untrusted authors are ever added.
 */

import sanitizeHtml from 'sanitize-html';
import { normalizeLinkHref } from './link.js';

/**
 * Exactly the tags the editor can produce, and nothing else.
 *
 * Deliberately excluded: h1 (the post headline owns that, and a second h1
 * damages document outline and SEO), img (images go through the media store so
 * they get alt text and dimensions), iframe/script/style/form, and every
 * embedding tag.
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
    /**
     * External links get rel="noopener noreferrer". Without noopener, the opened
     * page can reach back through window.opener; noreferrer avoids leaking the
     * referring URL. Internal links are left alone so in-site navigation doesn't
     * open new tabs.
     */
    a: (tagName, attribs) => {
      // Bare domains get https:// here, so "example.com" doesn't resolve as a
      // path relative to the post's own URL.
      const href = normalizeLinkHref(attribs.href ?? '');
      const isExternal = /^https?:\/\//i.test(href);

      return {
        tagName,
        attribs: isExternal
          ? { ...attribs, href, target: '_blank', rel: 'noopener noreferrer' }
          : { ...attribs, href, target: '', rel: '' },
      };
    },
  },

  // Strip empty attributes left behind by the transform above.
  nonBooleanAttributes: [],
};

/** Sanitizes a post body. Safe to render with set:html afterwards. */
export function sanitizePostHtml(dirty: string): string {
  if (!dirty) return '';
  return sanitizeHtml(dirty, options);
}

/**
 * Returns a sanitizer function, for passing to PostService's sanitizeHtml hook.
 */
export function createSanitizer(): (html: string) => string {
  return sanitizePostHtml;
}
