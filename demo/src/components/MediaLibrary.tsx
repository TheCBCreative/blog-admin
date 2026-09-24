import { useEffect, useState, useRef, useCallback } from 'react';
import { withBase } from '../lib/base-path';

interface MediaItem {
  url: string;
  name: string;
  bytes: number;
  uploadedAt: string;
}

export default function MediaLibrary() {
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(withBase('/api/admin/media'));
    const data = await res.json();
    setItems(data.items);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(withBase('/api/admin/media'), { method: 'POST', body: form });
    setUploading(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? 'Upload failed.');
      return;
    }
    load();
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
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

      {items === null ? (
        <p className="empty">Loading…</p>
      ) : items.length === 0 ? (
        <p className="empty">No media uploaded yet in this demo session.</p>
      ) : (
        <div className="media-grid">
          {items.map((item) => (
            <div className="media-item" key={item.url}>
              <img src={item.url} alt={item.name} />
              <div className="meta">
                <div>{Math.round(item.bytes / 1024)} KB</div>
                <button
                  className="btn"
                  style={{ marginTop: 6, padding: '3px 8px', fontSize: 11, width: '100%', justifyContent: 'center' }}
                  onClick={() => copy(item.url)}
                >
                  {copiedUrl === item.url ? 'Copied!' : 'Copy URL'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
