import type { Metadata } from 'next';
import { TrendsExplorer } from '@/components/charts/trends-explorer';
import {
  decodeTrendsState,
  encodeTrendsState,
  trendsViewCard,
  trendsViewDescription,
  trendsViewTitle,
} from '@/lib/trends-url-state';

// Per-view OpenGraph/Twitter tags so a shared /trends link unfurls as the
// specific view. Title + card are per-category (platform experiences /
// well-being / attitudes); both come from config (no data reads, no raw
// variable names). Crawlers don't run JS, so these must be in the server
// HTML — hence generateMetadata reading the same searchParams as the page.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const state = decodeTrendsState(await searchParams);
  const title = trendsViewTitle(state);
  const description = trendsViewDescription(state);
  const qs = encodeTrendsState(state);
  const shareUrl = qs ? `/trends?${qs}` : '/trends';
  const image = {
    url: trendsViewCard(state),
    width: 1200,
    height: 630,
    alt: `Ground Truth Strata — ${title.toLowerCase()}`,
  };
  return {
    title,
    description,
    alternates: { canonical: '/trends' },
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

// T3-B7: /trends opens on Finding 1 ("Who uses what?") by default and offers
// a category → question picker. The full view (category, question, and the
// active renderer's platform/zoom slice) is encoded in the query string for
// the share feature; we decode + validate it here and seed the explorer.
export default async function TrendsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const initial = decodeTrendsState(await searchParams);
  return <TrendsExplorer initial={initial} />;
}
