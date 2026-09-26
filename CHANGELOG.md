# Changelog

Every release of `@thecbcreative/blog-admin`, newest first. Versions follow the rules in the README's [Versioning](README.md#versioning) section; anything a client site has to do when upgrading is listed under **Upgrading**.

## 0.2.0 — 2026-09-26

### Added
- `client`: a framework-agnostic lightbox (full-size image viewer) — `lightboxReducer`, `lightboxKeyAction`, `lightboxNeighbors` and `closedLightbox` — covering open/close, next/previous with wrap-around, and keyboard shortcuts. Each site supplies its own markup; see `demo/src/components/Lightbox.tsx`.

### Fixed
- `core`: internal links in sanitized post HTML no longer carry empty `target` and `rel` attributes, and an author-supplied `target`/`rel` on an internal link is removed.

### Upgrading
- No changes needed.

## 0.1.0

First version used by client sites: the post domain model, validation, scheduling and status logic, HTML sanitization, the `PostStore` interface with a Neon/Postgres adapter, the post service, Better Auth setup with route guards and rate limits, password reset email, and the framework-agnostic browser helpers in `client`.
