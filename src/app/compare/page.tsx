import type { Metadata } from 'next';
import { CompareExplorer } from '@/components/compare/compare-explorer';
import {
  compareViewDescription,
  compareViewTitle,
  decodeCompareState,
  encodeCompareState,
} from '@/lib/compare-url-state';

// Per-view OpenGraph/Twitter tags so a shared link unfurls as the specific
// chart the user built. Crawlers don't run JS, so these must be in the
// server HTML — hence generateMetadata reading the same searchParams as the
// page. Title/description come from config only (no data reads, no
// statistical claim); the card image is a single static branded asset.
// metadataBase (set in the root layout) makes the relative URLs absolute.
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const state = decodeCompareState(await searchParams);
  const title = compareViewTitle(state);
  const description = compareViewDescription(state);
  const qs = encodeCompareState(state);
  const shareUrl = qs ? `/compare?${qs}` : '/compare';
  const image = {
    url: '/images/og/compare-card.png',
    width: 1200,
    height: 630,
    alt: 'Ground Truth Strata — compare platforms side by side',
  };
  return {
    title,
    description,
    alternates: { canonical: '/compare' },
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

// T3-B-Compare: the v4 two-step theme-picker explorer replaces the
// interim ranked-bar-tabs scaffold.
//
// Share feature: the explorer's full view (theme, question, platforms,
// wave, response type, x-axis zoom, breakdown, drill-down) is encoded in
// the query string. We decode + validate it server-side and seed the
// explorer's initial state, so a shared link opens exactly that view.
// Reading searchParams makes this route render per-request (negligible at
// this scale; same as /trends and /explore).
export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const initial = decodeCompareState(sp);
  return <CompareExplorer initial={initial} />;
}
