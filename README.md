# blog-admin

Self-hosted, themeable blog admin, built to be shared across multiple client sites — core logic is reusable, with styling and extra fields configurable per project.

## Stack

- TypeScript
- PostgreSQL via [Neon](https://neon.tech) (serverless Postgres)
- Auth via [better-auth](https://www.better-auth.com/)
- Transactional email via [Resend](https://resend.com)
- Tested with [Vitest](https://vitest.dev)

## Architecture

Built as a modular package with clear boundaries:

- `core` — shared business logic
- `client` — client-facing interface
- `adapters` — pluggable data adapters (currently a Neon/Postgres adapter)
- `auth` — authentication layer
- `service` — service layer

This separation means the same admin core can power multiple client blogs, with each project only needing to configure its own theme, fields, and adapter — instead of rebuilding a blog admin from scratch per client.

## Scripts

- `npm run typecheck` — TypeScript type checking
- `npm test` / `npm run test:watch` — run the test suite
- `npm run db:setup` — run database + auth migrations
- `npm run db:seed-admin` — seed an initial admin user

## Why I built it

Most client blog admins get rebuilt from scratch per project. I wanted one well-tested, typed core I could reuse and re-theme instead — less duplicated logic, more consistent behavior across client sites.
