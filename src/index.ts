/**
 * Public entry point.
 *
 * Consumers should import from here, `./core`, or `./adapters/*` — never reach
 * into internal file paths, so refactors stay non-breaking.
 */

export type {
  Post,
  PostStatus,
  PostImage,
  NewPost,
  PostPatch,
  PostInput,
} from './types.js';

export * from './core/index.js';
export * from './adapters/index.js';
export * from './service/index.js';
