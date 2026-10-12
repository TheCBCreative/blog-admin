/**
 * Image types the demo accepts for upload. An explicit list rather than
 * `image/*` so SVG is excluded: it can carry script, and served from our
 * origin it would run with the admin's cookies.
 */
export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
] as const;

export function isAllowedImageType(type: string): boolean {
  return (ALLOWED_IMAGE_TYPES as readonly string[]).includes(type);
}

/** For a file input's `accept` attribute. */
export const IMAGE_ACCEPT = ALLOWED_IMAGE_TYPES.join(',');

export const IMAGE_TYPE_ERROR = 'Only JPEG, PNG, GIF, WebP or AVIF images can be uploaded.';
