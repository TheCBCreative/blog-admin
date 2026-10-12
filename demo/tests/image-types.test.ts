import { describe, expect, it } from 'vitest';
import { isAllowedImageType } from '../src/lib/image-types';
import { createLocalDiskMediaStore } from '../src/lib/media-store';

describe('upload image types', () => {
  it.each(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/avif'])('allows %s', (type) => {
    expect(isAllowedImageType(type)).toBe(true);
  });

  it.each(['image/svg+xml', 'text/html', 'image/x-icon', ''])('refuses %s', (type) => {
    expect(isAllowedImageType(type)).toBe(false);
  });

  it('the local media store rejects an SVG before writing it', async () => {
    const svg = new File(['<svg onload="alert(1)"/>'], 'x.svg', { type: 'image/svg+xml' });
    await expect(createLocalDiskMediaStore().upload(svg)).rejects.toThrow(/JPEG, PNG/);
  });
});
