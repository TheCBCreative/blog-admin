/**
 * Minimal `MediaStore` that writes to public/uploads on local disk. Not for
 * production: Vercel's filesystem is ephemeral, so a client site wires its
 * own S3/R2 adapter instead (see DEMO_DEPLOY.md).
 */
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { MediaStore, UploadedMedia } from '@thecbcreative/blog-admin/adapters';

export const UPLOAD_DIR = join(process.cwd(), 'public', 'uploads');

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
        // Placeholder dimensions; real ones would need an image-decoding pass.
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
