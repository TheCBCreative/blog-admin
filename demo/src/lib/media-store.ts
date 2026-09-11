/**
 * Demo media store.
 *
 * The package defines a `MediaStore` interface but ships no concrete
 * implementation yet — a real client site is expected to wire its own S3/R2
 * adapter. This is a minimal one for the demo: writes to local disk under
 * public/uploads. Fine for showing the upload flow; NOT what a production
 * deployment should use, since Vercel's filesystem is ephemeral per
 * invocation. See DEMO_DEPLOY.md for wiring real object storage.
 */
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaStore, UploadedMedia } from '@thecbcreative/blog-admin/adapters';

const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

export function createLocalDiskMediaStore(): MediaStore {
  return {
    async upload(file: File, opts): Promise<UploadedMedia> {
      const maxBytes = opts?.maxBytes ?? 8 * 1024 * 1024;
      if (file.size > maxBytes) {
        throw new Error(`File is too large (${Math.round(file.size / 1024)}KB, max ${Math.round(maxBytes / 1024)}KB).`);
      }
      if (!file.type.startsWith('image/')) {
        throw new Error('Only image uploads are supported in this demo.');
      }

      await mkdir(UPLOAD_DIR, { recursive: true });
      const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'bin';
      const name = `${randomUUID()}.${ext}`;
      const bytes = Buffer.from(await file.arrayBuffer());
      await writeFile(join(UPLOAD_DIR, name), bytes);

      return {
        url: `/uploads/${name}`,
        // Real dimensions would need an image-decoding pass; the demo just
        // shows a fixed placeholder aspect since it's not the point being
        // demonstrated here.
        width: 1200,
        height: 800,
        bytes: bytes.byteLength,
        contentType: file.type,
      };
    },

    async delete(url: string): Promise<void> {
      if (!url.startsWith('/uploads/')) return;
      await unlink(join(process.cwd(), 'public', url)).catch(() => {});
    },
  };
}
