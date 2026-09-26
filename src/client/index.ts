/**
 * Browser-side helpers: plain TS and `fetch`, no framework. Consuming sites
 * supply their own markup while the security-relevant behaviour stays here.
 */

export {
  createAuthClient,
  type AuthClient,
  type AuthClientOptions,
  type AuthResult,
} from './auth.js';

export { parseRetryAfter, retryAfterSeconds, rateLimitMessage } from './retry.js';

export { safeNextPath } from './redirect.js';

export {
  serializePostForm,
  suggestPostFields,
  suggestSlug,
  parseTags,
  statusForMode,
  isPostFormMode,
  type PostFormMode,
  type PostFormValues,
  type SerializedPost,
  type SuggestedFields,
  type SuggestionSources,
} from './post-form.js';

export {
  closedLightbox,
  lightboxReducer,
  lightboxKeyAction,
  lightboxNeighbors,
  type LightboxState,
  type LightboxAction,
  type LightboxKeyAction,
  type LightboxOptions,
} from './lightbox.js';
