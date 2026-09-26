# blog-admin

A self-hosted, themeable blog admin shared across client sites. The core logic is written and tested once; each site brings its own styling, extra fields and storage adapter.

[![CI](https://github.com/TheCBCreative/blog-admin/actions/workflows/ci.yml/badge.svg)](https://github.com/TheCBCreative/blog-admin/actions/workflows/ci.yml)

## Stack

- TypeScript
- PostgreSQL via [Neon](https://neon.tech) (serverless Postgres)
- Auth via [Better Auth](https://www.better-auth.com/)
- Transactional email via [Resend](https://resend.com)
- Tested with [Vitest](https://vitest.dev)

## Architecture

The package is split into entry points, each imported on its own (for example `@thecbcreative/blog-admin/core`):

- `core` — the post domain logic: validation, slugs, scheduling and status, excerpt/SEO derivation, and HTML sanitization.
- `adapters` — the `PostStore` and `MediaStore` interfaces, plus `adapters/neon`, a Neon/Postgres implementation.
- `service` — `createPostService`, which validates, derives fields and writes through a `PostStore`.
- `auth` — Better Auth setup, the admin route guard and rate limits.
- `client` — framework-agnostic browser helpers: auth calls with a safe error-message policy, post-form serialization and field suggestions, and a lightbox (full-size image viewer) state machine. Each site supplies its own markup.

Everything a client site can import is listed under `exports` in `package.json` — that is the package's public API.

## Using it in a client site

Install a tagged release straight from GitHub, pinned to an exact version:

```bash
npm install github:TheCBCreative/blog-admin#v0.2.0
```

```json
"@thecbcreative/blog-admin": "github:TheCBCreative/blog-admin#v0.2.0"
```

Always pin to a tag, never to `main` or a commit hash: a tag is a fixed, named release, so a client site only changes when you upgrade it on purpose. The package ships TypeScript source, so the site needs a bundler that compiles it (Astro and Vite do this out of the box).

To upgrade a site: read the new versions in [CHANGELOG.md](./CHANGELOG.md), follow anything listed under **Upgrading**, change the tag, run `npm install`, and test before deploying.

## Versioning

Releases follow [semantic versioning](https://semver.org). The version number says what an upgrade can do to a client site:

- **Patch** (`0.2.0` → `0.2.1`) — bug fixes only. Nothing a site relies on changes.
- **Minor** (`0.2.0` → `0.3.0`) — new features, added in a backward-compatible way. Existing code keeps working.
- **Major** (`0.2.0` → `1.0.0`) — anything that could break a site: removing or renaming an export, changing what an existing function returns or accepts, a new required environment variable, or a database migration that isn't purely additive.

These rules apply now, before 1.0, so a minor or patch upgrade is always safe to take.

## Releasing

1. Add the changes to the top of [CHANGELOG.md](./CHANGELOG.md) and commit them.
2. Run one of:
   ```bash
   npm run release:patch   # 0.2.0 → 0.2.1
   npm run release:minor   # 0.2.0 → 0.3.0
   npm run release:major   # 0.2.0 → 1.0.0
   ```
   This type-checks and runs the tests (the release stops if either fails), bumps the version, commits it, tags it (`v0.3.0`), and pushes the commit and tag.
3. Upgrade client sites to the new tag when you're ready.

Every push and pull request also runs the type check and tests on GitHub Actions, along with the demo's tests and build.

## Demo

`demo/` is a real, working instance of this package — "Blog Composer": Astro pages with React islands for the admin screens (login, dashboard, posts, composer, media library), backed by a real Neon database and real Better Auth sessions. It uses the same public API a client site does. Because it's public, every visitor gets a private, self-resetting sandbox.

See [`demo/README.md`](./demo/README.md) to run it locally and [`demo/DEMO_DEPLOY.md`](./demo/DEMO_DEPLOY.md) to deploy it.

## Scripts

- `npm run typecheck` — TypeScript type checking
- `npm test` / `npm run test:watch` — run the test suite
- `npm run test:coverage` — run the test suite with a coverage report
- `npm run db:setup` — run database and auth migrations
- `npm run db:seed-admin` — create the initial admin user
- `npm run release:patch` / `release:minor` / `release:major` — cut a release (see [Releasing](#releasing))

## Why I built it

Most client blog admins get rebuilt from scratch for every project. I wanted one well-tested, typed core I could reuse and re-theme instead: less duplicated logic, and the same behavior on every client site.
