import type { MetadataRoute } from 'next';

// Served at /robots.txt (App Router file convention). metadataBase in the
// root layout supplies the absolute origin. /groups is an unlinked,
// provisional placeholder (proxy variable) so it's kept out of the index;
// everything else is crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: '/groups',
    },
    sitemap: 'https://strata.mattmotyl.com/sitemap.xml',
    host: 'https://strata.mattmotyl.com',
  };
}
