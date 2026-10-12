import type { APIRoute } from 'astro';

export const prerender = false;

// Turned off. Every visitor signs in as the same demo account, so a shared
// server-side media folder would let any visitor list or delete everyone
// else's files. The Media Library keeps uploads in the visitor's own browser
// instead (lib/browser-media.ts). A client site mounts its own media API over
// its S3/R2 MediaStore; lib/media-store.ts remains as a local-disk example.
export const ALL: APIRoute = () => new Response('Not found', { status: 404 });
