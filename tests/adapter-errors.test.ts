import { describe, expect, it } from 'vitest';
import { SlugConflictError, PostNotFoundError } from '../src/adapters/types.js';

describe('SlugConflictError', () => {
  it('names the conflicting slug in the message and carries it as a field', () => {
    const err = new SlugConflictError('my-post');
    expect(err.slug).toBe('my-post');
    expect(err.message).toContain('my-post');
    expect(err.name).toBe('SlugConflictError');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('PostNotFoundError', () => {
  it('names the missing id in the message and carries it as a field', () => {
    const err = new PostNotFoundError('abc123');
    expect(err.id).toBe('abc123');
    expect(err.message).toContain('abc123');
    expect(err.name).toBe('PostNotFoundError');
    expect(err).toBeInstanceOf(Error);
  });
});
