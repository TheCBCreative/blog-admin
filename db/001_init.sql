-- blog-admin initial schema (Postgres / Neon)
--
-- Better Auth manages its own tables (user, session, account, verification) and
-- creates them via its own migration tooling. Keep this file to post storage
-- only so the two can be applied and versioned independently.

CREATE TABLE IF NOT EXISTS posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL,

  headline      TEXT NOT NULL,
  subheadline   TEXT,
  body          TEXT NOT NULL DEFAULT '',
  excerpt       TEXT,

  -- Flattened rather than JSONB: these are always queried together and never
  -- partially, and flat columns let the DB enforce "alt present when url is".
  image_url     TEXT,
  image_alt     TEXT,
  image_width   INTEGER,
  image_height  INTEGER,

  layout        TEXT NOT NULL DEFAULT 'standard',

  status        TEXT NOT NULL DEFAULT 'draft',
  publish_at    TIMESTAMPTZ,
  published_at  TIMESTAMPTZ,

  author_name   TEXT NOT NULL,
  tags              TEXT[] NOT NULL DEFAULT '{}',
  related_services  TEXT[] NOT NULL DEFAULT '{}',

  seo_title        TEXT,
  seo_description  TEXT,
  canonical_url    TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT posts_status_valid
    CHECK (status IN ('draft', 'scheduled', 'published', 'archived')),

  -- A scheduled post without a time would be invisible forever.
  CONSTRAINT posts_scheduled_needs_time
    CHECK (status <> 'scheduled' OR publish_at IS NOT NULL),

  -- Mirrors the app-level rule so a direct DB write can't create an
  -- accessibility gap. Belt and braces on purpose.
  CONSTRAINT posts_image_needs_alt
    CHECK (image_url IS NULL OR (image_alt IS NOT NULL AND length(trim(image_alt)) > 0))
);

-- Slugs are the public URL, so uniqueness is enforced by the DB rather than
-- trusting the app to check first (which races under concurrent writes).
CREATE UNIQUE INDEX IF NOT EXISTS posts_slug_key ON posts (slug);

-- listLive() filters on status + publish_at and orders by date on every public
-- request; this covers it without a sort.
CREATE INDEX IF NOT EXISTS posts_live_lookup
  ON posts (status, publish_at DESC NULLS LAST);

-- Tag archive pages filter with `tags && ARRAY[...]`.
CREATE INDEX IF NOT EXISTS posts_tags_gin ON posts USING GIN (tags);

-- Keep updated_at honest even for writes that bypass the app.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS posts_set_updated_at ON posts;
CREATE TRIGGER posts_set_updated_at
  BEFORE UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();
