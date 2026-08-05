/**
 * Deriving excerpt and SEO fields from post content.
 *
 * These produce a decent starting point, not finished copy. The admin fills them
 * in as editable suggestions rather than applying them invisibly, so the author
 * can see exactly what will appear in search results and rewrite it.
 */

/** Strips tags and collapses whitespace. Handles both plain text and HTML bodies. */
export function toPlainText(input: string): string {
  return input
    // Block-level tags become spaces so words don't run together when stripped.
    .replace(/<\/?(p|div|br|h[1-6]|li|blockquote|tr)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    // Decode the entities likely to appear in editor output.
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncates without cutting mid-word.
 *
 * Ends on a complete sentence when one falls in the last 40% of the budget,
 * since a whole sentence reads better than a clause trailing off. Earlier
 * sentence ends are ignored on purpose: a body opening with "Hi." would
 * otherwise produce a three-character excerpt. Below that threshold it cuts at
 * the last word boundary and marks the truncation.
 */
function truncateNicely(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;

  const window = text.slice(0, maxLength);

  // Sentence end at least 60% of the way in.
  const sentenceEnd = Math.max(
    window.lastIndexOf('. '),
    window.lastIndexOf('! '),
    window.lastIndexOf('? '),
  );
  if (sentenceEnd > maxLength * 0.6) {
    return window.slice(0, sentenceEnd + 1);
  }

  // Otherwise cut at the last space and mark the truncation.
  const lastSpace = window.lastIndexOf(' ');
  const cut = lastSpace > 0 ? window.slice(0, lastSpace) : window;
  return `${cut.replace(/[,;:.!?]$/, '')}…`;
}

export const EXCERPT_MAX = 320;
export const SEO_TITLE_MAX = 60;
export const SEO_DESCRIPTION_MAX = 155;

/** Suggested excerpt from the body. */
export function deriveExcerpt(body: string, maxLength = EXCERPT_MAX): string {
  const text = toPlainText(body);
  if (!text) return '';
  return truncateNicely(text, maxLength);
}

/**
 * Suggested search title. Just the headline, trimmed to fit — appending the
 * business name would eat most of a 60-character budget.
 */
export function deriveSeoTitle(headline: string, maxLength = SEO_TITLE_MAX): string {
  const text = toPlainText(headline);
  if (!text) return '';
  return truncateNicely(text, maxLength);
}

/**
 * Suggested meta description, from the excerpt if there is one, otherwise the
 * body. Shorter budget than the excerpt because search engines truncate around
 * 155 characters.
 */
export function deriveSeoDescription(
  opts: { excerpt?: string; body?: string },
  maxLength = SEO_DESCRIPTION_MAX,
): string {
  const source = opts.excerpt?.trim() || opts.body || '';
  const text = toPlainText(source);
  if (!text) return '';
  return truncateNicely(text, maxLength);
}
