/** Core domain types, free of storage and framework concerns. Adapters map to and from these. */

/**
 * Author intent, not visibility. Visibility is derived (core/status.ts) so
 * scheduling needs no background job to flip rows.
 */
export type PostStatus = 'draft' | 'scheduled' | 'published' | 'archived';

export interface PostImage {
  url: string;
  /** Required whenever an image is set — enforced in validation, not just the UI. */
  alt: string;
  width: number;
  height: number;
}

export interface Post {
  id: string;
  /** URL-safe, unique, editable. Drives /blog/{slug}. */
  slug: string;

  headline: string;
  subheadline?: string;
  /** Sanitized HTML. Never store raw editor output. */
  body: string;
  /** Used in listings and as the meta-description fallback. */
  excerpt?: string;

  featuredImage?: PostImage;

  /** Project-configurable; validated against the consumer's declared layouts. */
  layout: string;

  status: PostStatus;
  /** UTC. Set when scheduled; the moment the post becomes visible. */
  publishAt?: Date;
  /** UTC. Set on first publish and never overwritten, so edits don't reset the date. */
  publishedAt?: Date;

  authorName: string;
  tags: string[];
  /** Service slugs — powers blog-to-service internal linking. */
  relatedServices: string[];

  seoTitle?: string;
  seoDescription?: string;
  /** Rare; for syndicated content pointing elsewhere. */
  canonicalUrl?: string;

  createdAt: Date;
  updatedAt: Date;
}

/** Fields a caller supplies on create. Timestamps and id are storage's job. */
export type NewPost = Omit<Post, 'id' | 'createdAt' | 'updatedAt'>;

export type PostPatch = Partial<Omit<Post, 'id' | 'createdAt'>>;

/** Draft shape coming off the form, before validation fills in defaults. */
export interface PostInput {
  slug?: string;
  headline: string;
  subheadline?: string;
  body?: string;
  excerpt?: string;
  featuredImage?: Partial<PostImage>;
  layout?: string;
  status?: PostStatus;
  /** ISO string or Date; local-time strings are interpreted in the configured zone. */
  publishAt?: string | Date;
  authorName?: string;
  tags?: string[];
  relatedServices?: string[];
  seoTitle?: string;
  seoDescription?: string;
  canonicalUrl?: string;
}
