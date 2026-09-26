/** Public entry point. Consumers import from here, `./core`, or `./adapters/*`, never internal paths. */

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
