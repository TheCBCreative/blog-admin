/**
 * Post form serialization and field suggestions.
 *
 * This exists to stop the form's browser script from reimplementing the derive
 * and slug logic. The inline version in Alpenglow had its own copies of
 * toPlainText, the truncation rule (including the `maxLength * 0.6` sentence
 * threshold), and slugify — so tuning the package silently left the form
 * suggesting text the server would never save. That failure looks like a display
 * glitch, which is the worst kind.
 *
 * Deliberately NOT a form renderer. Field markup and any project-specific inputs
 * stay in the consuming site, because those genuinely differ per client. What's
 * shared is the interpretation of values, not their presentation.
 */

import {
  deriveExcerpt,
  deriveSeoDescription,
  deriveSeoTitle,
  slugify,
} from '../core/index.js';
import type { PostStatus } from '../types.js';

/** What the save button is about to do. Maps to a status, not stored itself. */
export type PostFormMode = 'draft' | 'publish' | 'schedule';

export function isPostFormMode(value: string): value is PostFormMode {
  return value === 'draft' || value === 'publish' || value === 'schedule';
}

/**
 * The status a mode produces.
 *
 * 'schedule' resolves to 'scheduled' regardless of the date — the service
 * decides whether a past date means it's already live, so this stays a pure
 * mapping with no clock involved.
 */
export function statusForMode(mode: PostFormMode): PostStatus {
  switch (mode) {
    case 'publish':
      return 'published';
    case 'schedule':
      return 'scheduled';
    default:
      return 'draft';
  }
}

/**
 * Splits a comma-separated tag input into normalised slugs.
 *
 * Applied here as well as server-side so what the author typed matches what
 * comes back. Spaces become hyphens rather than being stripped, so "lip filler"
 * reads as one tag instead of collapsing to "lipfiller".
 */
export function parseTags(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(',')) {
    const tag = part.trim().toLowerCase().replace(/\s+/g, '-');
    if (tag) seen.add(tag);
  }
  return [...seen];
}

/** Suggested slug for a headline. Thin pass-through so callers need one import. */
export function suggestSlug(headline: string): string {
  return slugify(headline);
}

export interface SuggestionSources {
  /** Post body, as HTML. */
  body: string;
  headline: string;
  /** Current excerpt, if the author has one — it takes priority for the meta. */
  excerpt?: string;
}

export interface SuggestedFields {
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
}

/**
 * Derives all three suggestable fields in one call.
 *
 * Order matters: the meta description prefers the excerpt over the body, so a
 * caller refreshing suggestions should pass the excerpt it already has.
 */
export function suggestPostFields(sources: SuggestionSources): SuggestedFields {
  return {
    excerpt: deriveExcerpt(sources.body),
    seoTitle: deriveSeoTitle(sources.headline),
    seoDescription: deriveSeoDescription({
      excerpt: sources.excerpt,
      body: sources.body,
    }),
  };
}

/** Raw values as read out of form inputs — all strings, as the DOM gives them. */
export interface PostFormValues {
  headline: string;
  subheadline?: string;
  slug?: string;
  excerpt?: string;
  /** HTML from the editor. */
  body: string;
  layout: string;
  seoTitle?: string;
  seoDescription?: string;
  /** Comma-separated; parsed by parseTags. */
  tags?: string;
  mode: PostFormMode;
  /** Bare local datetime ("2026-08-19T09:30"), interpreted server-side. */
  publishAt?: string;
}

/** Shape sent to the API. Project-specific fields are merged in by the caller. */
export interface SerializedPost {
  headline: string;
  subheadline?: string;
  slug?: string;
  excerpt?: string;
  body: string;
  layout: string;
  seoTitle?: string;
  seoDescription?: string;
  tags: string[];
  status: PostStatus;
  publishAt?: string;
}

/** Empty strings become undefined, so the server can distinguish unset from blank. */
function orUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Turns form values into the API payload.
 *
 * Returns only the shared fields. A site with extra inputs spreads its own on
 * top rather than this trying to anticipate them:
 *
 *   { ...serializePostForm(values), relatedServices: [...] }
 *
 * publishAt is only included when scheduling — sending it otherwise would let a
 * stale datetime in a hidden field alter a draft or an immediate publish.
 */
export function serializePostForm(values: PostFormValues): SerializedPost {
  const status = statusForMode(values.mode);

  return {
    headline: values.headline.trim(),
    subheadline: orUndefined(values.subheadline),
    slug: orUndefined(values.slug),
    excerpt: orUndefined(values.excerpt),
    // Not trimmed: it's HTML, and the sanitizer owns normalising it.
    body: values.body,
    layout: values.layout,
    seoTitle: orUndefined(values.seoTitle),
    seoDescription: orUndefined(values.seoDescription),
    tags: parseTags(values.tags),
    status,
    publishAt: status === 'scheduled' ? orUndefined(values.publishAt) : undefined,
  };
}
