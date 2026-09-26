/** Post validation. Must run server-side on save; UI-only checks are bypassed by a direct POST. */

import type { PostInput, PostStatus } from '../types.js';
import { isValidSlug } from './slug.js';
import { isPostStatus } from './status.js';
import { parseLocalDateTime, DEFAULT_TIME_ZONE } from './datetime.js';
import { EXCERPT_MAX, SEO_TITLE_MAX, SEO_DESCRIPTION_MAX } from './derive.js';

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidateOptions {
  /** Layouts the consuming project declared. Empty means don't check. */
  allowedLayouts?: readonly string[];
  timeZone?: string;
  now?: Date;
}

export const LIMITS = {
  headline: 200,
  subheadline: 250,
  excerpt: EXCERPT_MAX,
  seoTitle: SEO_TITLE_MAX,
  seoDescription: SEO_DESCRIPTION_MAX,
  alt: 250,
} as const;

/** Returns every problem rather than throwing on the first, so the form can show them all. */
export function validatePost(input: PostInput, opts: ValidateOptions = {}): ValidationError[] {
  const errors: ValidationError[] = [];
  const now = opts.now ?? new Date();
  const timeZone = opts.timeZone ?? DEFAULT_TIME_ZONE;

  const push = (field: string, message: string): void => void errors.push({ field, message });

  if (!input.headline || input.headline.trim().length === 0) {
    push('headline', 'A headline is required.');
  } else if (input.headline.length > LIMITS.headline) {
    push('headline', `Headline must be ${LIMITS.headline} characters or fewer.`);
  }

  if (input.subheadline && input.subheadline.length > LIMITS.subheadline) {
    push('subheadline', `Subheadline must be ${LIMITS.subheadline} characters or fewer.`);
  }
  if (input.excerpt && input.excerpt.length > LIMITS.excerpt) {
    push('excerpt', `Excerpt must be ${LIMITS.excerpt} characters or fewer.`);
  }
  if (input.seoTitle && input.seoTitle.length > LIMITS.seoTitle) {
    push('seoTitle', `SEO title should be ${LIMITS.seoTitle} characters or fewer to avoid truncation.`);
  }
  if (input.seoDescription && input.seoDescription.length > LIMITS.seoDescription) {
    push('seoDescription', `Meta description should be ${LIMITS.seoDescription} characters or fewer.`);
  }

  if (input.slug !== undefined && !isValidSlug(input.slug)) {
    push('slug', 'Slug may contain lowercase letters, numbers, and single hyphens only.');
  }

  if (input.featuredImage?.url) {
    const alt = input.featuredImage.alt?.trim();
    if (!alt) {
      push('featuredImage.alt', 'Alt text is required for images — describe what the photo shows.');
    } else if (alt.length > LIMITS.alt) {
      push('featuredImage.alt', `Alt text must be ${LIMITS.alt} characters or fewer.`);
    }
  }

  if (input.status !== undefined && !isPostStatus(input.status)) {
    push('status', 'Unrecognized status.');
  }

  const status = input.status as PostStatus | undefined;
  if (status === 'scheduled') {
    if (input.publishAt === undefined) {
      push('publishAt', 'Pick a date and time to schedule this post.');
    } else {
      const when = coercePublishAt(input.publishAt, timeZone);
      if (when === null) {
        push('publishAt', 'That date and time could not be read.');
      } else if (when.getTime() <= now.getTime()) {
        push('publishAt', 'Scheduled time must be in the future. To publish now, use Publish instead.');
      }
    }
  }

  if (input.layout && opts.allowedLayouts && opts.allowedLayouts.length > 0) {
    if (!opts.allowedLayouts.includes(input.layout)) {
      push('layout', `"${input.layout}" is not one of this site's layouts.`);
    }
  }

  for (const tag of input.tags ?? []) {
    if (!isValidSlug(tag)) {
      push('tags', `Tag "${tag}" must be lowercase with hyphens instead of spaces.`);
      break;
    }
  }

  return errors;
}

/**
 * Normalizes the form's publishAt into a UTC Date. A bare local-time string is
 * interpreted in `timeZone`; a Date passes through. Returns null when unparseable.
 */
export function coercePublishAt(
  value: string | Date,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;

  try {
    // An explicit offset or Z is already absolute; don't reinterpret in timeZone.
    if (/[Zz]$|[+-]\d{2}:\d{2}$/.test(value.trim())) {
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return parseLocalDateTime(value, timeZone);
  } catch {
    return null;
  }
}
