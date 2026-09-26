import { describe, expect, it } from 'vitest';
import {
  closedLightbox,
  lightboxKeyAction,
  lightboxNeighbors,
  lightboxReducer,
  type LightboxState,
} from '../src/client/lightbox.js';

const open = (index: number): LightboxState => ({ open: true, index });

describe('lightboxReducer', () => {
  it('opens at the requested index', () => {
    expect(lightboxReducer(closedLightbox, { type: 'open', index: 2 }, 5)).toEqual(open(2));
  });

  it('clamps an out-of-range or invalid open index', () => {
    expect(lightboxReducer(closedLightbox, { type: 'open', index: 99 }, 5)).toEqual(open(4));
    expect(lightboxReducer(closedLightbox, { type: 'open', index: -3 }, 5)).toEqual(open(0));
    expect(lightboxReducer(closedLightbox, { type: 'open', index: NaN }, 5)).toEqual(open(0));
  });

  it('closes, remembering the index', () => {
    expect(lightboxReducer(open(3), { type: 'close' }, 5)).toEqual({ open: false, index: 3 });
  });

  it('moves next/prev and wraps by default', () => {
    expect(lightboxReducer(open(1), { type: 'next' }, 3)).toEqual(open(2));
    expect(lightboxReducer(open(2), { type: 'next' }, 3)).toEqual(open(0));
    expect(lightboxReducer(open(0), { type: 'prev' }, 3)).toEqual(open(2));
  });

  it('stops at the ends when loop is false', () => {
    expect(lightboxReducer(open(2), { type: 'next' }, 3, { loop: false })).toEqual(open(2));
    expect(lightboxReducer(open(0), { type: 'prev' }, 3, { loop: false })).toEqual(open(0));
  });

  it('jumps to first and last', () => {
    expect(lightboxReducer(open(2), { type: 'first' }, 5)).toEqual(open(0));
    expect(lightboxReducer(open(1), { type: 'last' }, 5)).toEqual(open(4));
  });

  it('ignores navigation while closed', () => {
    for (const type of ['next', 'prev', 'first', 'last'] as const) {
      expect(lightboxReducer(closedLightbox, { type }, 5)).toBe(closedLightbox);
    }
  });

  it('recovers when the list shrinks under an open lightbox', () => {
    expect(lightboxReducer(open(4), { type: 'next' }, 2)).toEqual(open(0));
    expect(lightboxReducer(open(4), { type: 'prev' }, 2)).toEqual(open(0));
  });

  it('closes when there are no items', () => {
    expect(lightboxReducer(open(0), { type: 'next' }, 0)).toEqual(closedLightbox);
    expect(lightboxReducer(closedLightbox, { type: 'open', index: 0 }, 0)).toEqual(closedLightbox);
  });

  it('stays put with a single item', () => {
    expect(lightboxReducer(open(0), { type: 'next' }, 1)).toEqual(open(0));
    expect(lightboxReducer(open(0), { type: 'prev' }, 1)).toEqual(open(0));
  });
});

describe('lightboxKeyAction', () => {
  it('maps navigation keys', () => {
    expect(lightboxKeyAction('Escape')).toBe('close');
    expect(lightboxKeyAction('ArrowRight')).toBe('next');
    expect(lightboxKeyAction('ArrowLeft')).toBe('prev');
    expect(lightboxKeyAction('Home')).toBe('first');
    expect(lightboxKeyAction('End')).toBe('last');
  });

  it('ignores other keys', () => {
    expect(lightboxKeyAction('a')).toBeNull();
    expect(lightboxKeyAction('Tab')).toBeNull();
    expect(lightboxKeyAction('Enter')).toBeNull();
  });
});

describe('lightboxNeighbors', () => {
  it('returns wrapping neighbours', () => {
    expect(lightboxNeighbors(0, 5)).toEqual([4, 1]);
    expect(lightboxNeighbors(4, 5)).toEqual([3, 0]);
  });

  it('omits out-of-range neighbours when not looping', () => {
    expect(lightboxNeighbors(0, 5, { loop: false })).toEqual([1]);
    expect(lightboxNeighbors(4, 5, { loop: false })).toEqual([3]);
  });

  it('dedupes with two items and returns nothing for one', () => {
    expect(lightboxNeighbors(0, 2)).toEqual([1]);
    expect(lightboxNeighbors(0, 1)).toEqual([]);
    expect(lightboxNeighbors(0, 0)).toEqual([]);
  });
});
