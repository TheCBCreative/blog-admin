/**
 * Visitor uploads for the public demo, kept in the visitor's own browser.
 *
 * Vercel can't keep uploaded files, and a shared folder would show one
 * visitor's images to everyone, so uploads live in IndexedDB, tied to the
 * visitor's sandbox (lib/sandbox.ts) and cleared when it resets. Images are
 * stored as downscaled data URLs so they can be used as a featured image and
 * still render in the preview.
 */

export interface BrowserUpload {
  id: string;
  sandboxId: string;
  name: string;
  bytes: number;
  dataUrl: string;
  createdAt: number;
}

const DB_NAME = 'blog-composer-demo';
const STORE = 'uploads';
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_EDGE = 1600;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('This browser can’t store uploads (IndexedDB is unavailable).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Could not open browser storage.'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(req.result);
        };
        tx.onerror = () => {
          db.close();
          reject(tx.error ?? new Error('Browser storage failed.'));
        };
      }),
  );
}

/** This sandbox's uploads, newest first. Uploads from an expired sandbox are removed. */
export async function listUploads(sandboxId: string): Promise<BrowserUpload[]> {
  const all = await run<BrowserUpload[]>('readonly', (s) => s.getAll() as IDBRequest<BrowserUpload[]>);
  const stale = all.filter((u) => u.sandboxId !== sandboxId);
  await Promise.all(stale.map((u) => deleteUpload(u.id)));
  return all.filter((u) => u.sandboxId === sandboxId).sort((a, b) => b.createdAt - a.createdAt);
}

export async function addUpload(sandboxId: string, file: File): Promise<BrowserUpload> {
  if (!file.type.startsWith('image/')) throw new Error('Only images can be uploaded.');
  if (file.size > MAX_SOURCE_BYTES) throw new Error('That image is too large (15 MB max).');

  const dataUrl = await downscale(file);
  const upload: BrowserUpload = {
    id: crypto.randomUUID(),
    sandboxId,
    name: file.name || 'image',
    // Size of what's stored, not of the original file.
    bytes: Math.round(((dataUrl.length - dataUrl.indexOf(',') - 1) * 3) / 4),
    dataUrl,
    createdAt: Date.now(),
  };
  await run('readwrite', (s) => s.put(upload));
  return upload;
}

export async function deleteUpload(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
}

/** Re-encodes to a JPEG no larger than MAX_EDGE on its longest side. */
async function downscale(file: File): Promise<string> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('That file couldn’t be read as an image.');
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser can’t process images.');
  ctx.fillStyle = '#ffffff'; // JPEG has no transparency
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

// Sample photos the visitor has removed, hidden only for them.

const HIDDEN_SAMPLES_KEY = 'blog-composer:hidden-samples';

export function readHiddenSamples(sandboxId: string): string[] {
  try {
    const saved = JSON.parse(localStorage.getItem(HIDDEN_SAMPLES_KEY) ?? 'null') as
      | { sandboxId: string; urls: string[] }
      | null;
    return saved?.sandboxId === sandboxId && Array.isArray(saved.urls) ? saved.urls : [];
  } catch {
    return [];
  }
}

export function writeHiddenSamples(sandboxId: string, urls: string[]): void {
  try {
    localStorage.setItem(HIDDEN_SAMPLES_KEY, JSON.stringify({ sandboxId, urls }));
  } catch {
    // Storage unavailable (private mode etc.) — hiding still works until reload.
  }
}
