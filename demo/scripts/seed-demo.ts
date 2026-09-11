/**
 * Seeds the demo: a fixed admin account plus a realistic spread of posts
 * across every status. Safe to re-run — it clears posts and skips creating
 * the admin account if one already exists.
 *
 *   npm run db:seed   (from demo/)
 */
import './local-neon-shim.mjs';
import { createBlogAuth } from '@thecbcreative/blog-admin/auth';
import { createNeonPostStoreFromUrl } from '@thecbcreative/blog-admin/adapters/neon';
import { createLocalPgPostStore } from '../src/lib/local-pg-store';
import { createPostService } from '@thecbcreative/blog-admin/service';
import { DEMO_EMAIL, DEMO_PASSWORD } from '../src/lib/demo-config';
import { DEMO_LAYOUTS } from '../src/lib/store';
import { SEED_TAG } from '../src/lib/demo-cleanup';

const { DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL, LOCAL_PG } = process.env;

if (!DATABASE_URL || !BETTER_AUTH_SECRET) {
  console.error('DATABASE_URL and BETTER_AUTH_SECRET must be set (see .env.example).');
  process.exit(1);
}

const store =
  LOCAL_PG === 'true' ? createLocalPgPostStore(DATABASE_URL) : createNeonPostStoreFromUrl(DATABASE_URL);
const service = createPostService(store, { defaultAuthorName: 'Cait Burke', layouts: DEMO_LAYOUTS });

const auth = createBlogAuth({
  databaseUrl: DATABASE_URL,
  baseUrl: BETTER_AUTH_URL ?? 'http://localhost:4321',
  secret: BETTER_AUTH_SECRET,
  allowSignUp: true, // deliberately, for this script only
});

async function ensureDemoAdmin() {
  try {
    await auth.api.signUpEmail({ body: { name: 'Demo Admin', email: DEMO_EMAIL, password: DEMO_PASSWORD } });
    console.log(`Created demo admin: ${DEMO_EMAIL}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already.*(exist|registered)|duplicate key|unique constraint/i.test(message)) {
      console.log(`Demo admin already exists: ${DEMO_EMAIL}`);
    } else {
      throw err;
    }
  }
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);
const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

const POSTS = [
  {
    headline: 'Five small-business blog mistakes I see every week',
    excerpt: 'The same handful of fixable problems, over and over — here they are, with the fix for each.',
    body: '<p>Most client blogs fail for the same few reasons, and none of them are "not enough posts."</p><p>Here is what actually moves the needle.</p>',
    tags: ['content-strategy', 'small-business'],
    status: 'published' as const,
    publishedDaysAgo: 21,
  },
  {
    headline: 'How I theme one blog admin for every client site',
    excerpt: 'The same core, a different look each time — here is the actual mechanism.',
    body: '<p>Every client site gets its own brand, but none of them get a rebuilt CMS. Here is how that split works in practice.</p>',
    tags: ['engineering', 'design-systems'],
    status: 'published' as const,
    publishedDaysAgo: 9,
  },
  {
    headline: 'Why scheduled posts need a derived "is it live yet" check',
    excerpt: 'Status and visibility are not the same thing, and conflating them causes a very specific bug.',
    body: '<p>A post can be "scheduled" and also fully live, at the same time, depending only on the clock. That is worth designing around explicitly.</p>',
    tags: ['engineering'],
    status: 'published' as const,
    publishedDaysAgo: 2,
  },
  {
    headline: 'A photo essay: three client sites, three very different brands',
    excerpt: 'Same underlying components, completely different results.',
    body: '<p>Side-by-side, these do not look related at all — which was the point.</p>',
    tags: ['case-study', 'design'],
    status: 'scheduled' as const,
    publishAt: daysFromNow(4),
  },
  {
    headline: 'What I actually check before handing a client their new blog',
    excerpt: '',
    body: '<p>A short, boring checklist that has saved me from an embarrassing launch more than once.</p>',
    tags: ['process'],
    status: 'scheduled' as const,
    publishAt: daysFromNow(11),
  },
  {
    headline: 'Draft: notes on the media library rebuild',
    excerpt: '',
    body: '<p>Rough notes — not ready yet. Re-encoding on upload, not just validating by extension.</p>',
    tags: ['engineering'],
    status: 'draft' as const,
  },
  {
    headline: 'Draft: pricing page rewrite, take two',
    excerpt: '',
    body: '<p>First draft was too apologetic about the price. Rewriting from scratch.</p>',
    tags: ['copywriting'],
    status: 'draft' as const,
  },
  {
    headline: '2025 in review (superseded by the 2026 version)',
    excerpt: 'Kept for the record, no longer linked from anywhere on the live site.',
    body: '<p>Archived after the 2026 retrospective replaced it.</p>',
    tags: ['year-in-review'],
    status: 'archived' as const,
    publishedDaysAgo: 240,
  },
];

async function seedPosts() {
  const existing = await service.list({ limit: 200 });
  for (const p of existing) await service.delete(p.id);
  if (existing.length > 0) console.log(`Cleared ${existing.length} existing post(s).`);

  for (const p of POSTS) {
    const now =
      'publishedDaysAgo' in p && p.publishedDaysAgo !== undefined ? daysAgo(p.publishedDaysAgo) : new Date();

    const result = await service.create(
      {
        headline: p.headline,
        excerpt: p.excerpt || undefined,
        body: p.body,
        layout: DEMO_LAYOUTS[0],
        status: p.status,
        publishAt: 'publishAt' in p ? p.publishAt : undefined,
        // Tagged as a placeholder so the demo-cleanup job (and the auto-delete
        // on the live site) never touches it, no matter how old it gets.
        tags: [...p.tags, SEED_TAG],
        authorName: 'Cait Burke',
      },
      now,
    );

    if (!result.ok) {
      console.error(`Failed to seed "${p.headline}":`, result.errors);
      continue;
    }
    console.log(`  seeded [${p.status}] ${p.headline}`);
  }
}

await ensureDemoAdmin();
await seedPosts();

console.log('\nDemo seeded.');
console.log(`Log in at /admin/login with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
process.exit(0);
