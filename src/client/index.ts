/**
 * Browser-side helpers. Framework-agnostic by design — plain TS and `fetch`, no
 * DOM framework — so a consuming site supplies its own markup and styling while
 * the security-relevant behaviour stays in one place.
 */

export { createAuthClient, type AuthClient, type AuthClientOptions, type AuthResult } from './auth.js';
export { parseRetryAfter, retryAfterSeconds, rateLimitMessage } from './retry.js';
export { safeNextPath } from './redirect.js';
