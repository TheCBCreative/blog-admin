import { useEffect, useState, useRef, useCallback, useReducer } from 'react';
import { closedLightbox, lightboxReducer, type LightboxAction, type LightboxState } from '@thecbcreative/blog-admin/client';
import { withBase } from '../lib/base-path';
import { DEMO_MEDIA } from '../lib/demo-media';
import {
  addUpload,
  deleteUpload,
  listUploads,
  readHiddenSamples,
  writeHiddenSamples,
  type BrowserUpload,
} from '../lib/browser-media';
import Lightbox from './Lightbox';

interface MediaItem {
  /** Upload id, or the sample photo's unprefixed URL. */
  key: string;
  url: string;
  name: string;
  bytes: number;
  alt?: string;
  /** A pre-loaded sample photo rather than this visitor's own upload. */
  sample: boolean;
}

interface Props {
  /** The visitor's sandbox (lib/sandbox.ts) — uploads and hidden samples reset with it. */
  sandboxId: string;
}

function TrashIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}

export default function MediaLibrary({ sandboxId }: Props) {
  const [uploads, setUploads] = useState<BrowserUpload[] | null>(null);
  const [hiddenSamples, setHiddenSamples] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [confirmingKey, setConfirmingKey] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setUploads(await listUploads(sandboxId));
    } catch (err) {
      // Never leave the page stuck on "Loading…": the sample photos still show.
      setUploads([]);
      setError(err instanceof Error ? err.message : 'Couldn’t load your uploads.');
    }
  }, [sandboxId]);

  useEffect(() => {
    load();
    setHiddenSamples(readHiddenSamples(sandboxId));
  }, [load, sandboxId]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      await addUpload(sandboxId, file);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  }

  // The visitor's own uploads first (newest first), then the sample photos.
  const allItems: MediaItem[] = [
    ...(uploads ?? []).map((u) => ({ key: u.id, url: u.dataUrl, name: u.name, bytes: u.bytes, sample: false })),
    ...DEMO_MEDIA.filter((m) => !hiddenSamples.includes(m.url)).map((m) => ({
      key: m.url,
      url: withBase(m.url),
      name: m.name,
      bytes: m.bytes,
      alt: m.alt,
      sample: true,
    })),
  ];

  const [lightbox, dispatchLightbox] = useReducer(
    (state: LightboxState, action: LightboxAction) => lightboxReducer(state, action, allItems.length),
    closedLightbox,
  );

  async function remove(item: MediaItem) {
    setError(null);
    setConfirmingKey(null);
    if (item.sample) {
      const next = [...hiddenSamples, item.key];
      setHiddenSamples(next);
      writeHiddenSamples(sandboxId, next);
      return;
    }
    try {
      await deleteUpload(item.key);
      setUploads((current) => (current ?? []).filter((u) => u.id !== item.key));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    }
  }

  function restoreSamples() {
    setHiddenSamples([]);
    writeHiddenSamples(sandboxId, []);
  }

  function copy(url: string) {
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl((c) => (c === url ? null : c)), 1500);
  }

  return (
    <div>
      <div
        className={`dropzone ${dragActive ? 'active' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        style={{ cursor: 'pointer' }}
      >
        {uploading ? 'Uploading…' : 'Drop an image here, or click to choose one'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload(file);
            e.target.value = '';
          }}
        />
      </div>

      {error && <div className="form-error" style={{ marginTop: 12 }}>{error}</div>}

      {uploads === null ? (
        <p className="empty">Loading…</p>
      ) : allItems.length === 0 ? (
        <p className="empty">No media yet — upload an image above.</p>
      ) : (
        <div className="media-grid">
          {allItems.map((item, index) => (
            <div className={`media-item ${confirmingKey === item.key ? 'confirming' : ''}`} key={item.key}>
              <button
                type="button"
                className="media-thumb"
                aria-label={`View full size: ${item.alt ?? item.name}`}
                onClick={() => dispatchLightbox({ type: 'open', index })}
              >
                <img src={item.url} alt={item.alt ?? item.name} loading="lazy" />
              </button>
              <button
                type="button"
                className="media-delete"
                aria-label={`Delete ${item.name}`}
                title="Delete"
                onClick={() => setConfirmingKey(item.key)}
              >
                <TrashIcon />
              </button>
              {confirmingKey === item.key ? (
                <div
                  className="meta media-confirm"
                  role="group"
                  aria-label={`Confirm deleting ${item.name}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') setConfirmingKey(null);
                  }}
                >
                  <div>{item.sample ? 'Remove this sample photo?' : 'Delete this image? This can’t be undone.'}</div>
                  <div className="media-confirm-actions">
                    <button type="button" className="btn btn-danger-solid" onClick={() => remove(item)}>
                      {item.sample ? 'Remove' : 'Delete'}
                    </button>
                    <button type="button" className="btn" autoFocus onClick={() => setConfirmingKey(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="meta">
                  <div>
                    {Math.round(item.bytes / 1024)} KB{!item.sample && ' · your upload'}
                  </div>
                  {item.sample ? (
                    <button
                      className="btn"
                      style={{ marginTop: 6, padding: '3px 8px', fontSize: 11, width: '100%', justifyContent: 'center' }}
                      onClick={() => copy(item.url)}
                    >
                      {copiedUrl === item.url ? 'Copied!' : 'Copy URL'}
                    </button>
                  ) : (
                    <div className="media-hint">Pick it under “Featured image” when editing a post.</div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {hiddenSamples.length > 0 && (
        <p className="media-restore">
          <button type="button" className="btn-ghost btn" onClick={restoreSamples}>
            Restore sample photos ({hiddenSamples.length})
          </button>
        </p>
      )}

      <Lightbox
        items={allItems.map((i) => ({ url: i.url, alt: i.alt ?? i.name }))}
        state={lightbox}
        dispatch={dispatchLightbox}
      />
    </div>
  );
}
