export { createBlogAuth, type BlogAuth, type BlogAuthConfig } from './create-auth.js';

export {
  createAdminGuard,
  requireSession,
  getSession,
  withAuth,
  UnauthorizedError,
  type GuardOptions,
  type SessionResult,
} from './guard.js';

export { createEmailSender, DEFAULT_FROM, type EmailConfig } from './email.js';
