import { useState } from 'react';
import {
  serializePostForm,
  suggestPostFields,
  suggestSlug,
  type PostFormMode,
  type PostFormValues,
} from '@thecbcreative/blog-admin/client';
import { SEED_TAG } from '../lib/demo-cleanup';
import RichTextEditor from './RichTextEditor';

interface ExistingPost {
  id: string;
  slug: string;
  headline: string;
  subheadline?: string;
  excerpt?: string;
  body: string;
  layout: string;
  seoTitle?: string;
  seoDescription?: string;
  tags: string[];
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publishAt?: string;
  featuredImage?: { url: string; alt: string };
}

interface Props {
  mode: 'create' | 'edit';
  post?: ExistingPost;
  layouts: string[];
  /**
   * True for a seeded placeholder post. Re-appends the internal seed marker
   * tag on every save, so a placeholder stays exempt from demo cleanup even
   * after being edited — the marker itself is never shown in the tags field.
   */
  isSeed?: boolean;
}

interface FieldError {
  field: string;
  message: string;
}

function toLocalInputValue(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function PostComposer({ mode, post, layouts, isSeed = false }: Props) {
  const [headline, setHeadline] = useState(post?.headline ?? '');
  const [subheadline, setSubheadline] = useState(post?.subheadline ?? '');
  const [slug, setSlug] = useState(post?.slug ?? '');
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? '');
  const [body, setBody] = useState(post?.body ?? '');
  const [layout, setLayout] = useState(post?.layout ?? layouts[0]);
  const [tags, setTags] = useState((post?.tags ?? []).join(', '));
  const [seoTitle, setSeoTitle] = useState(post?.seoTitle ?? '');
  const [seoDescription, setSeoDescription] = useState(post?.seoDescription ?? '');
  const [imageUrl, setImageUrl] = useState(post?.featuredImage?.url ?? '');
  const [imageAlt, setImageAlt] = useState(post?.featuredImage?.alt ?? '');
  const [publishAt, setPublishAt] = useState(toLocalInputValue(post?.publishAt));

  const [saving, setSaving] = useState<PostFormMode | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  function applySuggestions() {
    const s = suggestPostFields({ body, headline, excerpt });
    if (!excerpt) setExcerpt(s.excerpt);
    if (!seoTitle) setSeoTitle(s.seoTitle);
    if (!seoDescription) setSeoDescription(s.seoDescription);
    if (!slug) setSlug(suggestSlug(headline));
  }

  async function save(formMode: PostFormMode) {
    setSaving(formMode);
    setErrors([]);
    setSavedNote(null);

    const values: PostFormValues = {
      headline,
      subheadline,
      slug,
      excerpt,
      body,
      layout,
      seoTitle,
      seoDescription,
      tags,
      mode: formMode,
      publishAt,
    };

    const serialized = serializePostForm(values);
    const payload = {
      ...serialized,
      // Re-tag on every save so editing a placeholder never loses its
      // cleanup exemption.
      tags: isSeed ? [...serialized.tags, SEED_TAG] : serialized.tags,
      featuredImage: imageUrl ? { url: imageUrl, alt: imageAlt } : undefined,
    };

    const url = mode === 'edit' ? `/api/admin/posts/${post!.id}` : '/api/admin/posts';
    const method = mode === 'edit' ? 'PATCH' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setSaving(null);

    if (res.status === 422) {
      const data = await res.json();
      setErrors(data.errors ?? []);
      return;
    }
    if (!res.ok) {
      setErrors([{ field: 'form', message: 'Something went wrong saving this post.' }]);
      return;
    }

    const data = await res.json();
    if (mode === 'create') {
      window.location.href = `/admin/posts/${data.post.id}/edit`;
    } else {
      setSavedNote('Saved.');
    }
  }

  async function preview() {
    // window.open has to happen synchronously in the click handler, before any
    // await — otherwise most browsers treat the later call as not user-
    // initiated and silently block the popup. Open a blank tab now, point it
    // at the real URL once we know it (or have saved a new post to get one).
    const tab = window.open('about:blank', '_blank');

    setPreviewing(true);
    setErrors([]);
    setSavedNote(null);

    const values: PostFormValues = {
      headline, subheadline, slug, excerpt, body, layout,
      seoTitle, seoDescription, tags, publishAt,
      mode: 'draft', // only relevant for a brand-new post; see below
    };
    const featuredImage = imageUrl ? { url: imageUrl, alt: imageAlt } : undefined;

    if (mode === 'edit') {
      // Save the current edits so the preview reflects them, but never touch
      // status/publishAt — previewing a live or scheduled post must not
      // silently revert it to draft.
      const { status: _status, publishAt: _publishAt, ...fields } = serializePostForm(values);
      const tags = isSeed ? [...fields.tags, SEED_TAG] : fields.tags;
      const res = await fetch(`/api/admin/posts/${post!.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...fields, tags, featuredImage }),
      });
      setPreviewing(false);

      if (res.status === 422) {
        tab?.close();
        setErrors((await res.json()).errors ?? []);
        return;
      }
      if (!res.ok) {
        tab?.close();
        setErrors([{ field: 'form', message: 'Could not save changes before previewing.' }]);
        return;
      }
      setSavedNote('Saved and opened preview.');
      if (tab) tab.location.href = `/admin/posts/${post!.id}/preview`;
      return;
    }

    // Creating: there's no row to preview yet, so save this as a draft first
    // (same as clicking "Save Draft") and preview that.
    const payload = { ...serializePostForm(values), featuredImage };
    const res = await fetch('/api/admin/posts', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setPreviewing(false);

    if (res.status === 422) {
      tab?.close();
      setErrors((await res.json()).errors ?? []);
      return;
    }
    if (!res.ok) {
      tab?.close();
      setErrors([{ field: 'form', message: 'Could not save this draft before previewing.' }]);
      return;
    }

    const data = await res.json();
    if (tab) tab.location.href = `/admin/posts/${data.post.id}/preview`;
    window.location.href = `/admin/posts/${data.post.id}/edit`;
  }

  const formError = errorFor('form');

  return (
    <div className="form-grid">
      <div>
        {formError && <div className="form-error">{formError}</div>}
        {savedNote && <div className="demo-creds" style={{ color: '#1e7a34', background: '#e6f4ea' }}>{savedNote}</div>}

        <div className={`field ${errorFor('headline') ? 'error' : ''}`}>
          <label htmlFor="headline">Headline</label>
          <input id="headline" type="text" value={headline} onChange={(e) => setHeadline(e.target.value)} onBlur={applySuggestions} />
          {errorFor('headline') && <div className="error-msg">{errorFor('headline')}</div>}
        </div>

        <div className="field">
          <label htmlFor="subheadline">Subheadline</label>
          <input id="subheadline" type="text" value={subheadline} onChange={(e) => setSubheadline(e.target.value)} />
        </div>

        <div className={`field ${errorFor('slug') ? 'error' : ''}`}>
          <label htmlFor="slug">Slug</label>
          <input id="slug" type="text" value={slug} onChange={(e) => setSlug(e.target.value)} />
          {errorFor('slug') && <div className="error-msg">{errorFor('slug')}</div>}
        </div>

        <div className={`field ${errorFor('excerpt') ? 'error' : ''}`}>
          <label htmlFor="excerpt">Excerpt</label>
          <input id="excerpt" type="text" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} />
          <div className="hint">Used in listings and as the meta-description fallback. Leave blank to auto-derive from the body on blur.</div>
        </div>

        <div className="field">
          <label htmlFor="body">Body</label>
          <RichTextEditor id="body" value={body} onChange={setBody} onBlur={applySuggestions} />
          <div className="hint">Sanitized server-side before storage.</div>
        </div>

        <div className="field">
          <label htmlFor="seoTitle">SEO title</label>
          <input id="seoTitle" type="text" value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} />
        </div>

        <div className="field">
          <label htmlFor="seoDescription">Meta description</label>
          <input id="seoDescription" type="text" value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} />
        </div>
      </div>

      <div>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="layout">Layout</label>
            <select id="layout" value={layout} onChange={(e) => setLayout(e.target.value)}>
              {layouts.map((l) => (
                <option key={l} value={l}>{l}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="tags">Tags</label>
            <input id="tags" type="text" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="comma, separated" />
          </div>

          <div className={`field ${errorFor('publishAt') ? 'error' : ''}`} style={{ marginBottom: 0 }}>
            <label htmlFor="publishAt">Scheduled for</label>
            <input id="publishAt" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} />
            <div className="hint">Only used by the Schedule action below.</div>
            {errorFor('publishAt') && <div className="error-msg">{errorFor('publishAt')}</div>}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className={`field ${errorFor('featuredImage.alt') ? 'error' : ''}`} style={{ marginBottom: 12 }}>
            <label htmlFor="imageUrl">Featured image URL</label>
            <input id="imageUrl" type="text" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="/uploads/… or paste a URL" />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="imageAlt">Alt text</label>
            <input id="imageAlt" type="text" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} />
            <div className="hint">Required whenever an image is set — enforced on save.</div>
            {errorFor('featuredImage.alt') && <div className="error-msg">{errorFor('featuredImage.alt')}</div>}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Grab a URL from the <a href="/admin/media">Media Library</a>.
          </div>
        </div>

        <div className="form-actions">
          <button className="btn" disabled={saving !== null || previewing} onClick={preview}>
            {previewing ? 'Opening…' : 'Preview'}
          </button>
          <button className="btn" disabled={saving !== null || previewing} onClick={() => save('draft')}>
            {saving === 'draft' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn" disabled={saving !== null || previewing} onClick={() => save('schedule')}>
            {saving === 'schedule' ? 'Scheduling…' : 'Schedule'}
          </button>
          <button className="btn btn-primary" disabled={saving !== null || previewing} onClick={() => save('publish')}>
            {saving === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  );
}
