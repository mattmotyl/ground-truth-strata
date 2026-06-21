import type { MetadataRoute } from 'next';

// Served at /sitemap.xml (App Router file convention). Lists the canonical
// public pages so search engines can discover them. Deep-linked explorer
// views (query-param states) are intentionally omitted — they share a
// canonical with their base route. /groups is excluded (unlinked
// placeholder; also disallowed in robots.ts).
const BASE = 'https://strata.mattmotyl.com';

const ROUTES: Array<{ path: string; priority: number }> = [
  { path: '/', priority: 1 },
  { path: '/trends', priority: 0.8 },
  { path: '/platforms', priority: 0.8 },
  { path: '/compare', priority: 0.8 },
  { path: '/explore', priority: 0.8 },
  { path: '/about', priority: 0.5 },
  { path: '/glossary', priority: 0.5 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${BASE}${path}`,
    changeFrequency: 'monthly',
    priority,
  }));
}
