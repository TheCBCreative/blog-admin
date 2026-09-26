# Project notes for Claude

## Commit messages

Use this format for every commit:

```
feat/fix: short description of what changed
```

- Prefix with `feat:` for new functionality/content, `fix:` for corrections or bug fixes.
- Keep the whole subject line at 150 characters or under.
- No long multi-paragraph commit bodies — short and to the point.

## Releases

This package is consumed by client sites pinned to a git tag, so anything exported from `package.json` "exports" is public API. Follow the Versioning section in README.md, and add a CHANGELOG.md entry with every change a client could notice.
