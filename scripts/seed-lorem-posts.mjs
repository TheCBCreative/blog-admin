/**
 * One-off: seeds 4 lorem-ipsum blog posts so the new /blog design (see
 * docs/mocks/blog.md) has real posts to render against instead of an empty
 * index. Filler content, same spirit as the draft-example.md placeholder
 * event entry — swap for real posts before launch.
 *
 * Plain .mjs importing only the (precompiled, published-to-npm)
 * @neondatabase/serverless driver directly, rather than going through
 * @thecbcreative/blog-admin's service layer — that package ships raw
 * TypeScript source (see its package.json "exports"), which needs a bundler
 * (Vite/esbuild/rolldown) to run, and this sandbox's node_modules were
 * installed on macOS but this shell is Linux, so every bundler's native
 * binary is the wrong platform and the npm registry is unreachable here to
 * fetch the right one. The driver package itself ships plain compiled JS, so
 * it works fine under plain Node. Mirrors the exact INSERT columns from
 * packages/blog-admin/src/adapters/neon/index.ts so the rows this writes are
 * indistinguishable from ones the real admin form would have created.
 *
 *   node scripts/seed-lorem-posts.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { neon } from '@neondatabase/serverless';

const here = dirname(fileURLToPath(import.meta.url));

// Minimal .env reader — avoids depending on `dotenv` or Node's own
// loadEnvFile flag inconsistencies across versions.
function loadEnv(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv(join(here, '..', '.env'));

const { DATABASE_URL } = process.env;
if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set (expected in alpenglow/.env).');
  process.exit(1);
}

const sql = neon(DATABASE_URL);

const lorem = () =>
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod ' +
  'tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim ' +
  'veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea ' +
  'commodo consequat. Duis aute irure dolor in reprehenderit in voluptate ' +
  'velit esse cillum dolore eu fugiat nulla pariatur.';

const loremBody = (heading) => `
<p>${lorem()}</p>
<h2>${heading}</h2>
<p>${lorem()}</p>
<p>${lorem()}</p>
<h2>Excepteur sint occaecat cupidatat</h2>
<p>${lorem()}</p>
<ul>
  <li>Lorem ipsum dolor sit amet consectetur</li>
  <li>Adipiscing elit sed do eiusmod tempor</li>
  <li>Incididunt ut labore et dolore magna</li>
</ul>
<p>${lorem()}</p>
`.trim();

const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

const seedPosts = [
  {
    slug: 'lorem-ipsum-dolor-sit-amet-consectetur',
    headline: 'Lorem Ipsum Dolor Sit Amet Consectetur',
    subheadline: 'Adipiscing elit sed do eiusmod tempor incididunt ut labore.',
    excerpt:
      'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    tags: ['skincare'],
    daysAgo: 2,
    heading: 'Ut enim ad minim veniam',
  },
  {
    slug: 'consectetur-adipiscing-elit-sed-do-eiusmod',
    headline: 'Consectetur Adipiscing Elit Sed Do Eiusmod',
    subheadline: 'Tempor incididunt ut labore et dolore magna aliqua ut enim.',
    excerpt:
      'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis nostrud exercitation.',
    tags: ['treatments'],
    daysAgo: 9,
    heading: 'Quis nostrud exercitation ullamco',
  },
  {
    slug: 'ut-labore-et-dolore-magna-aliqua',
    headline: 'Ut Labore Et Dolore Magna Aliqua',
    subheadline: 'Quis nostrud exercitation ullamco laboris nisi ut aliquip.',
    excerpt:
      'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat duis aute.',
    tags: ['behind-the-scenes'],
    daysAgo: 16,
    heading: 'Duis aute irure dolor',
  },
  {
    slug: 'duis-aute-irure-dolor-in-reprehenderit',
    headline: 'Duis Aute Irure Dolor In Reprehenderit',
    subheadline: 'Voluptate velit esse cillum dolore eu fugiat nulla pariatur.',
    excerpt:
      'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.',
    tags: ['wellness'],
    daysAgo: 23,
    heading: 'Excepteur sint occaecat',
  },
];

for (const p of seedPosts) {
  const publishedAt = daysAgo(p.daysAgo);
  try {
    const rows = await sql`
      INSERT INTO posts (
        slug, headline, subheadline, body, excerpt,
        image_url, image_alt, image_width, image_height,
        layout, status, publish_at, published_at,
        author_name, tags, related_services,
        seo_title, seo_description, canonical_url
      ) VALUES (
        ${p.slug}, ${p.headline}, ${p.subheadline},
        ${loremBody(p.heading)}, ${p.excerpt},
        ${null}, ${null}, ${null}, ${null},
        'standard', 'published', ${null}, ${publishedAt.toISOString()},
        'Erika Peschel', ${p.tags}, ${[]},
        ${null}, ${null}, ${null}
      )
      ON CONFLICT (slug) DO NOTHING
      RETURNING slug
    `;
    if (rows[0]) {
      console.log(`created: /blog/${rows[0].slug}/`);
    } else {
      console.log(`skipped (slug already exists): ${p.slug}`);
    }
  } catch (err) {
    console.error(`failed: ${p.headline}`, err);
  }
}
