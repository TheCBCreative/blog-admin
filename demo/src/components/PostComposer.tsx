import { useEffect, useState } from 'react';
import {
  serializePostForm,
  suggestPostFields,
  suggestSlug,
  type PostFormMode,
  type PostFormValues,
} from '@thecbcreative/blog-admin/client';
import { withBase } from '../lib/base-path';
import { DEMO_MEDIA, findDemoMedia } from '../lib/demo-media';
import { listUploads, type BrowserUpload } from '../lib/browser-media';
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
  /** The visitor's sandbox — lets the image picker offer their own uploads. */
  sandboxId?: string;
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

export default function PostComposer({ mode, post, layouts, sandboxId }: Props) {
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
  const [uploads, setUploads] = useState<BrowserUpload[]>([]);
  const [publishAt, setPublishAt] = useState(toLocalInputValue(post?.publishAt));

  const [saving, setSaving] = useState<PostFormMode | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!sandboxId) return;
    listUploads(sandboxId).then(setUploads).catch(() => setUploads([]));
  }, [sandboxId]);

  // An upload is stored as a data URL — show its name instead of the raw data.
  const uploadName = imageUrl.startsWith('data:')
    ? (uploads.find((u) => u.dataUrl === imageUrl)?.name ?? 'your upload')
    : null;

  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  function applySuggestions() {
    const s = suggestPostFields({ body, headline, excerpt });
    if (!excerpt) setExcerpt(s.excerpt);
    if (!seoTitle) setSeoTitle(s.seoTitle);
    if (!seoDescription) setSeoDescription(s.seoDescription);
    if (!slug) setSlug(suggestSlug(headline));
  }

  function serializedFields(formMode: PostFormMode) {
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
    return serializePostForm(values);
  }

  function sendPost(path: string, method: 'POST' | 'PATCH', fields: object) {
    const featuredImage = imageUrl ? { url: imageUrl, alt: imageAlt } : undefined;
    return fetch(withBase(path), {
      method,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...fields, featuredImage }),
    });
  }

  /** Returns the saved post's id, or null after showing the response's errors. */
  async function readSavedId(res: Response, failMessage: string): Promise<string | null> {
    if (res.status === 422) {
      setErrors((await res.json()).errors ?? []);
      return null;
    }
    if (!res.ok) {
      setErrors([{ field: 'form', message: failMessage }]);
      return null;
    }
    return (await res.json()).post.id;
  }

  async function save(formMode: PostFormMode) {
    setSaving(formMode);
    setErrors([]);
    setSavedNote(null);

    const res = await sendPost(
      mode === 'edit' ? `/api/admin/posts/${post!.id}` : '/api/admin/posts',
      mode === 'edit' ? 'PATCH' : 'POST',
      serializedFields(formMode),
    );
    setSaving(null);

    const savedId = await readSavedId(res, 'Something went wrong saving this post.');
    if (savedId === null) return;

    if (formMode === 'publish') {
      // Land on the dashboard so the new status and counts are visible.
      window.location.href = withBase(`/admin?published=${encodeURIComponent(savedId)}`);
    } else if (mode === 'create' || savedId !== post!.id) {
      // A different id back from an edit means this was a placeholder and the
      // server saved it as the visitor's own copy — continue editing that.
      window.location.href = withBase(`/admin/posts/${savedId}/edit`);
    } else {
      setSavedNote('Saved.');
    }
  }

  async function preview() {
    // Open the tab before any await: browsers block a window.open that isn't
    // synchronous with the click. It's pointed at the preview once saved.
    const tab = window.open('about:blank', '_blank');

    setPreviewing(true);
    setErrors([]);
    setSavedNote(null);

    if (mode === 'edit') {
      // Leave out status/publishAt so previewing a live or scheduled post
      // doesn't revert it to draft.
      const { status: _status, publishAt: _publishAt, ...fields } = serializedFields('draft');
      const res = await sendPost(`/api/admin/posts/${post!.id}`, 'PATCH', fields);
      setPreviewing(false);
      if (!res.ok) tab?.close();

      const savedId = await readSavedId(res, 'Could not save changes before previewing.');
      if (savedId === null) return;

      if (tab) tab.location.href = withBase(`/admin/posts/${savedId}/preview`);
      if (savedId !== post!.id) {
        // Placeholder saved as the visitor's own copy — keep editing the copy.
        window.location.href = withBase(`/admin/posts/${savedId}/edit`);
        return;
      }
      setSavedNote('Saved and opened preview.');
      return;
    }

    // A new post has nothing to preview yet, so save it as a draft first.
    const res = await sendPost('/api/admin/posts', 'POST', serializedFields('draft'));
    setPreviewing(false);
    if (!res.ok) tab?.close();

    const savedId = await readSavedId(res, 'Could not save this draft before previewing.');
    if (savedId === null) return;

    if (tab) tab.location.href = withBase(`/admin/posts/${savedId}/preview`);
    window.location.href = withBase(`/admin/posts/${savedId}/edit`);
  }

  async function remove() {
    if (!window.confirm(`Delete "${post!.headline}"? This can't be undone.`)) return;
    setDeleting(true);
    setErrors([]);
    setSavedNote(null);

    const res = await fetch(withBase(`/api/admin/posts/${post!.id}`), { method: 'DELETE' });
    if (!res.ok) {
      setDeleting(false);
      setErrors([{ field: 'form', message: 'Something went wrong deleting this post.' }]);
      return;
    }
    window.location.href = withBase('/admin?deleted=1');
  }

  const busy = saving !== null || previewing || deleting;
  const formError = errorFor('form');

  // Picking a sample photo fills in its alt text, unless the author has typed their own.
  function chooseImageUrl(url: string) {
    setImageUrl(url);
    const match = findDemoMedia(url);
    if (match && (!imageAlt.trim() || DEMO_MEDIA.some((m) => m.alt === imageAlt))) {
      setImageAlt(match.alt);
    }
  }

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
            {uploadName ? (
              <div className="upload-chip">
                <span>Your upload: {uploadName}</span>
                <button type="button" className="btn-ghost btn" onClick={() => chooseImageUrl('')}>
                  Clear
                </button>
              </div>
            ) : (
              <input id="imageUrl" type="text" value={imageUrl} onChange={(e) => chooseImageUrl(e.target.value)} placeholder="Paste an image URL, or pick one below" />
            )}
            <div className="photo-picker" role="group" aria-label="Your uploads and sample photos">
              {uploads.map((u) => (
                <button
                  type="button"
                  key={u.id}
                  className={`photo-picker-item ${imageUrl === u.dataUrl ? 'selected' : ''}`}
                  onClick={() => chooseImageUrl(u.dataUrl)}
                  aria-pressed={imageUrl === u.dataUrl}
                  title={`Your upload: ${u.name}`}
                >
                  <img src={u.dataUrl} alt={`Your upload: ${u.name}`} loading="lazy" />
                </button>
              ))}
              {DEMO_MEDIA.map((m) => {
                const url = withBase(m.url);
                return (
                  <button
                    type="button"
                    key={m.url}
                    className={`photo-picker-item ${imageUrl === url ? 'selected' : ''}`}
                    onClick={() => chooseImageUrl(url)}
                    aria-pressed={imageUrl === url}
                    title={m.alt}
                  >
                    <img src={url} alt={m.alt} loading="lazy" />
                  </button>
                );
              })}
            </div>
            <div className="hint">Pick one of your uploads or a sample photo (samples fill in their alt text), or paste a URL.</div>
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="imageAlt">Alt text</label>
            <input id="imageAlt" type="text" value={imageAlt} onChange={(e) => setImageAlt(e.target.value)} />
            <div className="hint">Required whenever an image is set — enforced on save.</div>
            {errorFor('featuredImage.alt') && <div className="error-msg">{errorFor('featuredImage.alt')}</div>}
          </div>
          <div className="hint" style={{ marginTop: 10 }}>
            Upload your own images in the <a href={withBase('/admin/media')}>Media Library</a> — they show up above.
          </div>
        </div>

        <div className="form-actions">
          <button className="btn" disabled={busy} onClick={preview}>
            {previewing ? 'Opening…' : 'Preview'}
          </button>
          <button className="btn" disabled={busy} onClick={() => save('draft')}>
            {saving === 'draft' ? 'Saving…' : 'Save Draft'}
          </button>
          <button className="btn" disabled={busy} onClick={() => save('schedule')}>
            {saving === 'schedule' ? 'Scheduling…' : 'Schedule'}
          </button>
          <button className="btn btn-primary" disabled={busy} onClick={() => save('publish')}>
            {saving === 'publish' ? 'Publishing…' : 'Publish'}
          </button>
        </div>

        {mode === 'edit' && (
          <div className="danger-zone">
            <button className="btn-text-danger" disabled={busy} onClick={remove}>
              {deleting ? 'Deleting…' : 'Delete post'}
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
