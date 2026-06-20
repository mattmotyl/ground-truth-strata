import type { Metadata } from 'next';
import { ExploreViews } from '@/components/charts/explore-views';
import {
  decodeExploreState,
  encodeExploreState,
  exploreViewDescription,
  exploreViewTitle,
} from '@/lib/explore-url-state';

// Per-view OpenGraph/Twitter tags so a shared /explore link unfurls as the
// specific view (pairs vs. matrix). Crawlers don't run JS, so these must be
// in the server HTML — hence generateMetadata reading the same searchParams
// as the page. Title/description are config-only (no data reads, and no raw
// variable names surfaced); the card image is a single static branded asset.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const state = decodeExploreState(await searchParams);
  const title = exploreViewTitle(state);
  const description = exploreViewDescription(state);
  const qs = encodeExploreState(state);
  const shareUrl = qs ? `/explore?${qs}` : '/explore';
  const image = {
    url: '/images/og/explore-card.png',
    width: 1200,
    height: 630,
    alt: 'Ground Truth Strata — explore how the findings relate',
  };
  return {
    title,
    description,
    alternates: { canonical: '/explore' },
    openGraph: {
      type: 'website',
      siteName: 'Ground Truth Strata',
      title,
      description,
      url: shareUrl,
      images: [image],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image.url],
    },
  };
}

// /explore offers two correlation views (see ExploreViews): Variable pairs
// over time (any two respondent-level variables) and the full Correlation
// matrix. The Platform correlations view is disabled in v0.1. The full view
// state (tab + each view's slice) is encoded in the query string for the
// share feature; we decode + validate it here and seed the explorer.
export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const initial = decodeExploreState(await searchParams);
  return <ExploreViews initial={initial} />;
}
