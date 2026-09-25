import { useEffect, useState, useCallback } from 'react';
import { isSeedPost, visibleTags } from '../lib/demo-cleanup';
import { withBase } from '../lib/base-path';

interface Post {
  id: string;
  headline: string;
  authorName: string;
  status: 'draft' | 'scheduled' | 'published' | 'archived';
  publishAt?: string;
  updatedAt: string;
  tags: string[];
}

const TABS: Array<{ key: string; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'published', label: 'Published' },
  { key: 'archived', label: 'Archived' },
];

function displayStatus(p: Post): string {
  if (p.status !== 'scheduled') return p.status === 'published' ? 'live' : p.status;
  return p.publishAt && new Date(p.publishAt).getTime() <= Date.now() ? 'live' : 'scheduled';
}

export default function PostList() {
  const [tab, setTab] = useState('all');
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (status: string) => {
    setPosts(null);
    const qs = status === 'all' ? '' : `?status=${status}`;
    const res = await fetch(withBase(`/api/admin/posts${qs}`));
    if (!res.ok) {
      setError('Could not load posts.');
      setPosts([]);
      return;
    }
    const data = await res.json();
    setPosts(data.posts);
  }, []);

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function onDelete(id: string, headline: string) {
    if (!window.confirm(`Delete "${headline}"? This can't be undone in the demo either.`)) return;
    setBusyId(id);
    setError(null);
    const res = await fetch(withBase(`/api/admin/posts/${id}`), { method: 'DELETE' });
    setBusyId(null);
    if (!res.ok) {
      setError(`Could not delete "${headline}".`);
      return;
    }
    load(tab);
  }

  return (
    <div>
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="card" style={{ padding: 0 }}>
        {posts === null ? (
          <p className="empty">Loading…</p>
        ) : posts.length === 0 ? (
          <p className="empty">No posts in this view.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Headline</th>
                <th>Status</th>
                <th>Tags</th>
                <th>Updated</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {posts.map((p) => (
                <tr key={p.id}>
                  <td className="headline">
                    <a href={withBase(`/admin/posts/${p.id}/edit`)}>{p.headline}</a>
                    {isSeedPost(p.tags) && (
                      <span className="badge badge-draft" style={{ marginLeft: 8 }}>
                        Placeholder
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`badge badge-${displayStatus(p)}`}>{displayStatus(p)}</span>
                  </td>
                  <td style={{ color: 'var(--ink-faint)', fontSize: 12.5 }}>{visibleTags(p.tags).join(', ') || '—'}</td>
                  <td>{new Date(p.updatedAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-danger"
                      style={{ padding: '4px 10px' }}
                      disabled={busyId === p.id}
                      onClick={() => onDelete(p.id, p.headline)}
                    >
                      {busyId === p.id ? '…' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
