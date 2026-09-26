/**
 * Post form serialization and field suggestions. Reuses core's derive and slug
 * logic so the form never suggests values the server would compute differently.
 *
 * Deliberately not a form renderer: markup and project-specific inputs stay in
 * the consuming site.
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
 * The status a mode produces. 'schedule' maps to 'scheduled' regardless of the
 * date; the service decides whether a past date means it's already live.
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
 * Splits a comma-separated tag input into normalised, de-duplicated slugs.
 * Spaces become hyphens, so "lip filler" becomes "lip-filler".
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
 * Derives all three suggestable fields in one call. The meta description
 * prefers the excerpt over the body, so pass the current excerpt when
 * refreshing.
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
 * Turns form values into the API payload. Returns only the shared fields; a
 * site with extra inputs spreads its own on top:
 *
 *   { ...serializePostForm(values), relatedServices: [...] }
 *
 * publishAt is only sent when scheduling, so a stale value in a hidden field
 * can't alter a draft or an immediate publish.
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
