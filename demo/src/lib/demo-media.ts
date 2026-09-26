/**
 * Sample photos committed under public/demo-media/, so every deployment has
 * images to pick from. URLs are unprefixed; run them through withBase() when
 * sending them to the browser.
 */
export interface DemoMedia {
  url: string;
  name: string;
  /** Descriptive alt text: what's in the picture, not what it's for. */
  alt: string;
  bytes: number;
}

export const DEMO_MEDIA: readonly DemoMedia[] = [
  {
    url: '/demo-media/coastal-house.jpg',
    name: 'coastal-house.jpg',
    alt: 'A minimalist pale limestone house with tall dark-framed windows, set in windswept grass on a rocky coastline under an overcast sky, with a calm grey sea beyond.',
    bytes: 130252,
  },
  {
    url: '/demo-media/misty-forest-trail.jpg',
    name: 'misty-forest-trail.jpg',
    alt: 'A narrow dirt trail winding through a misty evergreen forest, lined with ferns and moss-covered boulders and trees.',
    bytes: 291190,
  },
  {
    url: '/demo-media/bread-pears-artichokes.jpg',
    name: 'bread-pears-artichokes.jpg',
    alt: 'Overhead view of a scored sourdough loaf, three ripe pears, two artichokes, fresh herbs, and a small bowl of flaky salt on a rumpled linen cloth.',
    bytes: 391960,
  },
  {
    url: '/demo-media/mug-and-vase.jpg',
    name: 'mug-and-vase.jpg',
    alt: 'A speckled cream-and-tan ceramic mug beside a small sage-green vase holding a single eucalyptus sprig, on a stone tabletop by a softly lit window.',
    bytes: 120685,
  },
  {
    url: '/demo-media/desk-notebook.jpg',
    name: 'desk-notebook.jpg',
    alt: 'A walnut desk with an open blank notebook and black pen, a sage-green hardcover book, and a small potted plant, in soft natural window light.',
    bytes: 134153,
  },
];

/** Find a demo photo by URL, tolerating a deployment base-path prefix. */
export function findDemoMedia(url: string): DemoMedia | undefined {
  const trimmed = url.trim();
  return DEMO_MEDIA.find((m) => trimmed === m.url || trimmed.endsWith(m.url));
}
